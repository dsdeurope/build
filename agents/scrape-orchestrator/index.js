// V35 Scrape Orchestrator — Pipeline de scraping avec 3 jobs concurrents max
// Jobs stockés en KV (progress temps réel) + outputs en R2 (privé, jamais public)
// Architecture: POST /jobs → ctx.waitUntil(runJob) → chain via releaseAndStartNext
//
// POST /jobs            — créer un job (démarre immédiatement si slot libre, sinon queue)
// GET  /jobs            — liste + statuts + progress (UI poll toutes les 2s)
// GET  /jobs/:id        — détail complet avec logs
// GET  /jobs/:id/download?format=json|csv — télécharger output depuis R2 (protégé)
// DELETE /jobs/:id      — annuler + nettoyer
// GET  /stats           — slots actifs / queue / terminés
// GET  /health

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Content-Type': 'application/json' };
const J = d => Response.json({ ok: true,  ...d }, { headers: CORS });
const E = (m, s=400) => Response.json({ ok: false, error: m }, { status: s, headers: CORS });

const CLONE_INTEL = 'https://v35-clone-intel.ernestpedanou.workers.dev';
const MAX = 3;

// ── CMS detection locale (rapide, pas de fetch) ───────────────────────────────
function detectCMS(html) {
  const h = html.toLowerCase();
  if (h.includes('/cdn.shopify.com/') || h.includes('myshopify.com')) return 'shopify';
  if (h.includes('woocommerce') || h.includes('/wp-content/plugins/woo')) return 'woocommerce';
  if (h.includes('prestashop') || h.includes('/modules/blockcart/')) return 'prestashop';
  if (h.includes('wix.com')) return 'wix';
  if (h.includes('webflow.com')) return 'webflow';
  return 'custom';
}

// ── CSV produits ──────────────────────────────────────────────────────────────
function toCSV(products = []) {
  const hdr = 'title,handle,type,price,compare_price,variants,images,available,ali_query,url';
  const rows = products.map(p => [p.title, p.handle, p.type||'', p.price, p.compare_price||'', p.variants_count||p.variants?.length||1, p.images_count||p.images?.length||0, p.available?'yes':'no', p.ali_query||'', p.url||''].map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(','));
  return [hdr, ...rows].join('\n');
}

// ── KV helpers ─────────────────────────────────────────────────────────────────
const IDX_KEY = 'scrape:jobs';
const JOB_KEY = id => `scrape:job:${id}`;

async function getIdx(kv) { const r = await kv.get(IDX_KEY); return r ? JSON.parse(r) : []; }
async function saveIdx(kv, idx) { await kv.put(IDX_KEY, JSON.stringify(idx.slice(0,200)), { expirationTtl: 86400*30 }); }
async function getJob(kv, id) { const r = await kv.get(JOB_KEY(id)); return r ? JSON.parse(r) : null; }
async function saveJob(kv, job) { await kv.put(JOB_KEY(job.id), JSON.stringify(job), { expirationTtl: 86400*7 }); }

async function log(kv, id, msg) {
  const job = await getJob(kv, id); if (!job) return;
  if (!job.logs) job.logs = [];
  job.logs.unshift({ ts: new Date().toISOString().slice(11,19), msg });
  if (job.logs.length > 80) job.logs.length = 80;
  await saveJob(kv, job);
}

async function setStep(kv, id, name, status, data={}) {
  const job = await getJob(kv, id); if (!job) return;
  const s = job.steps.find(x => x.name === name);
  if (s) { s.status = status; if (status==='running') s.started_at=Date.now(); if (status==='done'||status==='failed') { s.ended_at=Date.now(); s.duration_ms=s.ended_at-(s.started_at||s.ended_at); } Object.assign(s, data); }
  const done = job.steps.filter(x=>x.status==='done').length;
  job.progress = Math.round(done/job.steps.length*100);
  job.current_step = name;
  await saveJob(kv, job);
}

function mkJob(domain, options={}) {
  return {
    id: `job_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    domain: domain.replace(/^https?:\/\//,'').replace(/\/.*$/,'').toLowerCase(),
    status: 'queued', progress: 0, current_step: null,
    created_at: new Date().toISOString(), started_at: null, completed_at: null,
    cms: null, has_output: false, error: null, logs: [],
    options,
    steps: [
      { name:'cms_detection', label:'Détection CMS',      status:'pending' },
      { name:'products',      label:'Produits',           status:'pending' },
      { name:'seo_audit',     label:'Audit SEO',          status:'pending' },
      { name:'design_stack',  label:'Design & Stack',     status:'pending' },
      { name:'storing',       label:'Stockage R2',        status:'pending' },
      { name:'content_gen',   label:'Contenu 14-points',  status:'pending' },
    ],
  };
}

// ── Draft gate — valide chaque produit avant stockage ─────────────────────────
function validateProducts(products=[]) {
  const ready=[], draft=[], error_log=[];
  for (const p of products) {
    const issues=[];
    if (!p.title)                              issues.push('missing_title');
    if (!p.images?.length && !p.images_count)  issues.push('missing_images');
    if (!p.body_html && !p.description)        issues.push('missing_description');
    if (issues.length) {
      draft.push({ ...p, status:'draft', draft_reasons:issues });
      error_log.push({ url:p.url||p.handle||'?', issues });
    } else {
      ready.push({ ...p, status:'ready' });
    }
  }
  return { ready, draft, error_log };
}

// ── Job runner (ctx.waitUntil) ─────────────────────────────────────────────────
async function runJob(jobId, env, ctx) {
  const kv = env.KV;
  try {
    const job = await getJob(kv, jobId);
    if (!job || job.status === 'cancelled') return;
    const { domain } = job;

    // Update index to running
    const idx = await getIdx(kv); const e = idx.find(x=>x.id===jobId);
    if (e) { e.status='running'; e.started_at=new Date().toISOString(); } await saveIdx(kv, idx);
    job.status='running'; job.started_at=new Date().toISOString(); await saveJob(kv, job);
    await log(kv, jobId, `Démarrage scraping de ${domain}`);

    const H = { 'Content-Type':'application/json' };
    const post = (path, body) => fetch(`${CLONE_INTEL}${path}`, { method:'POST', headers:H, body:JSON.stringify(body), signal:AbortSignal.timeout(60000) }).then(r=>r.json()).catch(e=>({ ok:false, error:e.message }));

    // ── Step 1: CMS
    await setStep(kv, jobId, 'cms_detection', 'running');
    await log(kv, jobId, `Fetch homepage ${domain}…`);
    let cms='custom', homeHtml='';
    try { const r=await fetch(`https://${domain}`, { headers:{'User-Agent':'Mozilla/5.0'}, signal:AbortSignal.timeout(12000) }); if(r.ok) homeHtml=await r.text(); cms=detectCMS(homeHtml); } catch(err) { await log(kv, jobId, `Avertissement fetch direct : ${err.message}`); }
    await setStep(kv, jobId, 'cms_detection', 'done', { cms });
    await log(kv, jobId, `CMS détecté : ${cms}`);
    // Update cms in index
    const idx2=await getIdx(kv); const e2=idx2.find(x=>x.id===jobId); if(e2) e2.cms=cms; await saveIdx(kv, idx2);

    // ── Step 2: Products
    await setStep(kv, jobId, 'products', 'running');
    await log(kv, jobId, `Extraction produits via API (${cms})…`);
    const prodData = await post('/products', { domain });
    const nProd = prodData.products?.length||0, nCol = prodData.collections?.length||0;
    await setStep(kv, jobId, 'products', 'done', { count: nProd, collections: nCol });
    await log(kv, jobId, `${nProd} produits · ${nCol} collections`);

    // ── Step 3: SEO audit
    await setStep(kv, jobId, 'seo_audit', 'running');
    await log(kv, jobId, `Audit SEO (homepage + ${Math.min(3,nCol)} collections)…`);
    const seoData = await post('/seo', { domain, collections: (prodData.collections||[]).slice(0,3) });
    const nIssues = seoData.improvements?.length||0, nCrit = seoData.critical||0;
    await setStep(kv, jobId, 'seo_audit', 'done', { issues: nIssues, critical: nCrit });
    await log(kv, jobId, `SEO : ${nCrit} critiques · ${nIssues} issues total`);

    // ── Step 4: Design + Stack (parallel)
    await setStep(kv, jobId, 'design_stack', 'running');
    await log(kv, jobId, `Analyse design + détection stack technique…`);
    const [designData, stackData] = await Promise.all([ post('/design',{domain}), post('/stack',{domain}) ]);
    const nTools = Object.values(stackData||{}).flat().filter(v=>typeof v==='string').length;
    await setStep(kv, jobId, 'design_stack', 'done', { tools: nTools, fonts: designData.fonts?.length||0 });
    await log(kv, jobId, `${nTools} outils détectés · fonts: ${(designData.fonts||[]).join(', ')||'—'}`);

    // ── Step 5: Stockage R2 (avec gate Draft)
    await setStep(kv, jobId, 'storing', 'running');
    await log(kv, jobId, `Validation produits + stockage sécurisé R2…`);
    const { ready, draft, error_log } = validateProducts(prodData.products||[]);
    if (draft.length) await log(kv, jobId, `⚠ ${draft.length} produits en brouillon (contenu incomplet) — voir error_log`);
    const output = { job_id:jobId, domain, cms, generated_at:new Date().toISOString(), stats:{ products:nProd, ready:ready.length, draft:draft.length, collections:nCol, seo_issues:nIssues, seo_critical:nCrit, stack_tools:nTools }, products:{ ready, draft, error_log }, seo:seoData, design:designData, stack:stackData };

    if (env.R2) {
      await Promise.all([
        env.R2.put(`jobs/${jobId}/output.json`, JSON.stringify(output), { httpMetadata:{ contentType:'application/json', cacheControl:'private, no-store' } }),
        env.R2.put(`jobs/${jobId}/products.csv`, toCSV(ready), { httpMetadata:{ contentType:'text/csv; charset=utf-8', cacheControl:'private, no-store' } }),
        draft.length && env.R2.put(`jobs/${jobId}/drafts.json`, JSON.stringify({ draft, error_log }), { httpMetadata:{ contentType:'application/json', cacheControl:'private, no-store' } }),
      ].filter(Boolean));
      await log(kv, jobId, `Stocké R2 : ${ready.length} prêts · ${draft.length} brouillons · products.csv`);
    } else {
      await log(kv, jobId, `⚠ R2 non configuré — output non stocké`);
    }
    await setStep(kv, jobId, 'storing', 'done', { ready: ready.length, draft: draft.length });

    // ── Step 6: Content 14-points (async fire-and-forget, 3 produits max)
    await setStep(kv, jobId, 'content_gen', 'running');
    const topReady = ready.slice(0, 3);
    const niche = job.options?.niche || 'mode';
    const lang  = job.options?.lang  || 'fr';
    const CONTENT_AI = 'https://v35-content-ai.ernestpedanou.workers.dev';
    ctx.waitUntil((async () => {
      let generated = 0;
      for (let i = 0; i < topReady.length; i++) {
        const p = topReady[i];
        try {
          const r = await fetch(`${CONTENT_AI}/api/product-full`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product: p, niche, lang, brandName: domain }),
            signal: AbortSignal.timeout(45000),
          });
          const d = await r.json();
          if (d.ok && env.KV) {
            await env.KV.put(`content:${domain}:${(p.handle||p.title||`p${i}`).slice(0,40)}`, JSON.stringify(d), { expirationTtl: 86400 * 30 });
            generated++;
          }
        } catch {}
        if (i < topReady.length - 1) await new Promise(r => setTimeout(r, 2000));
      }
      const jc = await getJob(kv, jobId);
      if (jc) {
        const s = jc.steps.find(x => x.name === 'content_gen');
        if (s) { s.status = 'done'; s.generated = generated; s.ended_at = Date.now(); }
        await saveJob(kv, jc);
      }
      await log(kv, jobId, `✅ Contenu 14-points : ${generated}/${topReady.length} produits`);
    })());

    // ── Completed
    const elapsed = Math.round((Date.now()-new Date(job.created_at).getTime())/1000);
    await log(kv, jobId, `✅ Terminé en ${elapsed}s — ${ready.length} prêts · ${draft.length} brouillons`);
    const idx3=await getIdx(kv); const e3=idx3.find(x=>x.id===jobId);
    if(e3){e3.status='completed';e3.completed_at=new Date().toISOString();e3.products=nProd;e3.elapsed=elapsed;} await saveIdx(kv,idx3);
    const jFinal=await getJob(kv,jobId); if(jFinal){jFinal.status='completed';jFinal.completed_at=new Date().toISOString();jFinal.has_output=!!env.R2;jFinal.progress=100;await saveJob(kv,jFinal);}

  } catch(err) {
    await log(kv, jobId, `❌ Erreur : ${err.message}`);
    const jErr=await getJob(kv,jobId); if(jErr){jErr.status='failed';jErr.error=err.message;await saveJob(kv,jErr);}
    const iErr=await getIdx(kv); const eErr=iErr.find(x=>x.id===jobId); if(eErr)eErr.status='failed'; await saveIdx(kv,iErr);
  } finally {
    await releaseAndStartNext(kv, env, ctx);
  }
}

async function releaseAndStartNext(kv, env, ctx) {
  const idx = await getIdx(kv);
  const running = idx.filter(j=>j.status==='running').length;
  const next = idx.find(j=>j.status==='queued');
  if (running < MAX && next) {
    next.status='running'; next.started_at=new Date().toISOString(); await saveIdx(kv, idx);
    const nj = await getJob(kv, next.id); if(nj){nj.status='running'; await saveJob(kv,nj);}
    ctx.waitUntil(runJob(next.id, env, ctx));
  }
}

// ── ROUTER ────────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    if (request.method==='OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const segs = url.pathname.replace(/^\/|\/$/g,'').split('/');
    const [s0, s1, s2] = segs;
    const kv = env.KV;
    let body={};
    if (request.method==='POST') { try{body=await request.json();}catch{} }

    if (url.pathname==='/health') return J({ worker:'v35-scrape-orchestrator', max_concurrent:MAX, r2:!!env.R2 });

    // GET /stats
    if (url.pathname==='/stats') {
      const idx = await getIdx(kv);
      return J({ running:idx.filter(j=>j.status==='running').length, queued:idx.filter(j=>j.status==='queued').length, completed:idx.filter(j=>j.status==='completed').length, failed:idx.filter(j=>j.status==='failed').length, total:idx.length, slots_free: MAX-idx.filter(j=>j.status==='running').length });
    }

    // GET /jobs
    if (url.pathname==='/jobs' && request.method==='GET') {
      const idx = await getIdx(kv);
      // For running jobs, include last 15 logs inline
      const enriched = await Promise.all(idx.slice(0,50).map(async j => {
        if (j.status==='running'||j.status==='queued') {
          const detail = await getJob(kv, j.id);
          return { ...j, steps: detail?.steps||[], logs: (detail?.logs||[]).slice(0,15), current_step: detail?.current_step, progress: detail?.progress||0 };
        }
        return j;
      }));
      return J({ jobs: enriched, running: enriched.filter(j=>j.status==='running').length, queued: enriched.filter(j=>j.status==='queued').length });
    }

    // POST /jobs — create
    if (url.pathname==='/jobs' && request.method==='POST') {
      const domain = (body.domain||'').replace(/^https?:\/\//,'').replace(/\/.*$/,'').toLowerCase();
      if (!domain) return E('domain required');
      // Rate limit : 3 shops max par jour
      const dayKey = `scrape:daily:${new Date().toISOString().slice(0,10)}`;
      const dayCount = parseInt(await kv.get(dayKey) || '0');
      if (dayCount >= 3) return E('Limite journalière atteinte (3 shops/jour). Réessayez demain.', 429);
      await kv.put(dayKey, String(dayCount + 1), { expirationTtl: 86400 });
      const idx = await getIdx(kv);
      if (idx.find(j=>j.domain===domain&&(j.status==='running'||j.status==='queued'))) return E('Ce domaine est déjà en cours');
      const job = mkJob(domain, body.options||{});
      const running = idx.filter(j=>j.status==='running').length;
      if (running < MAX) { job.status='running'; job.started_at=new Date().toISOString(); }
      await saveJob(kv, job);
      idx.unshift({ id:job.id, domain:job.domain, status:job.status, created_at:job.created_at, cms:null, products:null });
      await saveIdx(kv, idx);
      if (job.status==='running') ctx.waitUntil(runJob(job.id, env, ctx));
      return J({ job_id:job.id, status:job.status, message: job.status==='running' ? 'Démarré' : 'En file d\'attente' });
    }

    // GET /jobs/:id
    if (s0==='jobs' && s1 && !s2 && request.method==='GET') {
      const job = await getJob(kv, s1);
      if (!job) return E('Job introuvable', 404);
      return J({ job });
    }

    // GET /jobs/:id/download
    if (s0==='jobs' && s1 && s2==='download') {
      const job = await getJob(kv, s1);
      if (!job) return E('Job introuvable', 404);
      if (!job.has_output) return E('Output non disponible — job non terminé ou R2 non configuré');
      if (!env.R2) return E('R2 non configuré');
      const fmt = url.searchParams.get('format')||'json';
      const key = fmt==='csv' ? `jobs/${s1}/products.csv` : `jobs/${s1}/output.json`;
      const obj = await env.R2.get(key);
      if (!obj) return E('Fichier introuvable dans R2', 404);
      const ct = fmt==='csv' ? 'text/csv; charset=utf-8' : 'application/json';
      const filename = fmt==='csv' ? `${job.domain}-products.csv` : `${job.domain}-clone-brief.json`;
      return new Response(obj.body, {
        headers: { 'Content-Type':ct, 'Content-Disposition':`attachment; filename="${filename}"`, 'Access-Control-Allow-Origin':'*', 'Cache-Control':'private, no-store' }
      });
    }

    // DELETE /jobs/:id
    if (s0==='jobs' && s1 && request.method==='DELETE') {
      const job = await getJob(kv, s1);
      if (!job) return E('Job introuvable', 404);
      await kv.delete(JOB_KEY(s1));
      if (env.R2) { await Promise.all([env.R2.delete(`jobs/${s1}/output.json`), env.R2.delete(`jobs/${s1}/products.csv`)]).catch(()=>{}); }
      const idx = await getIdx(kv); await saveIdx(kv, idx.filter(j=>j.id!==s1));
      return J({ deleted: true });
    }

    return E('Not found', 404);
  },
};
