const CORS = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
const ok  = (d, s=200) => new Response(JSON.stringify(d), {status:s, headers:{'Content-Type':'application/json',...CORS}});
const err = (msg, s=400) => ok({error:msg}, s);

// [primary, accent, emoji, label]
const NS = {
  'Lingerie':    ['#e879a0','#fce7f3','👙','Mode & Intimité'],
  'Mode Femme':  ['#9333ea','#f5f3ff','👗','Mode Féminine'],
  'Mode Homme':  ['#3b82f6','#eff6ff','👔','Mode Masculine'],
  'Luminaires':  ['#f59e0b','#fffbeb','💡','Éclairage & Design'],
  'Décoration':  ['#10b981','#ecfdf5','🏠','Décoration Intérieure'],
  'Beauté':      ['#f43f5e','#fff1f2','💄','Beauté & Soins'],
  'Bien-être':   ['#06b6d4','#ecfeff','🧘','Bien-être & Santé'],
  'Sport':       ['#22c55e','#f0fdf4','🏃','Sport & Outdoor'],
  'Bijoux':      ['#a855f7','#faf5ff','💍','Bijoux & Accessoires'],
  'Bagagerie':   ['#3b82f6','#eff6ff','🧳','Bagagerie & Voyage'],
  'Maroquinerie':['#92400e','#fef3c7','👜','Maroquinerie & Cuir'],
  'Accessoires': ['#ec4899','#fdf2f8','🎩','Accessoires Mode'],
  'High-Tech':   ['#6366f1','#eef2ff','💻','High-Tech & Gaming'],
  'Enfants':     ['#84cc16','#f7fee7','🧒','Enfants & Puériculture'],
  'Alimentaire': ['#f97316','#fff7ed','🍽️','Épicerie Fine'],
  'Animaux':     ['#fb923c','#fff7ed','🐾','Animaux & Compagnie'],
  'Voyage':      ['#0ea5e9','#f0f9ff','✈️','Voyage & Aventure'],
  'Auto':        ['#64748b','#f8fafc','🚗','Auto & Moto'],
};

const brand = d => d.replace(/\.(fr|com|net|org|eu|io)$/,'').replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const slug  = d => d.replace(/\.(fr|com|net|org|eu|io)$/,'').replace(/[^a-z0-9]/gi,'-').toLowerCase();
const yr    = () => new Date().getFullYear();

function layout(title, desc, canonical, ld, body, p, ac) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><meta name="description" content="${desc}">
<meta property="og:title" content="${title}"><meta property="og:description" content="${desc}">
<meta property="og:type" content="website"><link rel="canonical" href="${canonical}">
<script type="application/ld+json">${ld}</script>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a}
a{text-decoration:none}
.hdr{background:${p};color:#fff;padding:1rem 2rem;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10}
.hdr a{color:#fff;font-weight:700;font-size:1.2rem}.hdr nav a{font-size:.88rem;font-weight:400;margin-left:1.2rem;color:rgba(255,255,255,.88)}
.ftr{background:#111;color:#888;padding:2rem;text-align:center;font-size:.82rem;margin-top:3rem}
.ftr a{color:#aaa;margin:0 .8rem}.ftr a:hover{color:#fff}
.hero{background:${ac};padding:3.5rem 2rem;text-align:center}
.hero h1{font-size:2.2rem;font-weight:800;color:${p};margin-bottom:.8rem}
.hero p{color:#555;max-width:600px;margin:0 auto 1.5rem;font-size:1.05rem}
.cta{background:${p};color:#fff;padding:.75rem 2rem;border-radius:8px;font-weight:700;display:inline-block}
.sec{max-width:1200px;margin:0 auto;padding:3rem 2rem}
.sec h2{font-size:1.4rem;font-weight:700;margin-bottom:1.5rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1.2rem}
.card{border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;transition:transform .2s,box-shadow .2s}
.card:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,.09)}
.card-img{height:150px;display:flex;align-items:center;justify-content:center;background:${ac};font-size:3rem}
.card-body{padding:1rem 1.2rem}
.card-body h3{font-size:.95rem;font-weight:700;margin-bottom:.3rem}
.card-sub{font-size:.78rem;color:#777;margin-bottom:.7rem}
.card-cta{font-size:.8rem;font-weight:700;color:${p}}
.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:1rem}
.pc{border:1px solid #e5e7eb;border-radius:10px;overflow:hidden}
.pc-img{height:130px;display:flex;align-items:center;justify-content:center;background:${ac};font-size:2.5rem}
.pc-body{padding:.8rem}
.pc-name{font-size:.85rem;font-weight:600;margin-bottom:.3rem}
.pc-price{font-size:.92rem;font-weight:700;color:${p};margin-bottom:.6rem}
.pc-btn{width:100%;padding:.45rem;border:none;border-radius:6px;background:${p};color:#fff;font-size:.78rem;font-weight:600;cursor:pointer}
.bc{padding:.7rem 2rem;font-size:.8rem;color:#888;background:#f9fafb;border-bottom:1px solid #e5e7eb}
.bc a{color:#888}.bc a:hover{color:${p}}
.legal{max-width:820px;margin:0 auto;padding:3rem 2rem;line-height:1.8}
.legal h1{font-size:1.8rem;margin-bottom:1.5rem}
.legal h2{font-size:1.1rem;margin:1.5rem 0 .5rem;color:#111}
@media(max-width:600px){.hero h1{font-size:1.7rem}.grid{grid-template-columns:1fr 1fr}}
</style></head><body>${body}</body></html>`;
}

function hdr(b,p) { return `<header class="hdr"><a href="/">${b}</a><nav><a href="/collections/">Collections</a><a href="/cgv/">CGV</a></nav></header>`; }
function ftr(b)   { return `<footer class="ftr"><p>© ${yr()} ${b} — Tous droits réservés</p><p style="margin-top:.5rem"><a href="/mentions-legales/">Mentions légales</a><a href="/cgv/">CGV</a><a href="/confidentialite/">Confidentialité</a></p></footer>`; }

function genHome(bp, niche, domain) {
  const b=brand(domain), [p,ac,em,lb]=NS[niche]||['#3b82f6','#eff6ff','🛍️','Boutique'];
  const cols=(bp.mvpSelection||bp.allCollections||[]).slice(0,12);
  const cards=cols.map(c=>`<a href="${c.path}/" class="card"><div class="card-img">${em}</div><div class="card-body"><h3>${c.title}</h3><p class="card-sub">${c.products?c.products+' produits':'Voir la collection'}</p><span class="card-cta">Découvrir →</span></div></a>`).join('');
  const ldItems=cols.map((c,i)=>`{"@type":"ListItem","position":${i+1},"name":${JSON.stringify(c.title)},"url":"https://${domain}${c.path}/"}`).join(',');
  const ld=`{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":${JSON.stringify(b)},"url":"https://${domain}"},{"@type":"WebSite","url":"https://${domain}","potentialAction":{"@type":"SearchAction","target":"https://${domain}/search?q={search_term_string}","query-input":"required name=search_term_string"}},{"@type":"ItemList","name":"Collections","itemListElement":[${ldItems}]}]}`;
  const desc=`${b} — ${lb}. ${bp.totalCollections} collections disponibles. Livraison rapide en France et en Europe.`;
  const body=`${hdr(b,p)}<section class="hero"><h1>${b}</h1><p>${lb} — ${bp.totalCollections} collections disponibles. Livraison rapide.</p><a href="/collections/" class="cta">Voir toutes les collections</a></section><section class="sec"><h2>Nos collections</h2><div class="grid">${cards}</div></section>${ftr(b)}`;
  return layout(`${b} — ${lb}`, desc, `https://${domain}/`, ld, body, p, ac);
}

function genCollIndex(bp, niche, domain) {
  const b=brand(domain),[p,ac,em,lb]=NS[niche]||['#3b82f6','#eff6ff','🛍️','Boutique'];
  const cols=bp.allCollections||bp.mvpSelection||[];
  const cards=cols.map(c=>`<a href="${c.path}/" class="card"><div class="card-img">${em}</div><div class="card-body"><h3>${c.title}</h3><p class="card-sub">${c.products?c.products+' produits':''}</p><span class="card-cta">Voir →</span></div></a>`).join('');
  const ld=`{"@context":"https://schema.org","@type":"CollectionPage","name":"Collections | ${b}","url":"https://${domain}/collections/"}`;
  const body=`${hdr(b,p)}<section class="hero"><h1>Toutes nos collections</h1><p>${cols.length} collections ${lb.toLowerCase()} disponibles.</p></section><section class="sec"><div class="grid">${cards}</div></section>${ftr(b)}`;
  return layout(`Collections | ${b}`, `Toutes nos collections ${lb.toLowerCase()} — ${b}.`, `https://${domain}/collections/`, ld, body, p, ac);
}

function genColl(col, bp, niche, domain) {
  const b=brand(domain),[p,ac,em]=NS[niche]||['#3b82f6','#eff6ff','🛍️'];
  const n=Math.min(col.products||12,24);
  const prods=Array.from({length:n},(_,i)=>`<div class="pc"><div class="pc-img">${em}</div><div class="pc-body"><p class="pc-name">${col.title} ${i+1}</p><p class="pc-price">À partir de 29,90€</p><button class="pc-btn" style="background:${p}">Voir le produit</button></div></div>`).join('');
  const ld=`{"@context":"https://schema.org","@type":"CollectionPage","name":${JSON.stringify(col.title)},"url":"https://${domain}${col.path}/","breadcrumb":{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Accueil","item":"https://${domain}/"},{"@type":"ListItem","position":2,"name":"Collections","item":"https://${domain}/collections/"},{"@type":"ListItem","position":3,"name":${JSON.stringify(col.title)}}]}}`;
  const desc=`${col.title} — ${col.products?col.products+' produits. ':''} ${b}. Livraison rapide en France.`;
  const bc=`<nav class="bc"><a href="/">Accueil</a> › <a href="/collections/">Collections</a> › ${col.title}</nav>`;
  const body=`${hdr(b,p)}${bc}<section class="hero"><h1>${col.title}</h1><p>${col.products?col.products+' produits disponibles':'Découvrez notre sélection'}</p></section><section class="sec"><div class="pgrid">${prods}</div></section>${ftr(b)}`;
  return layout(`${col.title} | ${b}`, desc, `https://${domain}${col.path}/`, ld, body, p, ac);
}

function genLegal(domain, type) {
  const b=brand(domain);
  const [p,ac]=['#3b82f6','#eff6ff'];
  const sections = {
    mentions: {title:'Mentions légales', path:'/mentions-legales/', body:`<h2>Éditeur</h2><p>${b} — site de vente en ligne.<br>Contact : contact@${domain}</p><h2>Hébergement</h2><p>Cloudflare, Inc. — 101 Townsend St, San Francisco, CA 94107, USA</p><h2>Propriété intellectuelle</h2><p>Tous les contenus de ce site sont la propriété de ${b}.</p><h2>Données personnelles (RGPD)</h2><p>Droit d'accès, rectification, suppression : contact@${domain}</p>`},
    cgv:      {title:'CGV', path:'/cgv/', body:`<h2>Art. 1 — Objet</h2><p>Les présentes CGV régissent les ventes sur ${domain}.</p><h2>Art. 2 — Prix</h2><p>Prix en euros TTC. Modifiables sans préavis.</p><h2>Art. 3 — Livraison</h2><p>France métropolitaine et Europe. Délai : 3 à 7 jours ouvrés.</p><h2>Art. 4 — Rétractation</h2><p>Délai de 14 jours (art. L221-18 Code conso.).</p><h2>Art. 5 — Contact</h2><p>contact@${domain}</p>`},
    confidentialite: {title:'Confidentialité', path:'/confidentialite/', body:`<h2>Données collectées</h2><p>Uniquement les données nécessaires au traitement des commandes.</p><h2>Base légale</h2><p>RGPD art. 6.1.b — exécution du contrat.</p><h2>Conservation</h2><p>3 ans après la dernière commande.</p><h2>Vos droits</h2><p>Accès, rectification, suppression, portabilité : contact@${domain}</p>`},
  };
  const s=sections[type];
  const ld=`{"@context":"https://schema.org","@type":"WebPage","name":${JSON.stringify(s.title+' | '+b)},"url":"https://${domain}${s.path}"}`;
  const body=`${hdr(b,p)}<div class="legal"><h1>${s.title}</h1>${s.body}<p style="margin-top:2rem"><a href="/" style="color:#3b82f6">← Retour à l'accueil</a></p></div>${ftr(b)}`;
  return layout(`${s.title} | ${b}`, `${s.title} — ${b}`, `https://${domain}${s.path}`, ld, body, p, ac);
}

function genSitemap(bp, domain) {
  const d=new Date().toISOString().slice(0,10);
  const cols=(bp.allCollections||[]).map(c=>`<url><loc>https://${domain}${c.path}/</loc><lastmod>${d}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://${domain}/</loc><lastmod>${d}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url><url><loc>https://${domain}/collections/</loc><lastmod>${d}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>${cols}<url><loc>https://${domain}/mentions-legales/</loc><lastmod>${d}</lastmod><changefreq>yearly</changefreq><priority>0.2</priority></url><url><loc>https://${domain}/cgv/</loc><lastmod>${d}</lastmod><changefreq>yearly</changefreq><priority>0.2</priority></url></urlset>`;
}

async function buildAndStore(bp, niche, domain, env) {
  const sl=slug(domain), pre=`site:${sl}:`;
  const cols=bp.allCollections||bp.mvpSelection||[];
  const files = {
    '/':                  genHome(bp, niche, domain),
    '/collections/':      genCollIndex(bp, niche, domain),
    '/mentions-legales/': genLegal(domain,'mentions'),
    '/cgv/':              genLegal(domain,'cgv'),
    '/confidentialite/':  genLegal(domain,'confidentialite'),
    '/sitemap.xml':       genSitemap(bp, domain),
    '/robots.txt':        `User-agent: *\nAllow: /\nSitemap: https://${domain}/sitemap.xml\n`,
  };
  for (const col of cols) files[col.path+'/'] = genColl(col, bp, niche, domain);
  await Promise.all(Object.entries(files).map(([path,html])=>env.KV.put(pre+path, html, {expirationTtl:86400*365})));
  await env.KV.put(pre+'__meta', JSON.stringify({domain,niche,slug:sl,pages:Object.keys(files).length,deployedAt:new Date().toISOString()}), {expirationTtl:86400*365});
  return {slug:sl, pages:Object.keys(files).length, serverUrl:`https://v35-site-server.ernestpedanou.workers.dev/${sl}/`};
}

export default {
  async fetch(request, env) {
    if (request.method==='OPTIONS') return new Response(null,{status:204,headers:CORS});
    if (request.method!=='POST') return err('POST only',405);
    let body={};
    try{body=await request.json();}catch{return err('Invalid JSON');}
    const {blueprint,niche,domain} = body;
    if (!blueprint||!domain) return err('blueprint + domain requis');
    if (!blueprint.allCollections?.length && !blueprint.mvpSelection?.length) return err('blueprint vide — aucune collection');
    try {
      const result = await buildAndStore(blueprint, niche||'Mode Femme', domain, env);
      return ok({success:true,...result});
    } catch(e) {
      return err(e.message, 500);
    }
  }
};
