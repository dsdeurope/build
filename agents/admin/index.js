import { adminHTML } from './ui.js';

// V35 Admin — Dashboard de gestion des sites
// GET  /              → UI admin (protégée)
// GET  /pages         → liste pages R2 d'un slug
// GET  /page          → contenu d'une page
// POST /save          → sauvegarder page HTML
// POST /section       → mettre à jour une section nommée
// POST /ai-text       → améliorer un texte via content-ai
// POST /generate-image→ générer image via media-gen
// GET  /media         → liste médias d'un slug
// GET  /backups       → liste sauvegardes
// POST /backup        → créer une sauvegarde
// POST /restore       → restaurer une sauvegarde
// GET  /export        → exporter JSON local

// CORS: admin panel — restrict to same-origin only (no external CORS needed)
const CORS={'Access-Control-Allow-Origin':'same-origin','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','X-Robots-Tag':'noindex, nofollow'};
const ok=(d,s=200)=>new Response(JSON.stringify({ok:true,...d}),{status:s,headers:{'Content-Type':'application/json',...CORS}});
const err=(m,s=400)=>new Response(JSON.stringify({ok:false,error:m}),{status:s,headers:{'Content-Type':'application/json',...CORS}});

function auth(request,env){
  const h=request.headers.get('Authorization')||'';
  const t=new URL(request.url).searchParams.get('token')||'';
  const token=env.API_TOKEN;
  if(!token)return false;
  return h==='Bearer '+token||t===token;
}

async function r2get(env,key){
  const obj=await env.R2.get(key);
  if(!obj)return null;
  return new Response(obj.body).text();
}
async function r2put(env,key,html){
  await env.R2.put(key,html,{httpMetadata:{contentType:'text/html;charset=UTF-8'}});
}

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function updateSection(html,section,value){
  if(section==='h1') return html.replace(/<h1>[^<]*<\/h1>/,()=>'<h1>'+esc(value)+'</h1>');
  if(section==='meta_title') return html.replace(/<title>[^<]*<\/title>/,()=>'<title>'+esc(value)+'</title>');
  if(section==='meta_desc') return html.replace(/name="description" content="[^"]*"/,()=>'name="description" content="'+esc(value)+'"');
  if(section==='meta'){
    let h=html.replace(/<title>[^<]*<\/title>/,()=>'<title>'+esc(value.title||'')+'</title>');
    return h.replace(/name="description" content="[^"]*"/,()=>'name="description" content="'+esc(value.desc||'')+'"');
  }
  return html;
}


export default{
  async fetch(request,env){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});

    const url=new URL(request.url);
    const path=url.pathname.replace(/\/+$/,'')||'/';
    const token=env.API_TOKEN||'';

    // Serve admin UI — protected by HTTP Basic Auth before token is embedded
    if(request.method==='GET'&&path==='/'){
      if(!token)return new Response('API_TOKEN not configured',{status:500});
      const ip=request.headers.get('CF-Connecting-IP')||'unknown';
      const rlKey='auth-fail:'+ip;
      // Rate-limit: 5 échecs → 429 pendant 5min
      const rlRaw=await env.KV.get(rlKey).catch(()=>null);
      const rl=rlRaw?JSON.parse(rlRaw):{count:0};
      if(rl.count>=5)return new Response('Too Many Requests',{status:429,headers:{'Retry-After':'300','Cache-Control':'no-store'}});
      // HTTP Basic Auth gate: credentials = admin / <API_TOKEN>
      const basicRaw=request.headers.get('Authorization')||'';
      const validBasic='Basic '+btoa('admin:'+token);
      if(basicRaw!==validBasic){
        await env.KV.put(rlKey,JSON.stringify({count:rl.count+1}),{expirationTtl:300}).catch(()=>{});
        return new Response('Unauthorized',{status:401,headers:{'WWW-Authenticate':'Basic realm="V35 Admin"','Cache-Control':'no-store'}});
      }
      await env.KV.delete(rlKey).catch(()=>{}); // reset compteur sur succès
      return new Response(adminHTML(token),{headers:{'Content-Type':'text/html;charset=UTF-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
    }

    // Public endpoint — checkout calls this from browser
    if(request.method==='GET'&&path==='/promo/validate'){
      const sl=url.searchParams.get('slug'),code=(url.searchParams.get('code')||'').toUpperCase(),total=parseFloat(url.searchParams.get('total'))||0;
      if(!sl||!code)return new Response(JSON.stringify({ok:false,error:'slug + code required'}),{status:400,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
      const raw=await env.KV.get('promo:'+sl+':'+code).catch(()=>null);
      if(!raw)return new Response(JSON.stringify({ok:false,error:'Code invalide'}),{headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
      const p=JSON.parse(raw);
      if(!p.active)return new Response(JSON.stringify({ok:false,error:'Code désactivé'}),{headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
      if(p.expiresAt&&new Date(p.expiresAt)<new Date())return new Response(JSON.stringify({ok:false,error:'Code expiré'}),{headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
      if(p.maxUses>0&&p.uses>=p.maxUses)return new Response(JSON.stringify({ok:false,error:'Code épuisé'}),{headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
      if(total>0&&p.minOrder>0&&total<p.minOrder)return new Response(JSON.stringify({ok:false,error:'Minimum de commande: '+p.minOrder+'€'}),{headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
      const discount=p.type==='percent'?parseFloat((total*p.value/100).toFixed(2)):Math.min(p.value,total);
      const label=p.type==='percent'?'-'+p.value+'% appliqué !':'-'+p.value+'€ appliqué !';
      p.uses=(p.uses||0)+1;
      await env.KV.put('promo:'+sl+':'+code,JSON.stringify(p),{expirationTtl:86400*365}).catch(()=>{});
      return new Response(JSON.stringify({ok:true,discount,label,type:p.type,value:p.value}),{headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
    }

    if(!auth(request,env))return err('Unauthorized',401);

    // GET /health-report — proxy sentinelle (CORS safe via service binding)
    if(request.method==='GET'&&path==='/health-report'){
      if(!env.SENTINELLE)return ok({workers:[],summary:{total:0,up:0,down:0,unknown:0},domains:[]});
      const[rep,dom]=await Promise.allSettled([
        env.SENTINELLE.fetch(new Request('https://sentinelle/report')).then(r=>r.json()).catch(()=>null),
        env.SENTINELLE.fetch(new Request('https://sentinelle/domains')).then(r=>r.json()).catch(()=>null),
      ]);
      return ok({workers:rep.value?.workers||[],summary:rep.value?.summary||{},domains:dom.value?.domains||[],ts:new Date().toISOString()});
    }

    // GET /pages — list pages for slug
    if(request.method==='GET'&&path==='/pages'){
      const sl=url.searchParams.get('slug');if(!sl)return err('slug required');
      const pages=[];let cursor;
      do{
        const opts={prefix:sl+'/',limit:1000};if(cursor)opts.cursor=cursor;
        const list=await env.R2.list(opts);
        for(const obj of list.objects){
          const relKey=obj.key.slice(sl.length);
          const p=relKey.endsWith('/')&&relKey!=='/'?relKey:relKey;
          pages.push({path:p,size:obj.size,key:obj.key});
        }
        cursor=list.truncated?list.cursor:null;
      }while(cursor);
      return ok({slug:sl,total:pages.length,pages});
    }

    // GET /page — get page content
    if(request.method==='GET'&&path==='/page'){
      const sl=url.searchParams.get('slug'),pg=url.searchParams.get('path')||'/';
      if(!sl)return err('slug required');
      const normalPath=pg.endsWith('/')?pg:pg+'/';
      const key=sl+normalPath;
      const content=await r2get(env,key);
      if(!content)return err('Page not found: '+key,404);
      return ok({slug:sl,path:normalPath,key,content});
    }

    // GET /media
    if(request.method==='GET'&&path==='/media'){
      const sl=url.searchParams.get('slug');if(!sl)return err('slug required');
      const list=await env.R2.list({prefix:sl+'/media/'});
      return ok({slug:sl,media:list.objects.map(o=>({key:o.key,size:o.size}))});
    }

    // GET /backups
    if(request.method==='GET'&&path==='/backups'){
      const sl=url.searchParams.get('slug');if(!sl)return err('slug required');
      const raw=await env.KV.get('backup:index:'+sl).catch(()=>null);
      return ok({slug:sl,backups:raw?JSON.parse(raw):[]});
    }

    // GET /export — JSON export for local download
    if(request.method==='GET'&&path==='/export'){
      const sl=url.searchParams.get('slug');if(!sl)return err('slug required');
      const pages={};let cursor;
      do{
        const opts={prefix:sl+'/',limit:1000};if(cursor)opts.cursor=cursor;
        const list=await env.R2.list(opts);
        for(const obj of list.objects){
          const src=await env.R2.get(obj.key);
          if(src){const ct=src.httpMetadata?.contentType||'';if(ct.startsWith('text/'))pages[obj.key]=await new Response(src.body).text();}
        }
        cursor=list.truncated?list.cursor:null;
      }while(cursor);
      return new Response(JSON.stringify({slug:sl,exportedAt:new Date().toISOString(),pages,count:Object.keys(pages).length},null,2),{
        headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="'+sl+'-export.json"',...CORS}
      });
    }

    // GET operation endpoints (before POST guard)
    if(request.method==='GET'&&path==='/operation/config'){const sl=url.searchParams.get('slug');if(!sl)return err('slug required');const obj=await env.R2.get('op/cfg-'+sl+'.json').catch(()=>null);const cfg=obj?JSON.parse(await new Response(obj.body).text()):null;return ok({config:cfg||{}});}
    if(request.method==='GET'&&path==='/operation/content'){const sl=url.searchParams.get('slug');if(!sl)return err('slug required');const obj=await env.R2.get('op/content-'+sl+'.json').catch(()=>null);const c=obj?JSON.parse(await new Response(obj.body).text()):null;return ok({content:c||{}});}
    if(request.method==='GET'&&path==='/operation/domain-suggest'){const niche=url.searchParams.get('niche')||'';const sg={'Jewellery':['bijoupure.fr','orfevra.fr','eclat-bijoux.fr','dorure-fine.fr','cristale.fr'],'Bijoux':['bijoushine.fr','auroria.fr','lapure.fr','diamantine.fr','parure-fine.fr'],'Luminaires':['luminova.fr','lux-deco.fr','eclairia.fr','luminia.fr','lighterra.fr'],'Décoration':['maison-arte.fr','decostore.fr','homestyle.fr','belle-maison.fr','decoria.fr'],'Mode Femme':['modelia.fr','femmestyle.fr','tendance-mode.fr','ellefashion.fr','ellegance.fr'],'Mode Homme':['monsieur-mode.fr','manstore.fr','styleman.fr','hommechic.fr','gentstore.fr'],'Beauté':['beautystore.fr','glowshop.fr','cosmetica.fr','mabeaute.fr','beautylab.fr'],'Bien-être':['zenstore.fr','natureza.fr','serenia.fr','zenlab.fr','bienetre.fr'],'Sport':['sportzone.fr','fitshop.fr','activa.fr','fitgear.fr','sportlab.fr'],'Maroquinerie':['sacmode.fr','cuiromania.fr','leatherco.fr','maroquin.fr','sacpremium.fr'],'High-Tech':['techstore.fr','gadgetzone.fr','hitech.fr','techshop.fr','gadgetlab.fr'],'Animaux':['animalstore.fr','petshopfr.fr','monpet.fr','animalia.fr','petzone.fr']};return ok({niche,suggestions:sg[niche]||['topshop.fr','boutique-premium.fr','monstore.fr','eshop-france.fr']});}
    // GET /orchestrator/* — proxy vers v35-orchestrator
    if(request.method==='GET'&&path==='/orchestrator/runs'){const orRes=await env.ORCHESTRATOR.fetch(new Request('https://orchestrator/runs',{headers:{'Authorization':'Bearer '+(env.API_TOKEN||'')}}));const orD=await orRes.json().catch(()=>({runs:[]}));return ok(orD);}
    if(request.method==='GET'&&path.startsWith('/orchestrator/run/')){const runId=path.slice('/orchestrator/run/'.length);const orRes=await env.ORCHESTRATOR.fetch(new Request('https://orchestrator/run/'+runId,{headers:{'Authorization':'Bearer '+(env.API_TOKEN||'')}}));const orD=await orRes.json().catch(()=>({}));return ok(orD);}
    // GET /backlinks
    if(request.method==='GET'&&path==='/backlinks'){const sl=url.searchParams.get('slug');if(!sl)return err('slug requis');const o=await env.R2.get('backlinks/'+sl+'/links.json').catch(()=>null);const links=o?JSON.parse(await new Response(o.body).text()):[];return ok({links});}
    if(request.method==='GET'&&path==='/operation/blueprint'){const sl=url.searchParams.get('slug');if(!sl)return err('slug required');const obj=await env.R2.get('op/blueprint-'+sl+'.json').catch(()=>null);const bp=obj?JSON.parse(await new Response(obj.body).text()):null;return ok({blueprint:bp});}

    if(request.method!=='POST')return err('Method not allowed',405);
    let body={};try{body=await request.json();}catch{return err('Invalid JSON');}

    // POST /save
    if(path==='/save'){
      const{slug,path:pg,content}=body;if(!slug||!content)return err('slug + content required');
      const normalPath=(pg||'/').endsWith('/')?(pg||'/'):pg+'/';
      await r2put(env,slug+normalPath,content);
      return ok({slug,path:normalPath,saved:true});
    }

    // POST /section
    if(path==='/section'){
      const{slug,path:pg,section,value}=body;if(!slug||!section)return err('slug + section required');
      const normalPath=(pg||'/').endsWith('/')?(pg||'/'):pg+'/';
      const key=slug+normalPath;
      let html=await r2get(env,key);
      if(!html)return err('Page not found: '+key,404);
      if(section==='h2s'&&Array.isArray(value)){
        let idx=0;html=html.replace(/<h2[^>]*>[^<]*<\/h2>/g,function(m){return idx<value.length?'<h2>'+esc(value[idx++])+'</h2>':m;});
      } else {html=updateSection(html,section,value);}
      await r2put(env,key,html);
      return ok({slug,path:normalPath,section,saved:true});
    }

    // POST /ai-text
    if(path==='/ai-text'){
      const{type,text,lang='en'}=body;if(!text)return err('text required');
      const prompts={
        h1:'Improve this H1 title for an e-commerce luxury site. Return ONLY the improved title, nothing else. Original: '+text,
        meta_title:'Improve this SEO meta title (max 60 chars). Return ONLY the title. Original: '+text,
        meta_desc:'Improve this SEO meta description (max 160 chars). Return ONLY the description. Original: '+text,
        default:'Improve this text for an e-commerce luxury site. Return ONLY the improved text. Original: '+text,
      };
      const prompt=prompts[type]||prompts.default;
      const OPENAI_KEY=env.OPENAI_KEY||'';
      if(!OPENAI_KEY)return err('OPENAI_KEY not configured');
      const aiRes=await fetch('https://api.openai.com/v1/chat/completions',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+OPENAI_KEY},
        body:JSON.stringify({model:'gpt-4o-mini',messages:[{role:'user',content:prompt}],max_tokens:300,temperature:.7}),
      });
      const aiData=await aiRes.json();
      const result=aiData.choices?.[0]?.message?.content?.trim()||'';
      return ok({result});
    }

    // POST /generate-image
    if(path==='/generate-image'){
      const{slug,type='product',niche='Jewellery',prompt}=body;
      if(!slug)return err('slug required');
      const MEDIA_URL=env.MEDIA_GEN_URL||'https://v35-media-gen.ernestpedanou.workers.dev';
      const r=await fetch(MEDIA_URL+'/image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug,type,niche,prompt,filename:type+'-'+Date.now()})});
      const d=await r.json();
      return ok(d);
    }

    // POST /backup
    if(path==='/backup'){
      const{slug}=body;if(!slug)return err('slug required');
      const BK_URL=env.BACKUP_URL||'https://v35-backup.ernestpedanou.workers.dev';
      const r=await fetch(BK_URL+'/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug})});
      const d=await r.json();
      return ok(d);
    }

    // POST /restore
    if(path==='/restore'){
      const{slug,date}=body;if(!slug||!date)return err('slug + date required');
      const BK_URL=env.BACKUP_URL||'https://v35-backup.ernestpedanou.workers.dev';
      const r=await fetch(BK_URL+'/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug,date})});
      const d=await r.json();
      return ok(d);
    }

    // POST /ai-page
    if(path==='/ai-page'){
      const{slug,path:pg}=body;if(!slug)return err('slug required');
      const ENH_URL=env.ENHANCER_URL||'https://v35-site-enhancer.ernestpedanou.workers.dev';
      const r=await fetch(ENH_URL+'/cro-ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug,path:pg,lang:'en'})});
      const d=await r.json();
      return ok(d);
    }

    // GET /analytics
    if(request.method==='GET'&&path==='/analytics'){
      const sl=url.searchParams.get('slug');if(!sl)return err('slug required');
      const days=[];
      const now=new Date();
      for(let i=0;i<30;i++){
        const d=new Date(now-i*86400000).toISOString().slice(0,10);
        const v=await env.KV.get('analytics:'+sl+':'+d).catch(()=>null);
        if(v)days.push({date:d,views:parseInt(v)});
      }
      days.reverse();
      const metaRaw=await env.R2.get(sl+'/__meta.json').catch(()=>null);
      let meta={};
      if(metaRaw){try{meta=JSON.parse(await new Response(metaRaw.body).text());}catch{}}
      return ok({slug:sl,days,meta});
    }

    // Promo endpoints (auth required)
    if(path==='/promo/list'){
      const sl=url.searchParams.get('slug');if(!sl)return err('slug required');
      const idxRaw=await env.KV.get('promo:index:'+sl).catch(()=>null);
      const codes=idxRaw?JSON.parse(idxRaw):[];
      const promos=[];
      for(const c of codes){const r=await env.KV.get('promo:'+sl+':'+c).catch(()=>null);if(r)promos.push(JSON.parse(r));}
      return ok({slug:sl,promos,count:promos.length});
    }

    if(path==='/promo/create'){
      const{slug,code,type='percent',value,minOrder=0,maxUses=0,expiresAt=null}=body;
      if(!slug||!code||!value)return err('slug, code, value required');
      const c=code.toUpperCase().replace(/[^A-Z0-9]/g,'');
      const promo={code:c,type,value:parseFloat(value),minOrder:parseFloat(minOrder)||0,maxUses:parseInt(maxUses)||0,uses:0,expiresAt:expiresAt||null,active:true,createdAt:new Date().toISOString()};
      await env.KV.put('promo:'+slug+':'+c,JSON.stringify(promo),{expirationTtl:86400*365});
      const idxRaw=await env.KV.get('promo:index:'+slug).catch(()=>null);
      const idx=idxRaw?JSON.parse(idxRaw):[];
      if(!idx.includes(c))idx.push(c);
      await env.KV.put('promo:index:'+slug,JSON.stringify(idx),{expirationTtl:86400*365}).catch(()=>{});
      return ok({slug,code:c,promo});
    }

    if(path==='/promo/delete'){
      const{slug,code}=body;if(!slug||!code)return err('slug + code required');
      const c=code.toUpperCase();
      await env.KV.delete('promo:'+slug+':'+c).catch(()=>{});
      const idxRaw=await env.KV.get('promo:index:'+slug).catch(()=>null);
      const idx=idxRaw?JSON.parse(idxRaw):[];
      await env.KV.put('promo:index:'+slug,JSON.stringify(idx.filter(x=>x!==c)),{expirationTtl:86400*365}).catch(()=>{});
      return ok({slug,code:c,deleted:true});
    }

    // ── OPERATION POST endpoints ──────────────────────────────────────────────
    if(path==='/operation/config'){
      const{slug,config}=body;if(!slug)return err('slug required');
      await env.R2.put('op/cfg-'+slug+'.json',JSON.stringify(config),{httpMetadata:{contentType:'application/json'}}).catch(()=>{});
      return ok({slug,saved:true});
    }
    if(path==='/operation/content'){
      const{slug,content}=body;if(!slug)return err('slug required');
      await env.R2.put('op/content-'+slug+'.json',JSON.stringify(content),{httpMetadata:{contentType:'application/json'}}).catch(()=>{});
      return ok({slug,saved:true});
    }
    if(path==='/operation/subdomain'){
      const{slug,domain,zone_id,lang}=body;
      if(!zone_id||!domain||!lang)return err('zone_id, domain, lang required');
      const cfToken=env.CF_TOKEN;
      const name=lang==='fr'?'www':lang;
      const subdomain=(lang==='fr'?'www.':lang+'.')+domain;
      const cfRes=await fetch('https://api.cloudflare.com/client/v4/zones/'+zone_id+'/dns_records',{
        method:'POST',headers:{'Authorization':'Bearer '+cfToken,'Content-Type':'application/json'},
        body:JSON.stringify({type:'CNAME',name,content:'v35-site-server.ernestpedanou.workers.dev',proxied:true,ttl:1})
      });
      const cfData=await cfRes.json().catch(()=>({success:false,errors:[{message:'Parse error'}]}));
      if(!cfData.success&&!(cfData.errors||[]).some(e=>e.code===81053))return err((cfData.errors||[{message:'CF API error'}])[0].message);
      // Also try to create Worker Route
      await fetch('https://api.cloudflare.com/client/v4/zones/'+zone_id+'/workers/routes',{
        method:'POST',headers:{'Authorization':'Bearer '+cfToken,'Content-Type':'application/json'},
        body:JSON.stringify({pattern:subdomain+'/*',script:'v35-site-server'})
      }).catch(()=>{});
      const targetSlug=lang==='fr'?slug:slug+'-'+lang;
      await env.KV.put('site:hostname:'+subdomain,targetSlug,{expirationTtl:86400*365*5}).catch(()=>{});
      return ok({subdomain,slug:targetSlug,dns:'created'});
    }
    if(path==='/operation/lang-deploy'){
      const{slug,lang,langCode,domain,niche,blueprint}=body;
      if(!blueprint||!domain||!niche)return err('blueprint, domain, niche required');
      const factRes=await fetch('https://v35-site-factory.ernestpedanou.workers.dev/',{
        method:'POST',headers:{'Content-Type':'application/json','X-API-Token':env.API_TOKEN||''},
        body:JSON.stringify({domain,niche,lang:lang||'fr',blueprint})
      });
      const fData=await factRes.json().catch(()=>({success:false,error:'Parse error'}));
      if(!fData.success)return err(fData.error||'Factory error');
      await env.KV.put('site:hostname:'+domain,fData.slug,{expirationTtl:86400*365*5}).catch(()=>{});
      return ok({slug:fData.slug,pages:fData.pages,lang,domain});
    }
    if(path==='/operation/inject'){
      const{slug}=body;
      const[cObj,cfgObj,bpObj]=await Promise.all([
        env.R2.get('op/content-'+slug+'.json').catch(()=>null),
        env.R2.get('op/cfg-'+slug+'.json').catch(()=>null),
        env.R2.get('op/blueprint-'+slug+'.json').catch(()=>null),
      ]);
      const content=cObj?JSON.parse(await new Response(cObj.body).text()):{};
      const cfg=cfgObj?JSON.parse(await new Response(cfgObj.body).text()):{};
      const bp=bpObj?JSON.parse(await new Response(bpObj.body).text()):null;
      if(!bp)return err('Blueprint introuvable — régénérez le site d\'abord');
      if(content.brand)bp.brandOverride=content.brand;
      if(content.tagline)bp.sloganOverride=content.tagline;
      bp.contentOverride=content;
      const factRes=await fetch('https://v35-site-factory.ernestpedanou.workers.dev/',{
        method:'POST',headers:{'Content-Type':'application/json','X-API-Token':env.API_TOKEN||''},
        body:JSON.stringify({domain:cfg.domain||slug+'.fr',niche:cfg.niche||'Mode Femme',lang:'fr',blueprint:bp})
      });
      const fData=await factRes.json().catch(()=>({success:false,error:'Parse error'}));
      return fData.success?ok({slug,pages:fData.pages,injected:true}):err(fData.error||'Factory error');
    }

    // POST /orchestrator/run — proxy lancement pipeline
    if(path==='/orchestrator/run'){
      const{slug,niche,domain,zone_id}=body;if(!slug)return err('slug requis');
      const bpObj=await env.R2.get('op/blueprint-'+slug+'.json').catch(()=>null);
      const bp=bpObj?JSON.parse(await new Response(bpObj.body).text()):null;
      if(!bp?.allCollections?.length)return err('Blueprint introuvable — régénérez le site d\'abord via Opération');
      const orRes=await env.ORCHESTRATOR.fetch(new Request('https://orchestrator/run',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+(env.API_TOKEN||'')},body:JSON.stringify({slug,niche:niche||'Mode Femme',domain:domain||slug+'.fr',blueprint:bp,zone_id:zone_id||null})}));
      const orD=await orRes.json().catch(()=>({error:'Orchestrateur indisponible'}));
      return ok(orD);
    }
    // POST /orchestrator/next — avancer d'une étape
    if(path==='/orchestrator/next'){
      const{runId}=body;if(!runId)return err('runId requis');
      const orRes=await env.ORCHESTRATOR.fetch(new Request('https://orchestrator/run/next',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+(env.API_TOKEN||'')},body:JSON.stringify({runId})}));
      const orD=await orRes.json().catch(()=>({error:'parse'}));
      return ok(orD);
    }
    // POST /backlinks — ajouter un backlink
    if(path==='/backlinks'){
      const{slug,domain,url:burl,anchor,target,link_type,follow_type,dr,tf,obl}=body;if(!slug||!domain||!anchor)return err('slug, domain, anchor requis');
      const key='backlinks/'+slug+'/links.json';
      const o=await env.R2.get(key).catch(()=>null);
      const links=o?JSON.parse(await new Response(o.body).text()):[];
      links.push({id:Date.now().toString(36),domain,url:burl||'',anchor,target:target||'/',link_type:link_type||'blog',follow_type:follow_type||'dofollow',dr:dr||0,tf:tf||0,obl:obl||0,status:'pending',addedAt:new Date().toISOString().split('T')[0],liveAt:null});
      await env.R2.put(key,JSON.stringify(links),{httpMetadata:{contentType:'application/json'}});
      return ok({slug,added:true,total:links.length});
    }
    // POST /backlinks/update — changer statut ou supprimer
    if(path==='/backlinks/update'){
      const{slug,id,status,deleted}=body;if(!slug||!id)return err('slug + id requis');
      const key='backlinks/'+slug+'/links.json';
      const o=await env.R2.get(key).catch(()=>null);
      let links=o?JSON.parse(await new Response(o.body).text()):[];
      if(deleted)links=links.filter(l=>l.id!==id);
      else{const l=links.find(l=>l.id===id);if(l){l.status=status;if(status==='active')l.liveAt=new Date().toISOString().split('T')[0];}}
      await env.R2.put(key,JSON.stringify(links),{httpMetadata:{contentType:'application/json'}});
      return ok({slug,updated:true});
    }
    // POST /backlinks/generate-comment — génère un commentaire HTML Wix/tiptap via OpenAI
    if(path==='/backlinks/generate-comment'){
      const{blog_url,boutique_url,word_count=150,anchor_type='non-optimisée',link_type='blog',nofollow=false}=body;
      if(!blog_url||!boutique_url)return err('blog_url + boutique_url requis');
      const OPENAI_KEY=env.OPENAI_KEY||'';
      if(!OPENAI_KEY)return err('OPENAI_KEY non configurée');
      // Dériver la homepage de la boutique
      let homepage=boutique_url;try{homepage=new URL(boutique_url).origin+'/';}catch{}
      // Choisir ancre selon type
      const ancreExamples={
        'non-optimisée':['ici','ce site','en savoir plus','cliquez ici','voir le site','cette page','ce lien'],
        'semi-optimisée':['boutique en ligne','produits de qualité','voir la collection','découvrir la boutique','shop en ligne'],
        'optimisée':['ancre-mot-clé exact à inférer de l\'URL de la boutique'],
      };
      const toneMap={blog:'éditorial et expert (structure h2/h3, paragraphes développés)',forum:'conversationnel et bref (1-2 paragraphes max, ton naturel)',profile:'très court, présentatif (50 mots max, pas de lien dans le texte sauf si demandé)',guestbook:'court et enthousiaste (2-3 phrases)'};
      const tone=toneMap[link_type]||toneMap.blog;
      const prompt=`Tu es un expert SEO combinant les approches de Koray Tuğberk GÜBÜR (topical authority) et Laurent Bourrelly (cocon sémantique).

Ta mission : rédiger un commentaire de type "${link_type}" (ton : ${tone}) de exactement ${word_count} mots (±10 mots tolérance) à poster sur l'article : ${blog_url}
Le commentaire doit rediriger vers la boutique : ${boutique_url} (et aussi vers la homepage : ${homepage})

RÈGLES STRICTES :
1. Le lien PRINCIPAL (vers ${boutique_url}) doit apparaître dans les 80 premiers mots
2. Type d'ancre pour le lien principal : ${anchor_type}
   - Si "non-optimisée" : utiliser une ancre générique parmi ["ici","ce site","en savoir plus","cliquez ici","voir le site","ce lien"]
   - Si "semi-optimisée" : ancre partiellement liée au thème de la boutique (2-4 mots)
   - Si "optimisée" : ancre = mot-clé principal exact lié au thème/niche de la boutique
3. Le lien SECONDAIRE (vers la homepage ${homepage}) doit avoir une ancre du MÊME type (même règle)
4. Le contenu apporte des informations expertes méconnues, comme un "article cousin" — informe le lecteur sur le sujet large sans paraphraser l'article cible
5. Topical authority : maillage thématique cohérent, vocabulaire expert, sous-thèmes connexes
6. Cocon sémantique : le commentaire agit comme un nœud thématique qui renforce le maillage
7. Utiliser h1, h2, h3, blockquote, br, li pour aérer — OBLIGATOIRE d'avoir au moins un titre (h2 ou h3)
8. Ajouter des <br> avant ET après les balises de structure (h2, h3, blockquote, ul)

FORMAT EXACT (ne pas dévier d'un caractère dans les classes/attributs) :
- Wrapper global : <div contenteditable="true" translate="no" class="tiptap ProseMirror" tabindex="0">
- Chaque paragraphe : <p class="R-Rzg RAz0K" style=" id="foo" indentation="0" textstyle="[object Object]" dir="auto" data-ricos-id="foo">
- Texte normal : <span data-hook="foreground-color" style="color: #000000; text-decoration: inherit;"><span class="ricos-selection">TEXTE ICI</span></span>
- Lien : <a href="URL" rel="${nofollow?'nofollow noreferrer noopener':'noreferrer noopener'}" target="_blank" class="M4jZ2 eSnwX" data-hook="web-link" style="text-decoration:none;"><span data-hook="foreground-color" style="color: #000000; text-decoration: inherit;"><span><span class="ricos-selection">ANCRE ICI</span></span></span></a>
- Plusieurs paragraphes autorisés (crée autant de <p>...</p> que nécessaire)
- PAS de retour à la ligne ni indentation dans le code HTML final

OUTPUT : JSON UNIQUEMENT, une seule clé "html" contenant le bloc HTML complet (une ligne, sans \n):
{"html":"<div contenteditable=...>...</div>"}`;

      const aiRes=await fetch('https://api.openai.com/v1/chat/completions',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+OPENAI_KEY},
        body:JSON.stringify({model:'gpt-4o-mini',messages:[{role:'user',content:prompt}],max_tokens:2000,temperature:0.85}),
      });
      const aiData=await aiRes.json().catch(()=>({}));
      const raw=(aiData.choices?.[0]?.message?.content||'').trim();
      // Extraire le JSON
      let commentHtml='';
      try{
        const jsonMatch=raw.match(/\{[\s\S]*"html"\s*:\s*"([\s\S]*?)"\s*\}/);
        if(jsonMatch)commentHtml=jsonMatch[1].replace(/\\"/g,'"').replace(/\\n/g,'');
        else{const parsed=JSON.parse(raw);commentHtml=parsed.html||'';}
      }catch{
        // Fallback: si OpenAI retourne directement le HTML
        if(raw.startsWith('<div'))commentHtml=raw;
      }
      if(!commentHtml)return err('Génération échouée — réessayer');
      return ok({comment_html:commentHtml,word_count,anchor_type,blog_url,boutique_url});
    }
    // GET /spots
    if(request.method==='GET'&&path==='/spots'){const sl=url.searchParams.get('slug');if(!sl)return err('slug requis');const o=await env.R2.get('backlinks/'+sl+'/spots.json').catch(()=>null);const spots=o?JSON.parse(await new Response(o.body).text()):[];return ok({spots});}
    // POST /spots — ajouter un spot
    if(path==='/spots'){
      const{slug,domain,url:surl,type,cooldown,dr,tf,obl,notes,niche,dofollow,needs_account}=body;if(!slug||!domain)return err('slug + domain requis');
      const key='backlinks/'+slug+'/spots.json';
      const o=await env.R2.get(key).catch(()=>null);
      const spots=o?JSON.parse(await new Response(o.body).text()):[];
      spots.push({id:Date.now().toString(36),domain,url:surl||'',type:type||'blog',cooldown:cooldown||30,dr:dr||0,tf:tf||0,obl:obl||0,notes:notes||'',niche:niche||'',dofollow:!!dofollow,needs_account:!!needs_account,status:'available',uses:0,last_used:null,addedAt:new Date().toISOString().split('T')[0]});
      await env.R2.put(key,JSON.stringify(spots),{httpMetadata:{contentType:'application/json'}});
      return ok({slug,added:true,total:spots.length});
    }
    // POST /spots/import — import bulk TSV (dédup par domaine)
    if(path==='/spots/import'){
      const{slug,spots:incoming}=body;if(!slug||!incoming?.length)return err('slug + spots requis');
      const key='backlinks/'+slug+'/spots.json';
      const o=await env.R2.get(key).catch(()=>null);
      const existing=o?JSON.parse(await new Response(o.body).text()):[];
      const existingDomains=new Set(existing.map(s=>s.domain));
      let added=0,skipped=0;
      for(const s of incoming){
        if(!s.domain||existingDomains.has(s.domain)){skipped++;continue;}
        existing.push({id:Date.now().toString(36)+Math.random().toString(36).slice(2,4),domain:s.domain,url:s.url||'',type:s.type||'blog',cooldown:s.cooldown||21,dr:0,tf:0,obl:0,notes:s.notes||'',niche:s.niche||'',dofollow:!!s.dofollow,needs_account:!!s.needs_account,status:'available',uses:0,last_used:null,addedAt:new Date().toISOString().split('T')[0]});
        existingDomains.add(s.domain);added++;
      }
      await env.R2.put(key,JSON.stringify(existing),{httpMetadata:{contentType:'application/json'}});
      return ok({ok:true,added,skipped,total:existing.length});
    }
    // POST /spots/use — marquer un spot comme utilisé (déclenche cooldown)
    if(path==='/spots/use'){
      const{slug,id}=body;if(!slug||!id)return err('slug + id requis');
      const key='backlinks/'+slug+'/spots.json';
      const o=await env.R2.get(key).catch(()=>null);
      const spots=o?JSON.parse(await new Response(o.body).text()):[];
      const s=spots.find(x=>x.id===id);if(!s)return err('Spot introuvable',404);
      s.last_used=new Date().toISOString().split('T')[0];s.uses=(s.uses||0)+1;
      await env.R2.put(key,JSON.stringify(spots),{httpMetadata:{contentType:'application/json'}});
      return ok({ok:true,spot:s});
    }
    // POST /spots/update — changer statut ou supprimer
    if(path==='/spots/update'){
      const{slug,id,status,deleted}=body;if(!slug||!id)return err('slug + id requis');
      const key='backlinks/'+slug+'/spots.json';
      const o=await env.R2.get(key).catch(()=>null);
      let spots=o?JSON.parse(await new Response(o.body).text()):[];
      if(deleted)spots=spots.filter(x=>x.id!==id);
      else{const s=spots.find(x=>x.id===id);if(s&&status)s.status=status;}
      await env.R2.put(key,JSON.stringify(spots),{httpMetadata:{contentType:'application/json'}});
      return ok({ok:true});
    }
    // POST /backlinks/ping — ping Google/Bing pour indexation
    if(path==='/backlinks/ping'){
      const{slug}=body;if(!slug)return err('slug requis');
      const cfgObj=await env.R2.get('op/cfg-'+slug+'.json').catch(()=>null);
      const cfg=cfgObj?JSON.parse(await new Response(cfgObj.body).text()):{};
      const domain=cfg.domain||slug+'.fr';
      const sm=encodeURIComponent('https://www.'+domain+'/sitemap.xml');
      const[g,b]=await Promise.allSettled([fetch('https://www.google.com/ping?sitemap='+sm),fetch('https://www.bing.com/ping?sitemap='+sm)]);
      return ok({google:g.status==='fulfilled'?g.value.status:'error',bing:b.status==='fulfilled'?b.value.status:'error',sitemap:'https://www.'+domain+'/sitemap.xml'});
    }

    return err('Unknown endpoint',404);
  }
};
