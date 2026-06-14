// V35 Analytics — Server-side, zero cookie, RGPD compliant
// Pixel beacon: GET /p?s={slug}&u={path}&r={referrer}&t={title}
// GET /stats?s={slug}&days=7   → pageviews, top pages, top referrers
// GET /stats/all               → multi-site overview
// POST /event                  → custom events (add_to_cart, purchase)
// Stockage: KV pv:{slug}:{YYYY-MM-DD}:{path} = count (HyperLogLog approx via sampling)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const J = (d, s=200) => new Response(JSON.stringify(d), {status:s, headers:{...CORS,'Content-Type':'application/json'}});
const PX = () => new Response(
  'GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x00\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;',
  {headers:{...CORS,'Content-Type':'image/gif','Cache-Control':'no-store, no-cache'}}
);

// ── Helpers ───────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0,10);
const dayKey = (slug, date, path) => `pv:${slug}:${date}:${encodeURIComponent(path).slice(0,80)}`;
const evKey  = (slug, date, ev)  => `ev:${slug}:${date}:${ev}`;

function authOk(req, env) {
  const h = req.headers.get('Authorization') || '';
  const t = new URL(req.url).searchParams.get('token') || '';
  return !env.API_TOKEN || h === 'Bearer ' + env.API_TOKEN || t === env.API_TOKEN;
}

// ── Incrément atomic (KV n'a pas d'atomic increment → read-modify-write avec retry) ──
async function incr(kv, key, ttl=86400*90) {
  for(let i=0;i<2;i++){
    try{
      const v = parseInt(await kv.get(key)||'0');
      await kv.put(key, String(v+1), {expirationTtl:ttl});
      return v+1;
    }catch{}
  }
}

// ── Stats pour un slug sur N jours ───────────────────────────────────────────
async function getStats(kv, slug, days=7) {
  const dates = [];
  for(let i=0;i<days;i++){
    const d = new Date(Date.now()-i*86400000).toISOString().slice(0,10);
    dates.push(d);
  }

  // Lister toutes les clés pv:{slug}:{date}:* pour ces dates
  const pageMap = {};   // path → total views
  const dayMap  = {};   // date → total views
  let total = 0;

  await Promise.all(dates.map(async date => {
    const list = await kv.list({prefix:`pv:${slug}:${date}:`}).catch(()=>({keys:[]}));
    let dayTotal = 0;
    await Promise.all(list.keys.map(async k => {
      const v = parseInt(await kv.get(k.name)||'0');
      const path = decodeURIComponent(k.name.split(':').slice(3).join(':'));
      pageMap[path] = (pageMap[path]||0) + v;
      dayTotal += v;
    }));
    dayMap[date] = dayTotal;
    total += dayTotal;
  }));

  // Top referrers
  const refList = await kv.list({prefix:`ref:${slug}:`}).catch(()=>({keys:[]}));
  const refMap = {};
  await Promise.all(refList.keys.slice(0,50).map(async k => {
    const v = parseInt(await kv.get(k.name)||'0');
    const ref = decodeURIComponent(k.name.split(':').slice(2).join(':'));
    refMap[ref] = (refMap[ref]||0)+v;
  }));

  // Top events
  const evList = await kv.list({prefix:`ev:${slug}:`}).catch(()=>({keys:[]}));
  const evMap = {};
  await Promise.all(evList.keys.map(async k=>{
    const v = parseInt(await kv.get(k.name)||'0');
    const ev = k.name.split(':').slice(3).join(':');
    evMap[ev] = (evMap[ev]||0)+v;
  }));

  const topPages = Object.entries(pageMap).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([path,views])=>({path,views}));
  const topRefs  = Object.entries(refMap).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([ref,hits])=>({ref,hits}));
  const timeline = dates.map(d=>({date:d,views:dayMap[d]||0})).reverse();

  return {slug,days,total,avg_per_day:Math.round(total/days),timeline,top_pages:topPages,top_referrers:topRefs,events:evMap};
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:CORS});
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/,'');
    const kv = env.KV;

    // ── GET /p — pixel beacon (public, no auth) ───────────────────────────────
    if(path==='/p') {
      const slug  = (url.searchParams.get('s')||'').slice(0,60);
      const ppath = (url.searchParams.get('u')||'/').slice(0,200);
      const ref   = (url.searchParams.get('r')||'').replace(/^https?:\/\//,'').split('/')[0].slice(0,100);

      if(slug && kv) {
        const d = today();
        // Pageview par page
        await incr(kv, dayKey(slug,d,ppath), 86400*90).catch(()=>{});
        // Pageview total du site par jour
        await incr(kv, `pv:${slug}:${d}:__total__`, 86400*90).catch(()=>{});
        // Référent (domaine uniquement)
        if(ref && ref!==slug && !ref.includes(slug)) {
          await incr(kv, `ref:${slug}:${ref}`, 86400*90).catch(()=>{});
        }
      }
      return PX();
    }

    // ── POST /event — custom events (add_to_cart, purchase, signup…) ─────────
    if(path==='/event' && request.method==='POST') {
      let body={}; try{body=await request.json();}catch{}
      const {slug, event, value=1} = body;
      if(slug && event && kv) {
        await incr(kv, evKey(slug, today(), event.slice(0,40)), 86400*90).catch(()=>{});
      }
      return J({ok:true});
    }

    // ── Stats endpoints — auth requis ────────────────────────────────────────
    if(!authOk(request,env)) return J({error:'Unauthorized'},401);

    if(path==='/stats') {
      const slug = url.searchParams.get('s');
      if(!slug) return J({error:'s= requis'},400);
      const days = Math.min(parseInt(url.searchParams.get('days')||'7'),90);
      return J(await getStats(kv,slug,days));
    }

    if(path==='/stats/all') {
      // Liste tous les slugs distincts depuis les clés KV
      const list = await kv.list({prefix:'pv:'}).catch(()=>({keys:[]}));
      const slugSet = new Set(list.keys.map(k=>k.name.split(':')[1]).filter(Boolean));
      const stats = await Promise.all([...slugSet].slice(0,20).map(s=>getStats(kv,s,7)));
      return J({sites:stats.length, stats});
    }

    if(path==='/health') return J({status:'up',worker:'v35-analytics'});

    return J({error:'Not found'},404);
  }
};
