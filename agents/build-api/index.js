// V35 Build API — enhanced platform API for build.zenithlab.net

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Content-Type': 'application/json',
};

const WORKERS = {
  BUILD_API:'https://v35-build-api.ernestpedanou.workers.dev',
  SEQ:      'https://v35-sequenceur.ernestpedanou.workers.dev',
  ORCH:     'https://v35-orchestrateur.ernestpedanou.workers.dev',
  AGED:     'https://v35-aged-domain-finder.ernestpedanou.workers.dev',
  SKELETON: 'https://v35-skeleton-builder.ernestpedanou.workers.dev',
  PALETTE:  'https://v35-color-palette.ernestpedanou.workers.dev',
  FACTORY:  'https://v35-site-factory.ernestpedanou.workers.dev',
  SERVER:   'https://v35-site-server.ernestpedanou.workers.dev',
  HEALTH:   'https://v35-domain-health-checker.ernestpedanou.workers.dev',
  RADAR:    'https://v35-radar.ernestpedanou.workers.dev',
  HUNTER:   'https://v35-domain-hunter.ernestpedanou.workers.dev',
};

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function ok(data, status=200) { return Response.json({ ok:true, ...data }, { status, headers: CORS }); }
function err(msg, status=400) { return Response.json({ ok:false, error:msg }, { status, headers: CORS }); }
async function kvList(env, key) { const r = await env.KV.get(key); return r ? JSON.parse(r) : []; }
async function kvSet(env, key, val) { await env.KV.put(key, JSON.stringify(val)); }

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const [,, resource, id, sub] = url.pathname.split('/');
    const method = request.method;
    let body = {};
    if (method === 'POST' || method === 'PUT') { try { body = await request.json(); } catch {} }

    // ── /api/stats ───────────────────────────────────────────────────────────
    if (resource === 'stats') {
      const [boutiques, sites, jobs, domaines] = await Promise.all([
        kvList(env,'plt:boutiques'), kvList(env,'plt:sites'),
        kvList(env,'plt:jobs'), kvList(env,'plt:domaines'),
      ]);
      const now = Date.now(), month = 30*86400000;
      const thisMonth = boutiques.filter(b=>b.createdAt>now-month);
      return ok({
        boutiques: boutiques.length, footprints: boutiques.filter(b=>b.footprint).length,
        sites_total: sites.length, sites_live: sites.filter(s=>s.status==='live').length,
        jobs_total: jobs.length, jobs_done: jobs.filter(j=>j.status==='done').length,
        domaines: domaines.length, domaines_aged: domaines.filter(d=>d.aged).length,
        boutiques_this_month: thisMonth.length,
        velocity: thisMonth.length,
      });
    }

    // ── /api/pipeline/status ─────────────────────────────────────────────────
    if (resource === 'pipeline' && id === 'status') {
      const [jobs, boutiques] = await Promise.all([kvList(env,'plt:jobs'), kvList(env,'plt:boutiques')]);
      const today = new Date(); today.setHours(0,0,0,0);
      const todayJobs = jobs.filter(j=>j.createdAt>today.getTime());
      const running = boutiques.filter(b=>['orchestrating','running'].includes(b.importStatus));
      return ok({
        jobs_today: todayJobs.length, jobs_running: running.length,
        jobs_done: jobs.filter(j=>j.status==='done').length,
        jobs_pending: jobs.filter(j=>j.status==='pending').length,
        success_rate: jobs.length ? Math.round(jobs.filter(j=>j.status==='done').length/jobs.length*100) : 0,
        running_boutiques: running.map(b=>({id:b.id,domain:b.domain,status:b.importStatus,updatedAt:b.updatedAt})),
      });
    }

    // ── /api/import/csv ──────────────────────────────────────────────────────
    if (resource === 'import' && id === 'csv') {
      if (method !== 'POST') return err('POST required');
      const list = await kvList(env,'plt:boutiques');
      const existing = new Set(list.map(b=>b.domain));
      const created = [];
      for (const row of (body.rows||[])) {
        if (!row.domain || existing.has(row.domain)) continue;
        const b = {
          id:uid(), domain:row.domain, type:row.type||'shopify',
          niche:row.niche||'', traffic:+row.traffic||0, comment:row.comment||'',
          footprint:true, importStatus:'pending', blueprint:null,
          sites:[], jobs:[], keywords:[], images:[], collections:0, products:0,
          createdAt:Date.now(), updatedAt:Date.now(),
        };
        list.unshift(b);
        await kvSet(env,`plt:boutique:${b.id}`,b);
        created.push(b);
        existing.add(b.domain);
      }
      await kvSet(env,'plt:boutiques',list);
      return ok({ created:created.length, skipped:(body.rows||[]).length-created.length });
    }

    // ── /api/aged-domains/score ──────────────────────────────────────────────
    if (resource === 'aged-domains' && id === 'score') {
      if (method !== 'POST') return err('POST required');
      const { ageDays=0, snapshotCount=1, tld='' } = body;
      const PREMIUM = ['.fr','.com','.de','.es','.it','.net','.be','.ch'];
      const tldScore = PREMIUM.includes(tld) ? 30 : 10;
      const ageScore = Math.min(40, Math.round(ageDays/3650*40));
      const snapScore = Math.min(30, Math.round(Math.log10(snapshotCount+1)*12));
      return ok({ score:ageScore+snapScore+tldScore, breakdown:{age:ageScore,snapshots:snapScore,tld:tldScore} });
    }

    // ── /api/monitoring ──────────────────────────────────────────────────────
    if (resource === 'monitoring') {
      const checks = await Promise.allSettled(
        Object.entries(WORKERS).map(async ([name, wurl]) => {
          const t0 = Date.now();
          try {
            const r = await fetch(wurl, { method:'GET', signal:AbortSignal.timeout(5000) });
            return { name, url:wurl, status:r.status<500?'up':'down', latency:Date.now()-t0 };
          } catch(e) { return { name, url:wurl, status:'down', latency:Date.now()-t0, error:e.message }; }
        })
      );
      const workers = checks.map(r=>r.status==='fulfilled'?r.value:{name:'?',status:'error'});
      const up = workers.filter(w=>w.status==='up').length;
      return ok({ workers, up, total:workers.length, health:Math.round(up/workers.length*100) });
    }

    // ── /api/boutiques ───────────────────────────────────────────────────────
    if (resource === 'boutiques' || resource === 'footprints') {
      const isFootprint = resource === 'footprints';
      if (!id) {
        if (method === 'GET') {
          let list = await kvList(env,'plt:boutiques');
          if (isFootprint) list = list.filter(b=>b.footprint);
          const q = url.searchParams;
          if (q.get('type')) list=list.filter(b=>b.type===q.get('type'));
          if (q.get('niche')) list=list.filter(b=>b.niche===q.get('niche'));
          if (q.get('status')) list=list.filter(b=>b.importStatus===q.get('status'));
          if (q.get('q')) { const s=q.get('q').toLowerCase(); list=list.filter(b=>b.domain?.includes(s)); }
          if (q.get('sort')==='traffic') list.sort((a,b)=>(b.traffic||0)-(a.traffic||0));
          const page=Math.max(1,+q.get('page')||1), per=+q.get('per')||25, total=list.length;
          return ok({ list:list.slice((page-1)*per,page*per), total, page, pages:Math.ceil(total/per) });
        }
        if (method === 'POST') {
          const list = await kvList(env,'plt:boutiques');
          const b = {
            id:uid(), domain:body.domain, type:body.type||'shopify',
            niche:body.niche||'', theme:body.theme||'', traffic:body.traffic||0,
            collections:0, products:0, importStatus:'pending', comment:body.comment||'',
            footprint:isFootprint||body.footprint||false,
            blueprint:null, sites:[], jobs:[], keywords:[], images:[],
            createdAt:Date.now(), updatedAt:Date.now(),
          };
          list.unshift(b);
          await kvSet(env,'plt:boutiques',list);
          await kvSet(env,`plt:boutique:${b.id}`,b);
          return ok({boutique:b},201);
        }
      }
      const boutique = JSON.parse(await env.KV.get(`plt:boutique:${id}`)||'null');
      if (!boutique && method==='GET') return err('Not found',404);
      if (!sub) {
        if (method==='GET') return ok({boutique});
        if (method==='PUT') {
          Object.assign(boutique,body,{updatedAt:Date.now()});
          await kvSet(env,`plt:boutique:${id}`,boutique);
          const list=await kvList(env,'plt:boutiques');
          const i=list.findIndex(b=>b.id===id); if(i>=0) list[i]=boutique;
          await kvSet(env,'plt:boutiques',list);
          return ok({boutique});
        }
        if (method==='DELETE') {
          const list=(await kvList(env,'plt:boutiques')).filter(b=>b.id!==id);
          await kvSet(env,'plt:boutiques',list);
          await env.KV.delete(`plt:boutique:${id}`);
          return ok({deleted:id});
        }
      }
      if (sub==='scrape') {
        const r = await fetch(WORKERS.SEQ,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'scrape-collections',domain:boutique.domain}),signal:AbortSignal.timeout(25000)});
        const d = await r.json();
        if (d.collections?.length) {
          boutique.blueprint={source:boutique.domain,collections:d.collections,totalCollections:d.collections.length};
          boutique.collections=d.collections.length;
          boutique.products=d.collections.reduce((s,c)=>s+(c.products||0),0);
          boutique.importStatus='scraped';
          if (d.niches?.[0] && !boutique.niche) boutique.niche=d.niches[0];
          boutique.updatedAt=Date.now();
          await kvSet(env,`plt:boutique:${id}`,boutique);
          const list=await kvList(env,'plt:boutiques');
          const i=list.findIndex(b=>b.id===id); if(i>=0) list[i]=boutique;
          await kvSet(env,'plt:boutiques',list);
        }
        return ok({boutique,collections:d.collections?.length||0,error:d.error});
      }
      if (sub==='orchestrate') {
        const r = await fetch(WORKERS.ORCH,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceDomain:boutique.domain,targetDomain:body.targetDomain||boutique.domain,niche:boutique.niche,languages:body.languages||['fr','de','es'],findAgedDomain:true}),signal:AbortSignal.timeout(60000)});
        const d = await r.json();
        boutique.orchestrateJobId=d.jobId; boutique.importStatus='orchestrating';
        await kvSet(env,`plt:boutique:${id}`,boutique);
        return ok(d);
      }
      return err('Unknown sub-resource',404);
    }

    // ── /api/sites ───────────────────────────────────────────────────────────
    if (resource === 'sites') {
      if (!id) {
        if (method==='GET') {
          let list=await kvList(env,'plt:sites');
          const q=url.searchParams;
          if(q.get('niche')) list=list.filter(s=>s.niche===q.get('niche'));
          if(q.get('status')) list=list.filter(s=>s.status===q.get('status'));
          if(q.get('lang')) list=list.filter(s=>s.languages?.includes(q.get('lang')));
          const page=Math.max(1,+q.get('page')||1),per=+q.get('per')||25,total=list.length;
          return ok({list:list.slice((page-1)*per,page*per),total,page,pages:Math.ceil(total/per)});
        }
        if (method==='POST') {
          const list=await kvList(env,'plt:sites');
          const s={id:uid(),domain:body.domain,sourceDomain:body.sourceDomain,niche:body.niche||'',languages:body.languages||['fr'],status:body.status||'pending',fileCount:0,palette:{},serverUrl:body.serverUrl||'',pages:body.pages||0,createdAt:Date.now(),updatedAt:Date.now()};
          list.unshift(s); await kvSet(env,'plt:sites',list); await kvSet(env,`plt:site:${s.id}`,s);
          return ok({site:s},201);
        }
      }
      if (method==='GET') { const s=JSON.parse(await env.KV.get(`plt:site:${id}`)||'null'); return s?ok({site:s}):err('Not found',404); }
      if (method==='PUT') {
        const s=JSON.parse(await env.KV.get(`plt:site:${id}`)||'null'); if(!s) return err('Not found',404);
        Object.assign(s,body,{updatedAt:Date.now()}); await kvSet(env,`plt:site:${id}`,s);
        const list=await kvList(env,'plt:sites'); const i=list.findIndex(x=>x.id===id); if(i>=0) list[i]=s;
        await kvSet(env,'plt:sites',list); return ok({site:s});
      }
    }

    // ── /api/jobs ────────────────────────────────────────────────────────────
    if (resource === 'jobs') {
      if (method==='GET') {
        let list=await kvList(env,'plt:jobs');
        const q=url.searchParams;
        if(q.get('type')) list=list.filter(j=>j.type===q.get('type'));
        if(q.get('status')) list=list.filter(j=>j.status===q.get('status'));
        if(q.get('site')) list=list.filter(j=>j.site===q.get('site'));
        const page=Math.max(1,+q.get('page')||1),per=30,total=list.length;
        return ok({list:list.slice((page-1)*per,page*per),total,page,pages:Math.ceil(total/per)});
      }
      if (method==='POST') {
        const list=await kvList(env,'plt:jobs');
        const j={id:uid(),type:body.type||'collection_intro',promptNumero:body.promptNumero||'',prompt:body.prompt||'',langue:body.langue||'fr',pays:body.pays||'FR',site:body.site||'',status:'pending',response:'',score:null,createdAt:Date.now(),updatedAt:Date.now()};
        list.unshift(j); await kvSet(env,'plt:jobs',list); return ok({job:j},201);
      }
      if (method==='PUT'&&id) {
        const list=await kvList(env,'plt:jobs'); const i=list.findIndex(j=>j.id===id);
        if(i<0) return err('Not found',404);
        Object.assign(list[i],body,{updatedAt:Date.now()}); await kvSet(env,'plt:jobs',list);
        return ok({job:list[i]});
      }
    }

    // ── /api/domaines ────────────────────────────────────────────────────────
    if (resource === 'domaines') {
      if (!id) {
        if (method==='GET') {
          let list=await kvList(env,'plt:domaines');
          const q=url.searchParams;
          if(q.get('status')) list=list.filter(d=>d.status===q.get('status'));
          if(q.get('niche')) list=list.filter(d=>d.niche===q.get('niche'));
          if(q.get('aged')) list=list.filter(d=>d.aged);
          return ok({list,total:list.length});
        }
        if (method==='POST') {
          const list=await kvList(env,'plt:domaines');
          const d={id:uid(),...body,createdAt:Date.now(),updatedAt:Date.now()};
          list.unshift(d); await kvSet(env,'plt:domaines',list); return ok({domaine:d},201);
        }
      }
      if (method==='PUT'&&id) {
        const list=await kvList(env,'plt:domaines'); const i=list.findIndex(d=>d.id===id);
        if(i<0) return err('Not found',404);
        Object.assign(list[i],body,{updatedAt:Date.now()}); await kvSet(env,'plt:domaines',list);
        return ok({domaine:list[i]});
      }
      if (method==='DELETE'&&id) {
        const list=(await kvList(env,'plt:domaines')).filter(d=>d.id!==id);
        await kvSet(env,'plt:domaines',list); return ok({deleted:id});
      }
    }

    // ── /api/images ──────────────────────────────────────────────────────────
    if (resource === 'images') {
      if (method==='GET') return ok({list:await kvList(env,'plt:images')});
      if (method==='POST') {
        const list=await kvList(env,'plt:images');
        const img={id:uid(),...body,addedAt:Date.now()};
        list.unshift(img); if(list.length>500) list.length=500;
        await kvSet(env,'plt:images',list); return ok({image:img},201);
      }
    }

    // ── /api/pipeline/run ────────────────────────────────────────────────────
    if (resource === 'pipeline' && id === 'run') {
      const {sourceDomain,targetDomain,niche,languages=['fr','de','es']} = body;
      if (!sourceDomain||!targetDomain) return err('sourceDomain+targetDomain required');
      const boutiques=await kvList(env,'plt:boutiques');
      const b={id:uid(),domain:sourceDomain,type:'shopify',niche,importStatus:'running',collections:0,products:0,traffic:0,footprint:true,sites:[],createdAt:Date.now(),updatedAt:Date.now()};
      boutiques.unshift(b); await kvSet(env,'plt:boutiques',boutiques); await kvSet(env,`plt:boutique:${b.id}`,b);
      const orchResult = await fetch(WORKERS.ORCH,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceDomain,targetDomain,niche,languages,findAgedDomain:true}),signal:AbortSignal.timeout(55000)}).then(r=>r.json()).catch(()=>null);
      if (orchResult?.jobId) { b.orchestrateJobId=orchResult.jobId; b.importStatus=orchResult.status||'running'; await kvSet(env,`plt:boutique:${b.id}`,b); }
      return ok({boutique:b,orchResult});
    }

    return err('Not found',404);
  }
};
