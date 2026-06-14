// Inlined helpers (lib/seo.js + lib/logger.js absent)
function buildSiloStructure(links){
  const silos={ecommerce:[],marketing:[],tech:[],local:[],other:[]};
  for(const u of links){
    try{const h=new URL(u).hostname;
      if(/shop|store|boutique|bijou|mode|deco|maison/.test(h))silos.ecommerce.push(u);
      else if(/blog|news|media|press|seo/.test(h))silos.marketing.push(u);
      else if(/tech|dev|api|code/.test(h))silos.tech.push(u);
      else if(/\.fr$|\.de$|\.es$|\.it$/.test(h))silos.local.push(u);
      else silos.other.push(u);
    }catch{}
  }
  return silos;
}
async function logInfo(env,worker,event,data){
  try{await env.KV.put('log:'+worker+':'+Date.now(),JSON.stringify({worker,event,data,ts:new Date().toISOString()}),{expirationTtl:86400*7});}catch{}
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const respond = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

const NK = {
  'Lingerie':['lingerie','dessous','soutien','culotte','bra','swimwear','maillot'],
  'Mode Femme':['robe','femme','mode','fashion','vetement','jupe','top'],
  'Mode Homme':['homme','men','menswear','costume','chemise'],
  'Luminaires':['lampe','lumiere','luminaire','eclairage','plafonnier','applique'],
  'Décoration':['deco','decoration','maison','meuble','canape','coussin','tableau'],
  'Beauté':['beaute','soin','cosmetique','parfum','serum','maquillage'],
  'Bien-être':['bienetre','zen','yoga','relaxation','sophrologie','meditation'],
  'Sport':['sport','trail','bike','velo','fitness','running','sportswear','outdoor','randonnee'],
  'Bijoux':['bijou','bague','collier','bracelet','pendentif','montre'],
  'Bagagerie':['bagage','sac','valise','trolley','backpack','cabas'],
  'Maroquinerie':['cuir','maroquin','portefeuille','ceinture','maroquinerie'],
  'Accessoires':['accessoire','chapeau','echarpe','gant','lunettes','ceinture'],
  'High-Tech':['tech','electronique','gaming','smartphone','informatique','geek'],
  'Enfants':['enfant','bebe','kids','jouet','naissance','puericulteur'],
  'Alimentaire':['food','epicerie','biscuit','cafe','bio','gourmet','chocolat','vin'],
  'Animaux':['animal','chien','chat','pet','veterinaire','aquarium'],
  'Voyage':['voyage','travel','camping','trek','aventure','croisiere'],
  'Auto':['auto','moto','voiture','pieces','tuning','automobile'],
  'Thermique':['polaire','thermique','doudoune','parka','manteau','ski','hiver','chaud'],
};

// Compatibility groups — niches across groups are mutually exclusive
const GROUPS = {
  Fashion: ['Lingerie','Mode Femme','Mode Homme','Accessoires','Bijoux','Bagagerie','Maroquinerie'],
  Home:    ['Décoration','Luminaires'],
  Health:  ['Beauté','Bien-être','Sport','Thermique'],
  Family:  ['Enfants'],
  Nature:  ['Alimentaire','Animaux','Voyage'],
  Tech:    ['High-Tech','Auto'],
};
function groupOf(n){for(const[g,ns]of Object.entries(GROUPS))if(ns.includes(n))return g;return null;}

function norm(s){return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z]/g,' ');}

function scoreText(text){
  const tn=norm(text),sc={};
  for(const[n,ws]of Object.entries(NK))for(const w of ws){const c=(tn.match(new RegExp('\\b'+w+'\\b','g'))||[]).length;if(c)sc[n]=(sc[n]||0)+c;}
  return sc;
}

function detectNichesScoped(titleH1, fullText) {
  const scPrimary = scoreText(titleH1);
  const scFull    = scoreText(fullText);
  // Primary niche = strongest signal from title+H1 (most authoritative)
  const primary = Object.entries(scPrimary).sort((a,b)=>b[1]-a[1])[0]?.[0]
               || Object.entries(scFull).sort((a,b)=>b[1]-a[1])[0]?.[0];
  if (!primary) return [];
  const g = groupOf(primary);
  // Keep only niches from the same compatibility group, max 2
  return Object.entries(scFull)
    .sort((a,b)=>b[1]-a[1])
    .filter(([n])=>!g||groupOf(n)===g)
    .slice(0,2)
    .map(([n])=>n);
}

function extractMeta(html) {
  const g = rx => rx.exec(html)?.[1]?.replace(/<[^>]+>/g,'').trim() || '';
  return {
    title:   g(/<title[^>]*>([^<]+)<\/title>/i),
    desc:    g(/meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})/i)
           ||g(/meta[^>]+content=["']([^"']{1,300})["'][^>]+name=["']description["']/i),
    ogTitle: g(/meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i),
    ogDesc:  g(/meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{1,300})/i),
    h1:      g(/<h1[^>]*>([^<]+)<\/h1>/i),
    kw:      g(/meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)/i),
  };
}

function extractNavOnly(html) {
  const navs = (html.match(/<nav[^>]*>[\s\S]{0,3000}<\/nav>/gi) || []).slice(0,2).join(' ');
  return [...navs.matchAll(/<a[^>]*>([^<]{2,40})<\/a>/gi)].map(m=>m[1].trim()).slice(0,15).join(' ');
}

async function analyzeMesh(domain, env) {
  const cacheKey = `mesh:${domain}`;
  const cached = await env.KV.get(cacheKey);
  if (cached) {
    const c = JSON.parse(cached);
    if (Date.now() - new Date(c.ts).getTime() < 3600000) {
      const ns = c.niches || [];
      const valid = ns.length <= 1 || ns.slice(1).every(n => groupOf(n) === groupOf(ns[0]));
      if (valid) return c;
    }
  }

  // Retry guard: after 3 failures → manual review
  const retryKey = `retry:${domain}`;
  const retries = parseInt(await env.KV.get(retryKey) || '0');
  if (retries >= 3) {
    const r = { domain, niches: ['Analyse Manuelle Requise'], manual: true, ts: new Date().toISOString(), action: 'analyze-mesh' };
    await env.KV.put(cacheKey, JSON.stringify(r), { expirationTtl: 86400 });
    return r;
  }

  let html = '', cfProtected = false, httpCode = null;
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  try {
    const r = await fetch(`https://${domain}`, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*', 'Accept-Language': 'fr-FR,fr;q=0.9' },
      signal: AbortSignal.timeout(12000),
    });
    httpCode = r.status;
    if (r.ok) html = await r.text();
    else throw new Error(`HTTP ${r.status}`);
  } catch(e) {
    await env.KV.put(retryKey, String(retries + 1), { expirationTtl: 86400 });
    return { domain, niches: ['Non-classé'], error: e.message, httpCode, retries: retries + 1, ts: new Date().toISOString(), action: 'analyze-mesh' };
  }

  cfProtected = /cf-browser-verification|Just a moment\.\.\.|__cf_chl/.test(html);

  if (cfProtected) {
    // ScrapingBee (residential proxies, auto-CAPTCHA) — requires SCRAPINGBEE_KEY secret
    if (env.SCRAPINGBEE_KEY) {
      try {
        const r = await fetch(`https://app.scrapingbee.com/api/v1/?api_key=${env.SCRAPINGBEE_KEY}&url=https://${domain}&render_js=false`, { signal: AbortSignal.timeout(20000) });
        if (r.ok) { html = await r.text(); cfProtected = false; }
      } catch {}
    }
    // Wayback Machine fallback (free, CORS-ok, bypasses CF)
    if (cfProtected) {
      try {
        const cdx = await fetch(`https://web.archive.org/cdx/search/cdx?url=${domain}&output=json&limit=1&fl=timestamp&from=20250101&filter=statuscode:200`, { signal: AbortSignal.timeout(5000) });
        const j = await cdx.json();
        if (j.length > 1) {
          const wb = await fetch(`https://web.archive.org/web/${j[1][0]}if_/https://${domain}`, { signal: AbortSignal.timeout(12000) });
          if (wb.ok) { html = await wb.text(); cfProtected = false; }
          else httpCode = `WB:${wb.status}`;
        } else httpCode = `WB:no-snapshot`;
      } catch { httpCode = `WB:timeout`; }
    }
  }

  const domainWords = domain.replace(/\.(fr|com|net|org|eu|io)$/, '').replace(/[-_]/g, ' ');
  const meta = extractMeta(html);
  const navText = extractNavOnly(html);
  const titleH1 = [meta.title, meta.ogTitle, meta.h1, domainWords].join(' ');
  const fullText = [titleH1, meta.desc, meta.ogDesc, meta.kw, navText].join(' ');
  const niches = detectNichesScoped(titleH1, fullText);

  const result = { domain, niches: niches.length ? niches : ['Non-classé'], meta: { title: meta.title, desc: meta.desc.slice(0, 120) }, cfProtected, httpCode, ts: new Date().toISOString(), action: 'analyze-mesh' };
  try { await env.KV.put(cacheKey, JSON.stringify(result), { expirationTtl: 3600 }); } catch {}
  if (niches.length) {
    try { await env.KV.delete(retryKey); } catch {}
    // Update aggregate niche_map (1 read+write, no list() needed)
    try {
      const nm = JSON.parse(await env.KV.get('niche_map') || '{}');
      nm[domain] = niches;
      await env.KV.put('niche_map', JSON.stringify(nm));
    } catch {}
  } else { try { await env.KV.put(retryKey, String(retries + 1), { expirationTtl: 86400 }); } catch {} }
  return result;
}

export default {
  async scheduled(event, env) { await sequence(env); },

  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (request.method === 'GET') {
      const qs = new URL(request.url).searchParams;
      if (qs.get('action') === 'niches') {
        try { return respond(JSON.parse(await env.KV.get('niche_map') || '{}')); }
        catch(e) { return respond({}, 200); }
      }
      return respond({ status: 'ok' });
    }

    if (request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch {}
      if (body.action === 'analyze-mesh' && body.domain) {
        const result = await analyzeMesh(body.domain, env);
        return respond(result);
      }
      if (body.action === 'scrape-collections' && body.domain) {
        return respond(await scrapeCollections(body.domain));
      }
    }

    const result = await sequence(env);
    return respond(result);
  },
};

async function scrapeCollections(domain) {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  try {
    const r = await fetch(`https://${domain}/collections.json?limit=250`, { headers:{'User-Agent':UA}, signal:AbortSignal.timeout(8000) });
    if (r.ok) {
      const j=await r.json();
      if (j.collections?.length) {
        const cols=j.collections.slice(0,100);
        const withCounts=await Promise.all(cols.map(async c=>{
          try{const cr=await fetch(`https://${domain}/collections/${c.handle}/products.json?limit=250&fields=id`,{headers:{'User-Agent':UA},signal:AbortSignal.timeout(6000)});const cj=await cr.json();return{title:c.title,path:`/collections/${c.handle}`,products:cj.products?.length??null};}
          catch{return{title:c.title,path:`/collections/${c.handle}`,products:null};}
        }));
        return {domain,platform:'shopify',collections:withCounts};
      }
    }
  } catch {}
  const RX=/\/(collections?|categorie(?:-produit)?|product-category|category)\//i;
  try {
    const r=await fetch(`https://${domain}`,{headers:{'User-Agent':UA,'Accept':'text/html'},signal:AbortSignal.timeout(12000)});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html=await r.text(),seen=new Set(),list=[];
    for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]{2,60})<\/a>/gi)) {
      let path;try{path=new URL(m[1],`https://${domain}`).pathname;}catch{continue;}
      if (!RX.test(path))continue;
      const key=path.replace(/\/+$/,'');
      if (seen.has(key)||key.split('/').length>5)continue;
      seen.add(key);
      const title=m[2].trim().replace(/\s+/g,' ');
      if (title&&title.length<70)list.push({title,path,products:null});
    }
    return {domain,platform:'html',collections:list};
  } catch(e) { return {domain,error:e.message,collections:[]}; }
}

async function sequence(env) {
  const radarKeys = await env.KV.list({ prefix: 'radar:' });
  const allLinks = [];
  for (const key of radarKeys.keys) {
    const data = await env.KV.get(key.name).then(v => (v ? JSON.parse(v) : null));
    if (data?.links) allLinks.push(...data.links);
  }
  const silos = buildSiloStructure([...new Set(allLinks)]);
  const priorityOrder = ['ecommerce', 'marketing', 'tech', 'local', 'other'];
  const queue = [];
  for (const silo of priorityOrder) {
    if (silos[silo]?.length) queue.push(...silos[silo].slice(0, 10).map(url => ({ url, silo })));
  }
  const domains = [...new Set(queue.map(q => { try { return new URL(q.url).hostname.replace(/^www\./, ''); } catch { return null; } }).filter(Boolean))];
  await env.KV.put('queue:radar', JSON.stringify(queue.map(q => q.url)));
  await env.KV.put('queue:backlink-hunter', JSON.stringify(domains));
  const report = { ts: new Date().toISOString(), siloSizes: Object.fromEntries(Object.entries(silos).map(([k, v]) => [k, v.length])), queued: queue.length };
  await logInfo(env, 'sequenceur', 'cycle-complete', report);
  await env.KV.put('sequenceur:last-report', JSON.stringify(report));
  return report;
}
