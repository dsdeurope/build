// v35-orchestrator — Chef d'orchestre du pipeline de déploiement complet
// 6 étapes : factory_fr → seo_assets → dns_setup → factory_langs → ping_index → complete
// Retry ×3 par étape · État persisté en R2 · Idempotent

const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'};
const ok=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json',...CORS}});
const err=(m,s=400)=>ok({error:m},s);

const CF_API='https://api.cloudflare.com/client/v4';
// 19 langues EU — fr=principal, +18 sous-domaines
const LANGS=['en','de','es','it','nl','pt','pl','sv','da','fi','no','cs','ro','hu','sk','hr','bg','el','sl'];
const STEPS=['factory_fr','seo_assets','dns_setup','factory_langs','ping_index','complete'];

function auth(req,env){
  const h=req.headers.get('Authorization')||'';
  const t=new URL(req.url).searchParams.get('token')||'';
  const tok=env.API_TOKEN||'dde0d1b0dfdc9546c0e3464e9939fa4c0fc138e8d5f43df3';
  return h==='Bearer '+tok||t===tok;
}
const genId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);

async function rget(env,key){const o=await env.R2.get(key).catch(()=>null);return o?JSON.parse(await new Response(o.body).text()):null;}
async function rput(env,key,d){await env.R2.put(key,JSON.stringify(d),{httpMetadata:{contentType:'application/json'}});}

// ── Étape 1 : Génération site FR ─────────────────────────────────────────
async function factoryCall(env,payload){
  const req=new Request('https://factory/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const r=await env.FACTORY.fetch(req);
  const txt=await r.text();
  let d;try{d=JSON.parse(txt);}catch(e){throw new Error('Factory HTTP'+r.status+': '+txt.slice(0,200));}
  if(!d.success)throw new Error('Factory: '+(d.error||'erreur'));
  return d;
}
async function stepFactoryFr(s,env){
  const d=await factoryCall(env,{domain:s.domain,niche:s.niche,lang:'fr',blueprint:s.blueprint});
  return{pages:d.pages,slug:d.slug,url:d.url};
}

// ── Étape 2 : sitemap.xml + robots.txt avec hreflang ────────────────────
async function stepSeoAssets(s,env){
  const{slug,domain,blueprint}=s;
  const cols=blueprint.allCollections||[];
  const today=new Date().toISOString().split('T')[0];
  const urls=['/'];
  cols.forEach(c=>{urls.push('/collections/','/collections/'+c.slug+'/');(c.products||[]).forEach(p=>urls.push('/collections/'+c.slug+'/'+p.slug+'/'));});
  ['/blog/','/cgv/','/mentions-legales/','/confidentialite/','/contact/','/a-propos/'].forEach(u=>urls.push(u));
  const allL=['fr',...LANGS];
  const hreflang=u=>allL.map(l=>`    <xhtml:link rel="alternate" hreflang="${l}" href="https://${l==='fr'?'www':l}.${domain}${u}"/>`).join('\n')+`\n    <xhtml:link rel="alternate" hreflang="x-default" href="https://www.${domain}${u}"/>`;
  const sitemap=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.map(u=>`  <url>\n    <loc>https://www.${domain}${u}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${u==='/'?'daily':'weekly'}</changefreq>\n    <priority>${u==='/'?'1.0':u.split('/').length<=3?'0.8':'0.6'}</priority>\n${hreflang(u)}\n  </url>`).join('\n')}\n</urlset>`;
  const robots=`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\nDisallow: /checkout/\nDisallow: /suivi/\nSitemap: https://www.${domain}/sitemap.xml\n\nUser-agent: AhrefsBot\nDisallow: /\n\nUser-agent: SemrushBot\nDisallow: /\n\nUser-agent: MJ12bot\nDisallow: /\n\nUser-agent: DotBot\nDisallow: /`;
  await Promise.all([env.R2.put(slug+'/sitemap.xml',sitemap,{httpMetadata:{contentType:'application/xml'}}),env.R2.put(slug+'/robots.txt',robots,{httpMetadata:{contentType:'text/plain'}})]);
  return{sitemap_urls:urls.length,hreflang_langs:allL.length};
}

// ── Étape 3 : DNS Cloudflare — 19 sous-domaines CNAME ───────────────────
async function stepDnsSetup(s,env){
  const{slug,domain,zone_id}=s;
  if(!zone_id)return{skipped:true,reason:'zone_id non fourni — à compléter dans Opération'};
  const tok=env.CF_TOKEN;
  const results=[];
  for(const lang of['fr',...LANGS]){
    const name=lang==='fr'?'www':lang;
    const sub=name+'.'+domain;
    const tSlug=lang==='fr'?slug:slug+'-'+lang;
    const cfRes=await fetch(`${CF_API}/zones/${zone_id}/dns_records`,{method:'POST',headers:{'Authorization':'Bearer '+tok,'Content-Type':'application/json'},body:JSON.stringify({type:'CNAME',name,content:'v35-site-server.ernestpedanou.workers.dev',proxied:true,ttl:1})});
    const cf=await cfRes.json().catch(()=>({success:false}));
    const ok_dns=cf.success||(cf.errors||[]).some(e=>e.code===81053);
    if(ok_dns){
      await fetch(`${CF_API}/zones/${zone_id}/workers/routes`,{method:'POST',headers:{'Authorization':'Bearer '+tok,'Content-Type':'application/json'},body:JSON.stringify({pattern:sub+'/*',script:'v35-site-server'})}).catch(()=>{});
      await env.KV.put('site:hostname:'+sub,tSlug,{expirationTtl:86400*365*5}).catch(()=>{});
    }
    results.push({lang,sub,tSlug,ok:ok_dns,code:(cf.errors||[{code:0}])[0]?.code});
  }
  return{total:results.length,created:results.filter(r=>r.ok).length,details:results};
}

// ── Traduction blueprint via content-ai (prompt style xlsx) ──────────────
async function translateBlueprint(env,blueprint,lang,niche){
  if(!env.CONTENT_AI)return blueprint; // si pas de binding, blueprint FR
  try{
    const req=new Request('https://content-ai/api/translate-blueprint',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({blueprint,lang,niche})
    });
    const r=await env.CONTENT_AI.fetch(req);
    const d=await r.json().catch(()=>null);
    return d?.ok&&d.blueprint?d.blueprint:blueprint;
  }catch{return blueprint;}
}

// ── Étape 4 : 19 sites multilingues IA (batch de 4 en // pour éviter timeout) ──
async function stepFactoryLangs(s,env){
  const{slug,niche,domain,blueprint}=s;
  const tld=domain.split('.').pop();
  const base=domain.slice(0,-(tld.length+1));
  const results=[];
  for(let i=0;i<LANGS.length;i+=4){
    const batch=LANGS.slice(i,i+4);
    const br=await Promise.all(batch.map(async lang=>{
      const d2=base+'-'+lang+'.'+tld;
      try{
        // Traduction IA du blueprint (titres + descriptions via OpenAI)
        const bp=await translateBlueprint(env,blueprint,lang,niche);
        const d=await factoryCall(env,{domain:d2,niche,lang,blueprint:bp}).catch(e=>({success:false,error:e.message}));
        if(d.success)await env.KV.put('site:hostname:'+lang+'.'+domain,d.slug,{expirationTtl:86400*365*5}).catch(()=>{});
        return{lang,ok:!!d.success,pages:d.pages||0,slug:d.slug,translated:bp!==blueprint};
      }catch(e){return{lang,ok:false,error:e.message};}
    }));
    results.push(...br);
  }
  return{langs:results.length,ok:results.filter(r=>r.ok).length,translated:results.filter(r=>r.translated).length,results};
}

// ── Étape 5 : Ping Google + Bing pour indexation ─────────────────────────
async function stepPingIndex(s,env){
  const sm=encodeURIComponent('https://www.'+s.domain+'/sitemap.xml');
  const[g,b]=await Promise.allSettled([fetch('https://www.google.com/ping?sitemap='+sm),fetch('https://www.bing.com/ping?sitemap='+sm)]);
  return{google:g.status==='fulfilled'?g.value.status:'error',bing:b.status==='fulfilled'?b.value.status:'error',sitemap:'https://www.'+s.domain+'/sitemap.xml'};
}

// ── Exécuteur avec retry x3 ───────────────────────────────────────────────
const FNS={factory_fr:stepFactoryFr,seo_assets:stepSeoAssets,dns_setup:stepDnsSetup,factory_langs:stepFactoryLangs,ping_index:stepPingIndex};
async function runStep(name,state,env){
  const fn=FNS[name];
  if(!fn)return{skipped:true};
  for(let i=1;i<=3;i++){
    try{return await fn(state,env);}
    catch(e){if(i===3)throw e;await new Promise(r=>setTimeout(r,700*i));}
  }
}

// ── Avancer l'état d'une étape ────────────────────────────────────────────
async function advance(state,env){
  const idx=state.currentStep;
  if(idx>=state.steps.length){state.status='complete';state.completedAt=new Date().toISOString();return;}
  const step=state.steps[idx];
  if(step.name==='complete'){step.status='done';step.completedAt=new Date().toISOString();state.status='complete';state.completedAt=new Date().toISOString();return;}
  step.status='running';step.startedAt=new Date().toISOString();
  await rput(env,'orch/run-'+state.runId+'.json',state);
  try{
    step.result=await runStep(step.name,state,env);
    step.status='done';step.completedAt=new Date().toISOString();
    state.currentStep=idx+1;
    const next=state.steps[state.currentStep];
    if(!next||next.name==='complete'){state.status='complete';state.completedAt=new Date().toISOString();if(next){next.status='done';next.completedAt=new Date().toISOString();}}
  }catch(e){step.status='failed';step.error=e.message;state.status='failed';}
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const path=url.pathname;
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
    if(!auth(request,env))return err('Unauthorized',401);

    // GET /run/:id
    if(request.method==='GET'&&path.startsWith('/run/')&&path.length>5){
      const st=await rget(env,'orch/run-'+path.slice(5)+'.json');
      return st?ok(st):err('Run introuvable',404);
    }

    // GET /runs — historique
    if(request.method==='GET'&&path==='/runs'){
      const list=await env.R2.list({prefix:'orch/run-'}).catch(()=>({objects:[]}));
      const sorted=list.objects.sort((a,b)=>new Date(b.uploaded)-new Date(a.uploaded)).slice(0,30);
      const states=await Promise.all(sorted.map(o=>rget(env,o.key).catch(()=>null)));
      return ok({runs:states.filter(Boolean).map(s=>({runId:s.runId,slug:s.slug,domain:s.domain,niche:s.niche,status:s.status,startedAt:s.startedAt,completedAt:s.completedAt,currentStep:s.currentStep,steps:s.steps.map(st=>({name:st.name,status:st.status}))}))});
    }

    if(request.method!=='POST')return err('POST requis',405);
    let body={};try{body=await request.json();}catch{return err('JSON invalide');}

    // POST /run — démarrer pipeline
    if(path==='/run'){
      const{slug,niche,domain,blueprint,zone_id}=body;
      if(!slug||!niche||!domain||!blueprint?.allCollections?.length)return err('slug, niche, domain, blueprint.allCollections requis');
      const runId=genId();
      const state={runId,slug,niche,domain,blueprint,zone_id:zone_id||null,steps:STEPS.map(n=>({name:n,status:'pending',result:null,error:null,startedAt:null,completedAt:null})),currentStep:0,startedAt:new Date().toISOString(),completedAt:null,status:'running'};
      await advance(state,env);
      await rput(env,'orch/run-'+runId+'.json',state);
      return ok({runId,step:state.steps[0].name,stepStatus:state.steps[0].status,status:state.status,state});
    }

    // POST /run/next — avancer d'une étape
    if(path==='/run/next'){
      const{runId}=body;if(!runId)return err('runId requis');
      const state=await rget(env,'orch/run-'+runId+'.json');
      if(!state)return err('Run introuvable',404);
      if(state.status==='complete'||state.status==='failed')return ok({runId,status:state.status,state});
      await advance(state,env);
      await rput(env,'orch/run-'+runId+'.json',state);
      const cur=state.steps[state.currentStep-1]||state.steps[state.steps.length-1];
      return ok({runId,step:cur.name,stepStatus:cur.status,status:state.status,state});
    }

    // POST /run/retry — relancer une étape échouée
    if(path==='/run/retry'){
      const{runId}=body;if(!runId)return err('runId requis');
      const state=await rget(env,'orch/run-'+runId+'.json');
      if(!state)return err('Run introuvable',404);
      const failed=state.steps.find(s=>s.status==='failed');
      if(!failed)return err('Aucune étape en échec');
      failed.status='pending';failed.error=null;state.status='running';
      await rput(env,'orch/run-'+runId+'.json',state);
      return ok({runId,retrying:failed.name});
    }

    return err('Endpoint inconnu',404);
  }
};
