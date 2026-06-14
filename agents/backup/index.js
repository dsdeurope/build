// V35 Backup — Snapshots R2 sites + restore + local export
// POST /create          {slug}                   — snapshot to backup/{date}/{slug}/
// POST /restore         {slug, date}             — restore from specific backup
// POST /restore-latest  {slug}                   — restore from most recent backup
// POST /delete          {slug, date}             — delete a backup snapshot
// GET  /list?slug=      — list available backup dates for a slug
// GET  /export?slug=&date=  — export all pages as JSON (download locally)
// GET  /status          — global backup stats

const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'};
const ok=(d,s=200)=>new Response(JSON.stringify({ok:true,...d}),{status:s,headers:{'Content-Type':'application/json',...CORS}});
const err=(m,s=400)=>new Response(JSON.stringify({ok:false,error:m}),{status:s,headers:{'Content-Type':'application/json',...CORS}});

const dateStr=()=>new Date().toISOString().slice(0,10); // YYYY-MM-DD

// ── KV backup index helpers ──────────────────────────────────────────────────
async function getIndex(env,slug){
  const raw=await env.KV.get(`backup:index:${slug}`).catch(()=>null);
  return raw?JSON.parse(raw):[];
}
async function saveIndex(env,slug,list){
  await env.KV.put(`backup:index:${slug}`,JSON.stringify(list),{expirationTtl:86400*180}).catch(()=>{});
}

// ── Copy R2 prefix A → prefix B ─────────────────────────────────────────────
async function copyPrefix(env,fromPrefix,toPrefix,limit=2000){
  let cursor;
  let total=0;
  const copied=[];
  const errors=[];
  do{
    const opts={prefix:fromPrefix,limit:1000};
    if(cursor)opts.cursor=cursor;
    const list=await env.R2.list(opts);
    for(const obj of list.objects){
      const relKey=obj.key.slice(fromPrefix.length);
      const destKey=toPrefix+relKey;
      try{
        const src=await env.R2.get(obj.key);
        if(src){
          const buf=await new Response(src.body).arrayBuffer();
          const ct=src.httpMetadata?.contentType||'text/html;charset=UTF-8';
          await env.R2.put(destKey,buf,{httpMetadata:{contentType:ct}});
          copied.push(destKey);
          total++;
          if(total>=limit)break;
        }
      }catch(e){
        errors.push({key:obj.key,error:e.message});
      }
    }
    cursor=list.truncated?list.cursor:null;
    if(total>=limit)break;
  }while(cursor);
  return{total,copied,errors};
}

// ── Delete R2 prefix ─────────────────────────────────────────────────────────
async function deletePrefix(env,prefix){
  let cursor;
  let deleted=0;
  do{
    const opts={prefix,limit:1000};
    if(cursor)opts.cursor=cursor;
    const list=await env.R2.list(opts);
    const keys=list.objects.map(o=>o.key);
    if(keys.length){
      // R2 delete one by one (no batch delete in Workers API)
      await Promise.allSettled(keys.map(k=>env.R2.delete(k)));
      deleted+=keys.length;
    }
    cursor=list.truncated?list.cursor:null;
  }while(cursor);
  return deleted;
}

// ── Export all pages as JSON (for local download) ───────────────────────────
async function exportToJSON(env,slug,date){
  const prefix=date?`backup/${date}/${slug}/`:`${slug}/`;
  const pages={};
  let cursor;
  do{
    const opts={prefix,limit:1000};
    if(cursor)opts.cursor=cursor;
    const list=await env.R2.list(opts);
    for(const obj of list.objects){
      const key=obj.key;
      const src=await env.R2.get(key);
      if(src){
        const ct=src.httpMetadata?.contentType||'text/html';
        if(ct.startsWith('text/')){
          pages[key]=await new Response(src.body).text();
        }else{
          pages[key]='[binary:'+ct+']';
        }
      }
    }
    cursor=list.truncated?list.cursor:null;
  }while(cursor);
  return pages;
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default{
  async fetch(request,env){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
    const url=new URL(request.url);
    const path=url.pathname.replace(/\/+$/,'');

    // GET /list — list backup dates
    if(request.method==='GET'&&path==='/list'){
      const slug=url.searchParams.get('slug');
      if(!slug)return err('slug param required');
      const idx=await getIndex(env,slug);
      return ok({slug,backups:idx,count:idx.length});
    }

    // GET /export — return all pages as JSON
    if(request.method==='GET'&&path==='/export'){
      const slug=url.searchParams.get('slug');
      const date=url.searchParams.get('date')||'';
      if(!slug)return err('slug param required');
      const pages=await exportToJSON(env,slug,date);
      const count=Object.keys(pages).length;
      const label=date?`backup/${date}/${slug}/`:`live:${slug}/`;
      const json=JSON.stringify({slug,date:date||'live',label,exportedAt:new Date().toISOString(),pages,count},null,2);
      return new Response(json,{
        headers:{
          'Content-Type':'application/json',
          'Content-Disposition':`attachment; filename="${slug}-backup-${date||dateStr()}.json"`,
          ...CORS,
        }
      });
    }

    // GET /status — global stats
    if(request.method==='GET'&&path==='/status'){
      const raw=await env.KV.get('backup:global-index').catch(()=>null);
      const slugs=raw?JSON.parse(raw):[];
      const stats=[];
      for(const s of slugs.slice(0,20)){
        const idx=await getIndex(env,s);
        stats.push({slug:s,backups:idx.length,latest:idx[idx.length-1]||null});
      }
      return ok({slugs:slugs.length,stats});
    }

    if(request.method!=='POST')return err('POST or GET only',405);
    let body={};
    try{body=await request.json();}catch{return err('Invalid JSON');}

    // POST /create — snapshot live slug to backup
    if(path==='/create'){
      const{slug,label}=body;
      if(!slug)return err('slug required');
      const date=label||dateStr();
      const fromPrefix=`${slug}/`;
      const toPrefix=`backup/${date}/${slug}/`;
      const result=await copyPrefix(env,fromPrefix,toPrefix);
      if(!result.total)return err('No pages found for slug: '+slug);
      // Update index
      const idx=await getIndex(env,slug);
      if(!idx.includes(date))idx.push(date);
      idx.sort();
      await saveIndex(env,slug,idx);
      // Update global index
      const gi=await env.KV.get('backup:global-index').catch(()=>null);
      const slugs=gi?JSON.parse(gi):[];
      if(!slugs.includes(slug))slugs.push(slug);
      await env.KV.put('backup:global-index',JSON.stringify(slugs),{expirationTtl:86400*180}).catch(()=>{});
      // Log
      await env.KV.put(`backup:log:${slug}:${date}`,JSON.stringify({
        slug,date,pages:result.total,errors:result.errors.length,
        createdAt:new Date().toISOString(),
      }),{expirationTtl:86400*180}).catch(()=>{});
      return ok({slug,date,pages:result.total,errors:result.errors,backup_prefix:toPrefix});
    }

    // POST /restore — restore from specific date
    if(path==='/restore'){
      const{slug,date}=body;
      if(!slug||!date)return err('slug and date required');
      const idx=await getIndex(env,slug);
      if(!idx.includes(date))return err(`No backup found for date: ${date}. Available: ${idx.join(', ')}`);
      const fromPrefix=`backup/${date}/${slug}/`;
      const toPrefix=`${slug}/`;
      // First check backup exists
      const check=await env.R2.list({prefix:fromPrefix,limit:1});
      if(!check.objects.length)return err('Backup prefix is empty: '+fromPrefix);
      const result=await copyPrefix(env,fromPrefix,toPrefix);
      await env.KV.put(`backup:restore:${slug}`,JSON.stringify({
        slug,date,pages:result.total,restoredAt:new Date().toISOString(),
      }),{expirationTtl:86400*7}).catch(()=>{});
      return ok({slug,date,restored:result.total,errors:result.errors});
    }

    // POST /restore-latest — restore from most recent backup
    if(path==='/restore-latest'){
      const{slug}=body;
      if(!slug)return err('slug required');
      const idx=await getIndex(env,slug);
      if(!idx.length)return err('No backups found for slug: '+slug);
      const date=idx[idx.length-1];
      const fromPrefix=`backup/${date}/${slug}/`;
      const toPrefix=`${slug}/`;
      const result=await copyPrefix(env,fromPrefix,toPrefix);
      return ok({slug,date,restored:result.total,errors:result.errors,note:'Restored from latest backup'});
    }

    // POST /delete — delete a backup snapshot
    if(path==='/delete'){
      const{slug,date}=body;
      if(!slug||!date)return err('slug and date required');
      const prefix=`backup/${date}/${slug}/`;
      const deleted=await deletePrefix(env,prefix);
      const idx=await getIndex(env,slug);
      const updated=idx.filter(d=>d!==date);
      await saveIndex(env,slug,updated);
      return ok({slug,date,deleted,remaining_backups:updated});
    }

    // POST /schedule — auto-backup all known slugs (call from cron or manually)
    if(path==='/schedule'){
      const gi=await env.KV.get('backup:global-index').catch(()=>null);
      const slugs=gi?JSON.parse(gi):[];
      if(!slugs.length)return ok({message:'No slugs registered yet',slugs:0});
      const date=dateStr();
      const results=[];
      for(const slug of slugs){
        try{
          const fromPrefix=`${slug}/`;
          const toPrefix=`backup/${date}/${slug}/`;
          const r=await copyPrefix(env,fromPrefix,toPrefix,500); // limit per site
          const idx=await getIndex(env,slug);
          if(!idx.includes(date))idx.push(date);
          // Keep only last 7 backups
          while(idx.length>7){
            const old=idx.shift();
            await deletePrefix(env,`backup/${old}/${slug}/`).catch(()=>{});
          }
          await saveIndex(env,slug,idx);
          results.push({slug,pages:r.total,ok:true});
        }catch(e){
          results.push({slug,error:e.message,ok:false});
        }
      }
      return ok({date,scheduled:slugs.length,results});
    }

    return err('Unknown endpoint. Use /create, /restore, /restore-latest, /delete, /schedule',404);
  }
};
