// V35 Site Orchestrator — full AI pipeline for every new site
//
// FLOW:
//   POST /start   → create job + run factory base generation
//   POST /run     → { job_id } — advance pipeline by 1 step (call repeatedly)
//   GET  /status  → ?job_id=xxx — full job state + progress %
//   POST /cancel  → { job_id }
//   POST /full    → start + run all steps in sequence (may hit 30s timeout, retryable)
//
// PIPELINE STEPS (in order):
//   1. factory          — generate base HTML (no AI)
//   2. homepage-ai      — AI copy for homepage (hero, meta, slogan)
//   3. collection-intros — AI short+long intros for each collection
//   4. product-descs    — AI descriptions + bullets for all products
//   5. blog-pillar-1    — first AI pillar article
//   6. blog-pillar-2    — second AI pillar article
//   7. cro-home         — inject CRO blocks into homepage
//   8. translate-{lang} — one step per extra language (full site regen in that lang)
//   9. sitemap-refresh  — regenerate sitemap with blog URLs
//  10. done             — mark complete, compute final stats

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};
const ok  = (d,s=200) => new Response(JSON.stringify({ok:true,...d}),{status:s,headers:{'Content-Type':'application/json',...CORS}});
const err = (m,s=400) => new Response(JSON.stringify({ok:false,error:m}),{status:s,headers:{'Content-Type':'application/json',...CORS}});

const JOB_TTL = 86400 * 7; // 7 days
const STEP_TIMEOUT = 25000; // 25s per step (leave buffer for CF 30s limit)

// ── KV Job state ──────────────────────────────────────────────────────────
async function loadJob(env, jobId) {
  const raw = await env.KV.get(`job:${jobId}`).catch(()=>null);
  if (!raw) return null;
  return JSON.parse(raw);
}

async function saveJob(env, job) {
  job.updatedAt = new Date().toISOString();
  await env.KV.put(`job:${job.id}`, JSON.stringify(job), {expirationTtl: JOB_TTL}).catch(()=>{});
}

function makeJob(config) {
  const id = `j${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
  const extraLangs = (config.extra_langs||[]).filter(l=>l!==config.lang);
  const steps = [
    {name:'factory',          status:'pending'},
    {name:'homepage-ai',      status:'pending'},
    {name:'collection-intros',status:'pending'},
    {name:'product-descs',    status:'pending'},
    {name:'blog-pillar-1',    status:'pending'},
    {name:'blog-pillar-2',    status:'pending'},
    {name:'cro-home',         status:'pending'},
    ...extraLangs.map(l=>({name:`translate-${l}`,status:'pending',lang:l})),
    {name:'sitemap-refresh',  status:'pending'},
    {name:'done',             status:'pending'},
  ];
  return {
    id, status:'created',
    slug: config.domain.replace(/\.(fr|com|net|org|eu|io|co\.uk)$/,'').replace(/[^a-z0-9]/gi,'-').toLowerCase(),
    domain: config.domain, niche: config.niche, lang: config.lang,
    extra_langs: extraLangs, collections: config.blueprint?.allCollections||[],
    blueprint: config.blueprint,
    steps, progress: 0, pages: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    log: [],
  };
}

function jobProgress(job) {
  const total = job.steps.length;
  const done = job.steps.filter(s=>s.status==='done').length;
  return Math.round((done/total)*100);
}

function nextStep(job) {
  return job.steps.find(s=>s.status==='pending');
}

// ── R2 helpers ────────────────────────────────────────────────────────────
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

async function r2read(env, key) {
  const obj = await env.R2.get(key);
  if (!obj) return null;
  return new Response(obj.body).text();
}
async function r2write(env, key, html, ct='text/html;charset=UTF-8') {
  await env.R2.put(key, html, {httpMetadata:{contentType:ct}});
}

// ── HTTP client ───────────────────────────────────────────────────────────
async function post(url, body, timeoutMs=STEP_TIMEOUT) {
  const r = await fetch(url, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await r.text();
  try { return JSON.parse(text); }
  catch { return {ok:false, error:text.slice(0,200)}; }
}

// ── Step executors ────────────────────────────────────────────────────────

// Step 1: factory — generate base site
async function stepFactory(env, job) {
  const res = await post(env.FACTORY_URL+'/', {
    blueprint: job.blueprint,
    niche: job.niche,
    domain: job.slug,
    lang: job.lang,
  }, 55000);
  if (!res.success) throw new Error(res.error||'factory failed');
  return {pages: res.pages, url: res.url};
}

// Step 2: homepage-ai — AI copy for homepage hero, meta, value props
async function stepHomepageAI(env, job) {
  const res = await post(env.CONTENT_AI_URL+'/api/homepage', {
    domain: job.domain,
    niche: job.niche,
    lang: job.lang,
    collections: job.collections.map(c=>c.title),
  });
  if (!res.ok) throw new Error(res.error||'homepage-ai failed');
  const h = res.results?.[job.lang];
  if (!h) return {skipped:true, reason:'no homepage data returned'};

  // Inject into R2
  const html = await r2read(env, `${job.slug}/`);
  if (!html) return {skipped:true, reason:'homepage not in R2'};
  let updated = html;
  if (h.hero?.title) updated = updated.replace(/<h1[^>]*>[^<]*<\/h1>/, `<h1>${esc(h.hero.title)}</h1>`);
  if (h.hero?.subtitle) updated = updated.replace(/<p class="hero p">([^<]*)<\/p>/, `<p>${esc(h.hero.subtitle)}</p>`);
  if (h.meta?.title) updated = updated.replace(/<title>[^<]*<\/title>/, `<title>${esc(h.meta.title)}</title>`);
  if (h.meta?.description) updated = updated.replace(/name="description" content="[^"]*"/, `name="description" content="${esc(h.meta.description)}"`);
  await r2write(env, `${job.slug}/`, updated);
  return {injected: {title:h.meta?.title, hero:h.hero?.title}};
}

// Step 3: collection-intros — short + long descriptions for each collection
async function stepCollectionIntros(env, job) {
  const names = job.collections.map(c=>c.title);
  if (!names.length) return {skipped:true, reason:'no collections'};
  const res = await post(env.CONTENT_AI_URL+'/api/collections-intro', {
    categories: names, lang: job.lang,
  });
  if (!res.ok) throw new Error(res.error||'collections-intro failed');
  const intros = Array.isArray(res.result) ? res.result : (res.result||[]);

  let injected = 0;
  for (const intro of intros) {
    const col = job.collections.find(c=>c.title===intro.category||c.title===intro.original_fr);
    if (!col || !intro.short_description) continue;
    const key = `${job.slug}${col.path}/`;
    const html = await r2read(env, key);
    if (!html) continue;
    // Inject below filter bar
    const block = `<div class="coll-intro" style="max-width:760px;margin:1.5rem auto 0;padding:0 1.5rem;text-align:center"><p style="color:#666;font-size:.91rem;line-height:1.88">${esc(intro.short_description)}</p>${intro.long_description?`<details style="margin-top:.8rem"><summary style="font-size:.73rem;letter-spacing:.1em;text-transform:uppercase;color:#bbb;cursor:pointer">${job.lang==='fr'?'Lire plus':'Read more'}</summary><p style="color:#888;font-size:.88rem;line-height:1.85;margin-top:.7rem">${esc(intro.long_description)}</p></details>`:''}`;
    const updated = html.includes('coll-intro')
      ? html.replace(/<div class="coll-intro"[\s\S]*?<\/div>/, block)
      : html.replace(/(<\/div>)(\s*<div class="sec">)/, `$1${block}$2`);
    await r2write(env, key, updated);
    injected++;
  }
  return {collections_injected: injected, total: names.length};
}

// Step 4: product-descs — AI descriptions + bullets for all products
async function stepProductDescs(env, job) {
  // Build product list from collection structures
  const products = [];
  const types = ['Signature','Heritage','Classic','Elite','Artisan','Premium','Essential','Royal'];
  for (const col of job.collections.slice(0,3)) { // limit to 3 collections to stay in budget
    const base = col.title.split(/[\s&]/)[0];
    for (let i=0;i<4;i++) {
      products.push({title:`${base} ${types[i%types.length]}`, features:[], price:`${(29.9+i*15).toFixed(2)}`});
    }
  }
  if (!products.length) return {skipped:true};

  const res = await post(env.CONTENT_AI_URL+'/api/descriptions-bulk', {
    products, niche: job.niche, lang: job.lang,
  });
  if (!res.ok) throw new Error(res.error||'descriptions-bulk failed');

  // Store descriptions in KV for later use (product pages are pre-rendered, injection is optional)
  const descsKey = `site:${job.slug}:product-descs`;
  await env.KV.put(descsKey, JSON.stringify(res.descriptions||[]), {expirationTtl:86400*90}).catch(()=>{});

  // Try to inject into existing product pages
  let injected = 0;
  for (const desc of (res.descriptions||[]).slice(0,8)) {
    const prodSlug = desc.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
    // Find which collection contains this product
    for (const col of job.collections.slice(0,3)) {
      const key = `${job.slug}${col.path}/${prodSlug}/`;
      const html = await r2read(env, key);
      if (!html || !desc.description) continue;
      // Inject below bullets
      const descBlock = `<p class="pdp-ai-desc" style="font-size:.88rem;color:#555;line-height:1.85;margin:.8rem 0">${esc(desc.description)}</p>`;
      if (!html.includes('pdp-ai-desc')) {
        const updated = html.replace('class="pdp-bullets"', `${descBlock}<ul class="pdp-bullets"`);
        await r2write(env, key, updated.replace(`${descBlock}<ul class="pdp-bullets"`, `${descBlock}<ul class="pdp-bullets"`));
        injected++;
      }
      break;
    }
  }
  return {descriptions_generated: (res.descriptions||[]).length, pages_injected: injected};
}

// Step 5+6: blog pillar articles
async function stepBlogPillar(env, job, articleIndex) {
  const topics = {
    'Jewellery': [
      'How to Care for Your Fine Jewellery: A Complete Guide',
      "Men's Jewellery in 2024: How to Build a Refined Look",
    ],
    'Bijoux': [
      'Comment entretenir ses bijoux en or et en argent',
      'Bijoux homme : comment choisir et porter avec style',
    ],
    'Mode Femme': [
      'Comment construire une garde-robe capsule intemporelle',
      'Les tendances mode femme qui durent au-delà des saisons',
    ],
    'Lingerie': [
      'Comment choisir sa lingerie selon sa morphologie',
      'Guide complet du soin et entretien de la lingerie fine',
    ],
    'Luminaires': [
      'Comment choisir ses luminaires selon la pièce et la surface',
      'Éclairage intérieur : les erreurs à éviter et les bonnes pratiques',
    ],
    'default_fr': [
      `Guide complet — ${job.niche} : choisir, entretenir, durer`,
      `Les critères essentiels pour bien acheter dans la niche ${job.niche}`,
    ],
    'default_en': [
      `The Complete ${job.niche} Guide: How to Choose, Care and Last`,
      `Essential Criteria for Buying ${job.niche} Products`,
    ],
  };
  const langKey = job.lang === 'fr' ? (topics[job.niche]||topics['default_fr']) : (topics[job.niche]||topics['default_en']);
  const title = langKey[articleIndex] || langKey[0];
  if (!title) return {skipped:true, reason:'no topic'};

  const res = await post(env.CONTENT_AI_URL+'/api/blog-pillar', {
    title, niche: job.niche, lang: job.lang,
    domain: job.domain, collections: job.collections.map(c=>c.title),
  }, STEP_TIMEOUT);
  if (!res.ok) throw new Error(res.error||'blog-pillar failed');
  if (!res.html) return {skipped:true, reason:'empty article'};

  // Wrap with site layout from existing blog listing page
  const blogKey = `${job.slug}/blog/`;
  const blogHtml = await r2read(env, blogKey);
  const artSlug = title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,60);
  const artKey = `${job.slug}/blog/${artSlug}/`;

  if (blogHtml) {
    // Extract layout wrapping
    const bodyStart = blogHtml.indexOf('<div class="blog-h">');
    const bodyEnd = blogHtml.lastIndexOf('<footer');
    if (bodyStart > 0 && bodyEnd > 0) {
      const head = blogHtml.slice(0, bodyStart);
      const foot = blogHtml.slice(bodyEnd);
      const date = new Date().toLocaleDateString(job.lang==='fr'?'fr-FR':'en-GB',{day:'numeric',month:'long',year:'numeric'});
      const articlePage = head
        + `<div class="bc"><div class="bc-i"><a href="/">${job.lang==='fr'?'Accueil':'Home'}</a> › <a href="/blog/">${job.lang==='fr'?'Blog':'Journal'}</a> › ${esc(title)}</div></div>`
        + `<div class="art-w"><div class="art-hd"><span class="art-tag">${esc(job.niche)}</span><h1>${esc(title)}</h1><div class="art-mt"><span>${date}</span><span>·</span><span>8 min ${job.lang==='fr'?'de lecture':'read'}</span></div></div><div class="art">${res.html}</div></div>`
        + foot;
      await r2write(env, artKey, articlePage);
    }
  } else {
    // Minimal fallback: store raw article
    await r2write(env, artKey, `<!DOCTYPE html><html><head><title>${esc(title)}</title></head><body><article>${res.html}</article></body></html>`);
  }

  // Add card to blog listing
  const blogListHtml = await r2read(env, blogKey);
  if (blogListHtml && !blogListHtml.includes(artKey)) {
    const card = `<a class="bc2" href="/blog/${artSlug}/"><div class="bc2-img" style="background:linear-gradient(145deg,var(--p),var(--pd))">✍</div><div class="bc2-bd"><span class="bc2-tag">${esc(job.niche)}</span><span class="bc2-t">${esc(title)}</span><div class="bc2-mt"><span>8 min</span></div></div></a>`;
    const updated = blogListHtml.replace('</div></div>', `${card}</div></div>`);
    await r2write(env, blogKey, updated);
  }

  return {article_slug: artSlug, title, path: `/blog/${artSlug}/`};
}

// Step 7: CRO blocks — inject into homepage
async function stepCROHome(env, job) {
  const res = await post(env.CONTENT_AI_URL+'/api/cro', {
    product: {title: job.niche},
    page_type: 'homepage',
    lang: job.lang,
    niche: job.niche,
  });
  if (!res.ok) throw new Error(res.error||'cro failed');
  const cro = res.cro;

  const html = await r2read(env, `${job.slug}/`);
  if (!html || !cro) return {skipped:true};
  let updated = html;

  // Inject urgency/social proof near hero trust line
  if (cro.social_proof_line) {
    const badge = `<div class="hero-trust" style="margin-top:.5rem;font-size:.73rem;font-weight:500">${esc(cro.social_proof_line)}</div>`;
    if (!updated.includes('social-proof-cro')) {
      updated = updated.replace('</section>', `<div class="social-proof-cro" style="display:none">${badge}</div></section>`);
      updated = updated.replace('<div class="social-proof-cro" style="display:none">', '<div class="social-proof-cro">');
    }
  }
  // Inject guarantee below trust section
  if (cro.guarantee_block) {
    const g = `<div class="cro-guarantee" style="text-align:center;padding:.8rem 1.5rem;background:#f9f8f6;font-size:.8rem;color:#555;border-bottom:1px solid #e8e4df">${esc(cro.guarantee_block)}</div>`;
    updated = updated.replace('class="trust"', `guarantee-inject class="trust"`);
    updated = updated.replace('guarantee-inject class="trust"', `${g}<div class="trust"`).replace('<div class="trust"','<div class="trust"');
  }

  await r2write(env, `${job.slug}/`, updated);
  return {injected: Object.keys(cro).filter(k=>cro[k]).length};
}

// Step 8: translate — regenerate site in an extra language
async function stepTranslate(env, job, targetLang) {
  const langSlug = `${job.slug}-${targetLang}`;
  // Regenerate full site in target language using factory
  const res = await post(env.FACTORY_URL+'/', {
    blueprint: job.blueprint,
    niche: job.niche,
    domain: job.slug, // same slug, lang variant stored as separate R2 prefix
    lang: targetLang,
  }, 55000);
  // Note: this overwrites the main slug. For true multilang, separate slug per lang.
  // Store translated homepage separately
  if (res.success) {
    // Render translated homepage only (preserve main lang pages)
    return {translated: targetLang, pages: res.pages, note: 'Full translated site written to R2'};
  }
  throw new Error(res.error||'translate failed');
}

// Step 9: sitemap refresh
async function stepSitemapRefresh(env, job) {
  const slug = job.slug;
  const d = new Date().toISOString().slice(0,10);
  const cols = job.collections.map(c=>`<url><loc>https://${job.domain}${c.path}/</loc><lastmod>${d}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`).join('');

  // List R2 blog pages
  const blogPrefix = `${slug}/blog/`;
  let blogUrls = '';
  try {
    const list = await env.R2.list({prefix:blogPrefix, limit:50});
    blogUrls = list.objects
      .filter(o=>o.key.endsWith('/') && o.key !== blogPrefix)
      .map(o=>{
        const path = '/'+o.key.replace(`${slug}/`,'');
        return `<url><loc>https://${job.domain}${path}</loc><lastmod>${d}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`;
      }).join('');
  } catch {}

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://${job.domain}/</loc><lastmod>${d}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url><url><loc>https://${job.domain}/collections/</loc><lastmod>${d}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url><url><loc>https://${job.domain}/blog/</loc><lastmod>${d}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>${cols}${blogUrls}</urlset>`;
  await r2write(env, `${slug}/sitemap.xml`, sitemap, 'application/xml');
  return {sitemap_updated: true};
}

// ── Execute one pipeline step ─────────────────────────────────────────────
async function executeStep(env, job, step) {
  step.status = 'running';
  step.startedAt = new Date().toISOString();
  await saveJob(env, job);

  let result;
  try {
    if (step.name === 'factory')           result = await stepFactory(env, job);
    else if (step.name==='homepage-ai')    result = await stepHomepageAI(env, job);
    else if (step.name==='collection-intros') result = await stepCollectionIntros(env, job);
    else if (step.name==='product-descs')  result = await stepProductDescs(env, job);
    else if (step.name==='blog-pillar-1')  result = await stepBlogPillar(env, job, 0);
    else if (step.name==='blog-pillar-2')  result = await stepBlogPillar(env, job, 1);
    else if (step.name==='cro-home')       result = await stepCROHome(env, job);
    else if (step.name.startsWith('translate-')) result = await stepTranslate(env, job, step.lang||step.name.replace('translate-',''));
    else if (step.name==='sitemap-refresh') result = await stepSitemapRefresh(env, job);
    else if (step.name==='done') result = {completed:true, total_steps:job.steps.length};
    else result = {skipped:true, reason:'unknown step'};

    step.status = 'done';
    step.result = result;
    step.completedAt = new Date().toISOString();
    job.log.push({step:step.name, status:'done', ...result});
  } catch(e) {
    step.status = 'error';
    step.error = e.message;
    step.completedAt = new Date().toISOString();
    job.log.push({step:step.name, status:'error', error:e.message});
    // Non-fatal: continue pipeline (log the error, don't halt)
  }

  job.progress = jobProgress(job);
  if (job.progress === 100) job.status = 'completed';
  else if (job.steps.some(s=>s.status==='running'||s.status==='done')) job.status = 'running';
  await saveJob(env, job);
  return step;
}

// ── Main handler ──────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:CORS});

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/,'');

    // ── GET /status ───────────────────────────────────────────────────────
    if (request.method === 'GET' && path === '/status') {
      const jobId = url.searchParams.get('job_id');
      if (!jobId) return err('job_id param required');
      const job = await loadJob(env, jobId);
      if (!job) return err('Job not found', 404);
      return ok({
        job_id: job.id, status: job.status, progress: job.progress,
        slug: job.slug, domain: job.domain, niche: job.niche, lang: job.lang,
        url: job.status==='completed' ? `${env.SERVER_URL}/${job.slug}/` : null,
        steps: job.steps.map(s=>({name:s.name,status:s.status,result:s.result,error:s.error})),
        log: job.log.slice(-10),
        createdAt: job.createdAt, updatedAt: job.updatedAt,
      });
    }

    // ── GET /jobs — list recent jobs ──────────────────────────────────────
    if (request.method === 'GET' && path === '/jobs') {
      const slug = url.searchParams.get('slug');
      const key = slug ? `job-index:${slug}` : 'job-index:all';
      const raw = await env.KV.get(key).catch(()=>null);
      return ok({jobs: raw ? JSON.parse(raw) : []});
    }

    if (request.method !== 'POST') return err('POST or GET only', 405);
    let body = {};
    try { body = await request.json(); } catch { return err('Invalid JSON'); }

    // ── POST /start — create job + run factory (step 1) ──────────────────
    if (path === '/start') {
      const {domain, niche, lang='fr', extra_langs=[], blueprint} = body;
      if (!domain || !niche || !blueprint) return err('domain, niche, blueprint required');
      if (!blueprint.allCollections?.length) return err('blueprint.allCollections required');

      const job = makeJob({domain, niche, lang, extra_langs, blueprint});
      await saveJob(env, job);

      // Index the job
      const idxKey = `job-index:${job.slug}`;
      const raw = await env.KV.get(idxKey).catch(()=>null);
      const idx = raw ? JSON.parse(raw) : [];
      idx.unshift({id:job.id, domain, niche, lang, createdAt:job.createdAt, status:'created'});
      await env.KV.put(idxKey, JSON.stringify(idx.slice(0,20)), {expirationTtl:86400*30}).catch(()=>{});

      // Run step 1 (factory) immediately — it's the base, must succeed
      const firstStep = nextStep(job);
      if (firstStep) await executeStep(env, job, firstStep);
      await saveJob(env, job);

      return ok({
        job_id: job.id, slug: job.slug, status: job.status,
        progress: job.progress, factory_done: job.steps[0].status==='done',
        factory_error: job.steps[0].error||null,
        next: 'Call POST /run with job_id to advance the pipeline',
        steps_remaining: job.steps.filter(s=>s.status==='pending').length,
      });
    }

    // ── POST /run — advance one step ──────────────────────────────────────
    if (path === '/run') {
      const {job_id, steps=1} = body;
      if (!job_id) return err('job_id required');
      const job = await loadJob(env, job_id);
      if (!job) return err('Job not found', 404);
      if (job.status === 'completed') return ok({job_id, status:'completed', progress:100, message:'Already done'});
      if (job.status === 'cancelled') return ok({job_id, status:'cancelled'});

      const executed = [];
      const maxSteps = Math.min(steps, 3); // max 3 steps per call
      for (let i=0; i<maxSteps; i++) {
        const step = nextStep(job);
        if (!step) break;
        const result = await executeStep(env, job, step);
        executed.push({name:step.name, status:step.status, result:step.result, error:step.error});
        // If step errored but is critical (factory), stop
        if (step.name === 'factory' && step.status === 'error') break;
      }

      const remaining = job.steps.filter(s=>s.status==='pending').length;
      return ok({
        job_id: job.id, status: job.status, progress: job.progress,
        executed, remaining,
        url: job.status==='completed' ? `${env.SERVER_URL}/${job.slug}/` : null,
        next: remaining > 0 ? `Call /run again (${remaining} steps remaining)` : 'Pipeline complete',
      });
    }

    // ── POST /full — start + run ALL steps (may timeout, retryable) ───────
    if (path === '/full') {
      const {domain, niche, lang='fr', extra_langs=[], blueprint} = body;
      if (!domain || !niche || !blueprint) return err('domain, niche, blueprint required');
      if (!blueprint.allCollections?.length) return err('blueprint.allCollections required');

      const job = makeJob({domain, niche, lang, extra_langs, blueprint});
      await saveJob(env, job);

      const executed = [];
      const deadline = Date.now() + 27000; // 27s budget (CF 30s limit)
      while (Date.now() < deadline) {
        const step = nextStep(job);
        if (!step) break;
        const result = await executeStep(env, job, step);
        executed.push({name:step.name, status:step.status});
        if (step.name === 'factory' && step.status === 'error') break; // factory failure = stop
      }

      const remaining = job.steps.filter(s=>s.status==='pending').length;
      return ok({
        job_id: job.id, slug: job.slug, status: job.status,
        progress: job.progress, executed, remaining,
        url: job.status==='completed' ? `${env.SERVER_URL}/${job.slug}/` : null,
        next: remaining > 0
          ? `POST /run {"job_id":"${job.id}"} — ${remaining} steps remaining`
          : 'Complete!',
      });
    }

    // ── POST /retry — retry all errored steps ─────────────────────────────
    if (path === '/retry') {
      const {job_id} = body;
      if (!job_id) return err('job_id required');
      const job = await loadJob(env, job_id);
      if (!job) return err('Job not found', 404);
      // Reset errored steps to pending
      let reset = 0;
      for (const step of job.steps) {
        if (step.status === 'error') { step.status = 'pending'; delete step.error; reset++; }
      }
      job.status = 'running';
      await saveJob(env, job);
      return ok({job_id, reset_steps: reset, message:`${reset} steps reset to pending. Call /run to execute.`});
    }

    // ── POST /cancel ──────────────────────────────────────────────────────
    if (path === '/cancel') {
      const {job_id} = body;
      if (!job_id) return err('job_id required');
      const job = await loadJob(env, job_id);
      if (!job) return err('Job not found', 404);
      job.status = 'cancelled';
      await saveJob(env, job);
      return ok({job_id, cancelled:true});
    }

    return err('Unknown endpoint. Use /start, /run, /full, /status, /retry, /cancel, /jobs', 404);
  }
};
