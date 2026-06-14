// V35 Media Gen — AI images (Cloudflare Workers AI) + CSS video showcase
// POST /image       {slug, filename, prompt, niche, type:hero|product|collection}
// POST /batch-site  {slug, niche, domain, lang, pages:[{path,type,name}]}
// POST /inject      {slug, niche, domain} — inject generated images into R2 HTML
// POST /video       {slug, page_path, niche, name, lang} — inject CSS video section
// GET  /list?slug=  — list generated media for a slug

const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'};
const ok=(d,s=200)=>new Response(JSON.stringify({ok:true,...d}),{status:s,headers:{'Content-Type':'application/json',...CORS}});
const err=(m,s=400)=>new Response(JSON.stringify({ok:false,error:m}),{status:s,headers:{'Content-Type':'application/json',...CORS}});

// ── Image prompts per niche ──────────────────────────────────────────────────
const PROMPTS={
  Jewellery:{
    hero:'luxury gold jewellery flat lay on white marble, rings necklaces bracelets, professional product photography, high-end editorial, soft natural window light, 4k ultra detailed',
    collection:'elegant jewellery collection arranged on dark velvet, gold and silver pieces, studio lighting, luxury boutique display',
    product:'fine jewellery piece on pure white background, macro detail, soft shadow, professional product shot, luxury brand quality',
    lifestyle:'woman wearing delicate gold jewellery, natural light, minimalist aesthetic, fashion editorial, clean background',
  },
  Jewelry:{
    hero:'luxury fine jewelry flat lay on white marble, diamond rings gold necklaces, professional product photography, editorial high-end',
    collection:'fine jewelry collection on black velvet, brilliant cut diamonds, gold settings, studio light',
    product:'fine jewelry piece white background, macro photography, soft shadow, luxury product shot',
    lifestyle:'elegant woman wearing fine jewelry, natural portrait light, sophisticated style',
  },
  Bijoux:{
    hero:'bijoux luxueux sur marbre blanc, bagues colliers bracelets dorés, photographie produit professionnelle, lumière naturelle douce',
    collection:'collection de bijoux élégants sur velours sombre, or et argent, éclairage studio luxe',
    product:'bijou délicat fond blanc pur, détail macro, ombre douce, photographie produit professionnelle',
    lifestyle:'femme portant des bijoux dorés délicats, lumière naturelle, esthétique minimaliste, editorial mode',
  },
  Lingerie:{
    hero:'elegant lingerie flat lay on white silk sheets, satin and lace, soft morning light, premium quality, fashion editorial',
    collection:'lingerie collection flat lay, pastel colors, lace detail, minimalist white background, premium quality',
    product:'elegant lingerie on white background, satin texture detail, soft light, fashion product photography',
    lifestyle:'fashion model in elegant lingerie, soft natural light, boudoir aesthetic, tasteful editorial',
  },
  'Mode Femme':{
    hero:'women fashion editorial flat lay, elegant clothing accessories on marble, spring collection, clean minimal aesthetic',
    collection:'women clothing collection flat lay, colorful fashion pieces arranged neatly, editorial photography',
    product:'women fashion item on white background, clean professional product photography, editorial quality',
    lifestyle:'stylish woman wearing elegant outfit, natural light, modern fashion editorial, urban setting',
  },
  Beauté:{
    hero:'luxury beauty products flat lay on white marble, serums creams perfumes, botanical elements, soft light, high-end cosmetics',
    collection:'beauty product collection arranged elegantly, gold packaging, white and pink tones, studio light',
    product:'luxury beauty product white background, glass texture detail, soft shadow, premium cosmetics photography',
    lifestyle:'woman with glowing skin holding luxury beauty product, clean minimal background, natural light',
  },
  Décoration:{
    hero:'luxury home decor flat lay, vases sculptures candles on marble surface, interior design editorial, soft natural light',
    collection:'curated home decor collection, elegant objects arranged on white surface, interior design photography',
    product:'home decor item on white background, professional product photography, clean minimal aesthetic',
    lifestyle:'elegant living room with luxury decor items, interior design photography, natural light, modern home',
  },
  default:{
    hero:'luxury premium product flat lay on white marble, professional product photography, editorial quality, soft natural light, 4k',
    collection:'elegant product collection arranged on white surface, studio photography, clean minimal aesthetic',
    product:'premium product white background, professional photography, soft shadow, high quality',
    lifestyle:'person using premium product, natural light, lifestyle photography, clean aesthetic',
  },
};

function getPrompt(niche,type,name=''){
  const n=PROMPTS[niche]||PROMPTS.default;
  const base=n[type]||n.product||PROMPTS.default.product;
  return name?base.replace(/{name}/g,name):base;
}

// ── Generate image via CF Workers AI ────────────────────────────────────────
async function generateImage(env,prompt,width=1024,height=1024){
  if(!env.AI) throw new Error('AI binding not available');
  const result=await env.AI.run('@cf/bytedance/stable-diffusion-xl-lightning',{
    prompt,
    num_steps:4,
    width,
    height,
  });
  // Returns ReadableStream or Uint8Array
  if(result instanceof ReadableStream){
    const chunks=[];
    const reader=result.getReader();
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      chunks.push(value);
    }
    const total=chunks.reduce((s,c)=>s+c.length,0);
    const arr=new Uint8Array(total);
    let off=0;
    for(const c of chunks){arr.set(c,off);off+=c.length;}
    return arr;
  }
  if(result instanceof Uint8Array) return result;
  throw new Error('Unexpected AI response format');
}

// ── Store image in R2 ────────────────────────────────────────────────────────
async function storeImage(env,key,imageData){
  await env.R2.put(key,imageData,{httpMetadata:{contentType:'image/jpeg'}});
  // Index in KV
  const idx=await env.KV.get('media:index').catch(()=>null);
  const list=idx?JSON.parse(idx):[];
  if(!list.includes(key))list.push(key);
  await env.KV.put('media:index',JSON.stringify(list),{expirationTtl:86400*90}).catch(()=>{});
  return key;
}

// ── Get R2 HTML ──────────────────────────────────────────────────────────────
async function r2get(env,key){
  const obj=await env.R2.get(key);
  if(!obj)return null;
  return new Response(obj.body).text();
}
async function r2put(env,key,html){
  await env.R2.put(key,html,{httpMetadata:{contentType:'text/html;charset=UTF-8'}});
}

// ── Inject image into HTML (replace emoji placeholder) ──────────────────────
function injectImageIntoHTML(html,imgUrl,type){
  if(type==='hero'){
    // Replace hero background or add <img> in hero-inner
    return html.replace(
      /(<div class="hero-inner">)/,
      `<img src="${imgUrl}" alt="hero" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.35;z-index:0">$1`
    );
  }
  if(type==='product'||type==='collection'){
    // Inject into first .pc-img (replace or prepend img)
    return html.replace(
      /(<div class="pc-img">)/,
      `$1<img src="${imgUrl}" class="pc-img-real" alt="" loading="lazy">`
    );
  }
  return html;
}

// ── CSS video showcase section ────────────────────────────────────────────────
function buildVideoSection(niche,name,lang,em){
  const e=lang==='en';
  const titles={
    Jewellery:e?'The Craft Behind Every Piece':'Le savoir-faire derrière chaque pièce',
    Lingerie:e?'Comfort Meets Elegance':'Le confort rencontre l\'élégance',
    default:e?'Discover Our World':'Découvrez notre univers',
  };
  const subs={
    Jewellery:e?'Each creation is handcrafted by master artisans.':'Chaque création est façonnée à la main par des artisans maîtres.',
    default:e?'Premium quality, exceptional experience.':'Qualité premium, expérience exceptionnelle.',
  };
  const title=(titles[niche]||titles.default);
  const sub=(subs[niche]||subs.default);
  return `<section style="padding:4rem 0"><div class="vid-wrap"><div class="vid-inner">${em||'✨'}</div><div class="vid-ov"></div><div class="vid-cap"><h2>${title}</h2><p>${sub}</p><a href="/collections/" style="display:inline-block;background:#fff;color:#111;padding:.65rem 1.6rem;font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;font-weight:700">${e?'Explore Collections':'Voir les collections'}</a></div><div class="vid-play"><div class="vid-playbtn">▶</div></div></div></section>`;
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default{
  async fetch(request,env){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
    const url=new URL(request.url);
    const path=url.pathname.replace(/\/+$/,'');

    // GET /list
    if(request.method==='GET'&&path==='/list'){
      const slug=url.searchParams.get('slug');
      if(!slug)return err('slug param required');
      // List R2 objects with prefix
      const list=await env.R2.list({prefix:`${slug}/media/`});
      const items=list.objects.map(o=>({key:o.key,size:o.size,uploaded:o.uploaded}));
      return ok({slug,count:items.length,media:items});
    }

    if(request.method!=='POST')return err('POST or GET only',405);
    let body={};
    try{body=await request.json();}catch{return err('Invalid JSON');}

    // POST /image — generate single image
    if(path==='/image'){
      const{slug,filename,prompt:customPrompt,niche='default',type='product',name=''}=body;
      if(!slug)return err('slug required');
      const prompt=customPrompt||getPrompt(niche,type,name);
      try{
        const imgData=await generateImage(env,prompt,
          type==='hero'?1216:type==='collection'?1024:1024,
          type==='hero'?832:1024
        );
        const key=`${slug}/media/${filename||type+'-'+Date.now()}.jpg`;
        await storeImage(env,key,imgData);
        return ok({slug,key,type,prompt,size:imgData.length});
      }catch(e2){
        return err('Image generation failed: '+e2.message,500);
      }
    }

    // POST /batch-site — generate all images for a site
    if(path==='/batch-site'){
      const{slug,niche='default',domain='',pages=[]}=body;
      if(!slug)return err('slug required');
      const targets=pages.length?pages:[
        {type:'hero',filename:'hero'},
        {type:'collection',filename:'collection-1'},
        {type:'lifestyle',filename:'lifestyle-1'},
        {type:'product',filename:'product-1'},
      ];
      const results=[];
      for(const t of targets){
        try{
          const prompt=t.prompt||getPrompt(niche,t.type,t.name);
          const w=t.type==='hero'?1216:1024;
          const h=t.type==='hero'?832:1024;
          const imgData=await generateImage(env,prompt,w,h);
          const key=`${slug}/media/${t.filename||t.type+'-'+Date.now()}.jpg`;
          await storeImage(env,key,imgData);
          results.push({type:t.type,key,size:imgData.length,ok:true});
        }catch(e2){
          results.push({type:t.type,error:e2.message,ok:false});
        }
      }
      return ok({slug,niche,generated:results.filter(r=>r.ok).length,results});
    }

    // POST /inject — inject generated images into site HTML pages
    if(path==='/inject'){
      const{slug,niche='default'}=body;
      if(!slug)return err('slug required');
      // List all generated media
      const mediaList=await env.R2.list({prefix:`${slug}/media/`});
      if(!mediaList.objects.length)return err('No media found for this slug. Run /batch-site first.');
      const results=[];
      // Inject hero into homepage
      const heroObj=mediaList.objects.find(o=>o.key.includes('hero'));
      if(heroObj){
        const html=await r2get(env,`${slug}/`);
        if(html){
          const imgUrl=`/media/${heroObj.key.split('/media/')[1]}`;
          const updated=injectImageIntoHTML(html,heroObj.key,  'hero');
          await r2put(env,`${slug}/`,updated);
          results.push({page:'homepage',injected:'hero'});
        }
      }
      return ok({slug,results,mediaCount:mediaList.objects.length});
    }

    // POST /video — inject CSS video showcase into a page
    if(path==='/video'){
      const{slug,page_path='/',niche='default',name='',lang='en',em='✨'}=body;
      if(!slug)return err('slug required');
      const key=`${slug}${page_path.endsWith('/')?page_path:page_path+'/'}`;
      const html=await r2get(env,key);
      if(!html)return err('Page not found in R2: '+key);
      const videoSection=buildVideoSection(niche,name,lang,em);
      // Inject after hero section
      const marker='</section>';
      const idx=html.indexOf(marker);
      const updated=idx>-1
        ?html.slice(0,idx+marker.length)+videoSection+html.slice(idx+marker.length)
        :html+videoSection;
      await r2put(env,key,updated);
      return ok({slug,page:key,video_injected:true});
    }

    // POST /full-media — batch generate + inject + video in one call
    if(path==='/full-media'){
      const{slug,niche='default',domain='',lang='en',em='✨'}=body;
      if(!slug)return err('slug required');
      const log=[];
      // 1. Generate images
      try{
        const batchRes=await fetch(new URL('/batch-site',request.url),{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({slug,niche,domain}),
        });
        const bd=await batchRes.json();
        log.push({step:'batch-generate',generated:bd.generated});
      }catch(e2){log.push({step:'batch-generate',error:e2.message});}
      // 2. Inject video on homepage
      try{
        const vidRes=await fetch(new URL('/video',request.url),{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({slug,page_path:'/',niche,lang,em}),
        });
        const vd=await vidRes.json();
        log.push({step:'video',injected:vd.ok});
      }catch(e2){log.push({step:'video',error:e2.message});}
      return ok({slug,niche,steps:log});
    }

    return err('Unknown endpoint',404);
  }
};
