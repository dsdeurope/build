// V35 Platform API — central data store for 200+ sites/month pipeline
// KV schema: plt:boutiques, plt:boutique:{id}, plt:sites, plt:site:{id}, plt:jobs, plt:images, plt:domaines, plt:stats

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Content-Type': 'application/json',
};

const WORKERS = {
  SEQ:     'https://v35-sequenceur.ernestpedanou.workers.dev',
  ORCH:    'https://v35-orchestrateur.ernestpedanou.workers.dev',
  AGED:    'https://v35-aged-domain-finder.ernestpedanou.workers.dev',
  SKELETON:'https://v35-skeleton-builder.ernestpedanou.workers.dev',
  PALETTE: 'https://v35-color-palette.ernestpedanou.workers.dev',
  FACTORY: 'https://v35-site-factory.ernestpedanou.workers.dev',
  SERVER:  'https://v35-site-server.ernestpedanou.workers.dev',
  HEALTH:  'https://v35-domain-health-checker.ernestpedanou.workers.dev',
  RADAR:   'https://v35-radar.ernestpedanou.workers.dev',
  HUNTER:  'https://v35-domain-hunter.ernestpedanou.workers.dev',
};

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function ok(data, status=200) { return Response.json({ ok:true, ...data }, { status, headers: CORS }); }
function err(msg, status=400) { return Response.json({ ok:false, error:msg }, { status, headers: CORS }); }

async function kvList(env, prefix) {
  const raw = await env.KV.get(prefix); return raw ? JSON.parse(raw) : [];
}
async function kvSet(env, key, val, ttl=0) {
  const opts = ttl ? { expirationTtl: ttl } : {};
  await env.KV.put(key, JSON.stringify(val), opts);
}

// ── Router ────────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const [,, resource, id, sub] = url.pathname.split('/'); // /api/{resource}/{id}/{sub}
    const method = request.method;
    let body = {};
    if (method === 'POST' || method === 'PUT') {
      try { body = await request.json(); } catch {}
    }

    // ── /api/stats ───────────────────────────────────────────────────────────
    if (resource === 'stats') {
      const boutiques = await kvList(env, 'plt:boutiques');
      const sites = await kvList(env, 'plt:sites');
      const jobs = await kvList(env, 'plt:jobs');
      const domaines = await kvList(env, 'plt:domaines');
      const now = Date.now();
      const thisMonth = boutiques.filter(b => b.createdAt > now - 30*86400000);
      const sitesLive = sites.filter(s => s.status === 'live');
      const jobsDone = jobs.filter(j => j.status === 'done');
      return ok({ boutiques: boutiques.length, sites_total: sites.length, sites_live: sitesLive.length,
        jobs_total: jobs.length, jobs_done: jobsDone.length, domaines: domaines.length,
        boutiques_this_month: thisMonth.length,
        velocity: Math.round(thisMonth.length / 30 * 30), // per month
      });
    }

    // ── /api/monitoring ──────────────────────────────────────────────────────
    if (resource === 'monitoring') {
      const checks = await Promise.allSettled(
        Object.entries(WORKERS).map(async ([name, url]) => {
          const t0 = Date.now();
          try {
            const r = await fetch(url + (url.includes('radar')||url.includes('hunter') ? '' : ''), {
              method: 'GET', signal: AbortSignal.timeout(5000)
            });
            return { name, url, status: r.status < 500 ? 'up' : 'down', latency: Date.now()-t0 };
          } catch(e) { return { name, url, status: 'down', latency: Date.now()-t0, error: e.message }; }
        })
      );
      const workers = checks.map(r => r.status==='fulfilled' ? r.value : { name:'?', status:'error' });
      const up = workers.filter(w=>w.status==='up').length;
      return ok({ workers, up, total: workers.length, health: Math.round(up/workers.length*100) });
    }

    // ── /api/boutiques ───────────────────────────────────────────────────────
    if (resource === 'boutiques') {
      if (!id) {
        if (method === 'GET') {
          let list = await kvList(env, 'plt:boutiques');
          // filters
          const q = url.searchParams;
          if (q.get('type')) list = list.filter(b => b.type === q.get('type'));
          if (q.get('niche')) list = list.filter(b => b.niche === q.get('niche'));
          if (q.get('status')) list = list.filter(b => b.importStatus === q.get('status'));
          if (q.get('q')) { const s=q.get('q').toLowerCase(); list=list.filter(b=>b.domain.includes(s)); }
          if (q.get('sort')==='traffic') list.sort((a,b)=>(b.traffic||0)-(a.traffic||0));
          const page = Math.max(1,+q.get('page')||1), per = +q.get('per')||20;
          const total = list.length;
          return ok({ list: list.slice((page-1)*per, page*per), total, page, pages: Math.ceil(total/per) });
        }
        if (method === 'POST') {
          const list = await kvList(env, 'plt:boutiques');
          const boutique = {
            id: uid(), domain: body.domain, type: body.type||'shopify',
            niche: body.niche||'', theme: body.theme||'', category: body.category||'',
            traffic: body.traffic||0, collections: 0, products: 0,
            importStatus: 'pending', comment: body.comment||'',
            blueprint: null, sites: [], jobs: [], keywords: [], images: [],
            createdAt: Date.now(), updatedAt: Date.now(),
          };
          list.unshift(boutique);
          await kvSet(env, 'plt:boutiques', list);
          await kvSet(env, `plt:boutique:${boutique.id}`, boutique);
          return ok({ boutique }, 201);
        }
      }

      // /api/boutiques/:id
      const boutique = JSON.parse(await env.KV.get(`plt:boutique:${id}`) || 'null');
      if (!boutique && method==='GET') return err('Boutique not found', 404);

      if (!sub) {
        if (method === 'GET') return ok({ boutique });
        if (method === 'PUT') {
          Object.assign(boutique, body, { updatedAt: Date.now() });
          await kvSet(env, `plt:boutique:${id}`, boutique);
          const list = await kvList(env, 'plt:boutiques');
          const idx = list.findIndex(b=>b.id===id);
          if (idx>=0) list[idx]=boutique;
          await kvSet(env, 'plt:boutiques', list);
          return ok({ boutique });
        }
        if (method === 'DELETE') {
          const list = (await kvList(env, 'plt:boutiques')).filter(b=>b.id!==id);
          await kvSet(env, 'plt:boutiques', list);
          await env.KV.delete(`plt:boutique:${id}`);
          return ok({ deleted: id });
        }
      }

      // /api/boutiques/:id/scrape → trigger scraping via sequenceur
      if (sub === 'scrape') {
        const r = await fetch(WORKERS.SEQ, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action:'scrape-collections', domain: boutique.domain }),
          signal: AbortSignal.timeout(25000),
        });
        const d = await r.json();
        if (d.collections?.length) {
          boutique.blueprint = { source: boutique.domain, collections: d.collections, totalCollections: d.collections.length };
          boutique.collections = d.collections.length;
          boutique.products = d.collections.reduce((s,c)=>s+(c.products||0),0);
          boutique.importStatus = 'scraped';
          boutique.niches = d.niches||[];
          if (!boutique.niche && d.niches?.[0]) boutique.niche = d.niches[0];
          boutique.updatedAt = Date.now();
          await kvSet(env, `plt:boutique:${id}`, boutique);
        }
        return ok({ boutique, collections: d.collections?.length||0, error: d.error });
      }

      // /api/boutiques/:id/orchestrate → full pipeline
      if (sub === 'orchestrate') {
        const r = await fetch(WORKERS.ORCH, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ sourceDomain: boutique.domain, targetDomain: body.targetDomain||boutique.domain, niche: boutique.niche, languages: body.languages||['fr','de','es'], findAgedDomain: true }),
          signal: AbortSignal.timeout(60000),
        });
        const d = await r.json();
        boutique.orchestrateJobId = d.jobId;
        boutique.importStatus = 'orchestrating';
        await kvSet(env, `plt:boutique:${id}`, boutique);
        return ok(d);
      }

      return err('Unknown sub-resource', 404);
    }

    // ── /api/sites ───────────────────────────────────────────────────────────
    if (resource === 'sites') {
      if (!id) {
        if (method === 'GET') {
          let list = await kvList(env, 'plt:sites');
          const q = url.searchParams;
          if (q.get('niche')) list=list.filter(s=>s.niche===q.get('niche'));
          if (q.get('status')) list=list.filter(s=>s.status===q.get('status'));
          if (q.get('lang')) list=list.filter(s=>s.languages?.includes(q.get('lang')));
          const page=Math.max(1,+q.get('page')||1),per=+q.get('per')||20,total=list.length;
          return ok({ list:list.slice((page-1)*per,page*per), total, page, pages:Math.ceil(total/per) });
        }
        if (method === 'POST') {
          const list = await kvList(env, 'plt:sites');
          const site = { id:uid(), domain:body.domain, sourceDomain:body.sourceDomain, niche:body.niche||'', languages:body.languages||['fr'], status:body.status||'pending', fileCount:body.fileCount||0, palette:body.palette||{}, slug:body.slug||'', serverUrl:body.serverUrl||'', skeleton:body.skeleton||null, traffic:0, pages:body.pages||0, createdAt:Date.now(), updatedAt:Date.now() };
          list.unshift(site);
          await kvSet(env, 'plt:sites', list);
          await kvSet(env, `plt:site:${site.id}`, site);
          return ok({ site }, 201);
        }
      }
      if (method==='GET') { const s=JSON.parse(await env.KV.get(`plt:site:${id}`)||'null'); return s?ok({site:s}):err('Not found',404); }
      if (method==='PUT') {
        const s=JSON.parse(await env.KV.get(`plt:site:${id}`)||'null');
        if(!s) return err('Not found',404);
        Object.assign(s,body,{updatedAt:Date.now()});
        await kvSet(env,`plt:site:${id}`,s);
        const list=(await kvList(env,'plt:sites'));const idx=list.findIndex(x=>x.id===id);if(idx>=0)list[idx]=s;
        await kvSet(env,'plt:sites',list);
        return ok({site:s});
      }
    }

    // ── /api/jobs ────────────────────────────────────────────────────────────
    if (resource === 'jobs') {
      if (method === 'GET') {
        let list = await kvList(env, 'plt:jobs');
        const q=url.searchParams;
        if(q.get('type')) list=list.filter(j=>j.type===q.get('type'));
        if(q.get('status')) list=list.filter(j=>j.status===q.get('status'));
        if(q.get('site')) list=list.filter(j=>j.site===q.get('site'));
        const page=Math.max(1,+q.get('page')||1),per=30,total=list.length;
        return ok({list:list.slice((page-1)*per,page*per),total,page,pages:Math.ceil(total/per)});
      }
      if (method === 'POST') {
        const list = await kvList(env, 'plt:jobs');
        const job = { id:uid(), type:body.type||'collection_intro', promptNumero:body.promptNumero||'', prompt:body.prompt||'', langue:body.langue||'fr', pays:body.pays||'FR', site:body.site||'', status:'pending', response:'', score:null, createdAt:Date.now(), updatedAt:Date.now() };
        list.unshift(job);
        await kvSet(env,'plt:jobs',list);
        return ok({job},201);
      }
      if (method==='PUT'&&id) {
        const list=await kvList(env,'plt:jobs');
        const idx=list.findIndex(j=>j.id===id);
        if(idx<0) return err('Not found',404);
        Object.assign(list[idx],body,{updatedAt:Date.now()});
        await kvSet(env,'plt:jobs',list);
        return ok({job:list[idx]});
      }
    }

    // ── /api/domaines ────────────────────────────────────────────────────────
    if (resource === 'domaines') {
      if (method==='GET') {
        let list=await kvList(env,'plt:domaines');
        const q=url.searchParams;
        if(q.get('status')) list=list.filter(d=>d.status===q.get('status'));
        if(q.get('niche')) list=list.filter(d=>d.niche===q.get('niche'));
        return ok({list,total:list.length});
      }
      if (method==='POST') {
        const list=await kvList(env,'plt:domaines');
        const d={id:uid(),...body,createdAt:Date.now(),updatedAt:Date.now()};
        list.unshift(d);await kvSet(env,'plt:domaines',list);
        return ok({domaine:d},201);
      }
    }

    // ── /api/images ──────────────────────────────────────────────────────────
    if (resource === 'images') {
      if (method==='GET') { return ok({list:await kvList(env,'plt:images')}); }
      if (method==='POST') {
        const list=await kvList(env,'plt:images');
        const img={id:uid(),...body,addedAt:Date.now()};
        list.unshift(img);if(list.length>500)list.length=500;
        await kvSet(env,'plt:images',list);
        return ok({image:img},201);
      }
    }

    // ── /api/pipeline/run ────────────────────────────────────────────────────
    if (resource === 'pipeline' && id === 'run') {
      // Start full pipeline for a new site
      const { sourceDomain, targetDomain, niche, languages=['fr','de','es'] } = body;
      if (!sourceDomain||!targetDomain) return err('sourceDomain+targetDomain required');

      // Create boutique record
      const boutiques=await kvList(env,'plt:boutiques');
      const boutique={ id:uid(), domain:sourceDomain, type:'shopify', niche, importStatus:'running', collections:0, products:0, traffic:0, sites:[], createdAt:Date.now(), updatedAt:Date.now() };
      boutiques.unshift(boutique);
      await kvSet(env,'plt:boutiques',boutiques);
      await kvSet(env,`plt:boutique:${boutique.id}`,boutique);

      // Fire orchestrateur async
      const orchProm = fetch(WORKERS.ORCH,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({sourceDomain,targetDomain,niche,languages,findAgedDomain:true}),
        signal:AbortSignal.timeout(55000)
      }).then(r=>r.json()).catch(()=>null);

      const orchResult = await orchProm;
      if (orchResult?.jobId) {
        boutique.orchestrateJobId = orchResult.jobId;
        boutique.importStatus = orchResult.status||'running';
        await kvSet(env,`plt:boutique:${boutique.id}`,boutique);
      }

      return ok({ boutique, orchResult });
    }

    return err('Not found', 404);
  }
};
