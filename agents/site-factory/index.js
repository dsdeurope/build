// V35 Site Factory — Structure luminairestendance-level, multi-lang, luxury
// POST / → { blueprint, niche, domain, lang? }

const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
const ok=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json',...CORS}});
const err=(m,s=400)=>ok({error:m},s);

// [primary, primaryDark, accentBg, emoji, label-fr, label-en, promoFr, promoEn]
const NS={
  'Lingerie':    ['#c0507a','#8b2e52','#fce7f3','👙','Mode & Intimité','Lingerie & Intimates','Livraison offerte dès 49€','Free delivery from €49'],
  'Mode Femme':  ['#7c3aed','#5b21b6','#f5f3ff','👗','Mode Féminine',"Women's Fashion",'Livraison offerte dès 49€','Free delivery from €49'],
  'Mode Homme':  ['#2563eb','#1d4ed8','#eff6ff','👔','Mode Masculine',"Men's Fashion",'Livraison offerte dès 49€','Free delivery from €49'],
  'Luminaires':  ['#d97706','#92400e','#fffbeb','💡','Éclairage','Lighting','Livraison offerte dès 65€','Free delivery from €65'],
  'Décoration':  ['#059669','#065f46','#ecfdf5','🏠','Décoration','Home Décor','Livraison offerte dès 49€','Free delivery from €49'],
  'Beauté':      ['#db2777','#9d174d','#fff1f2','💄','Beauté','Beauty','Livraison offerte dès 39€','Free delivery from €39'],
  'Bijoux':      ['#b45309','#78350f','#fef3c7','💍','Bijoux','Fine Jewellery','Livraison offerte — Retours 30j','Free shipping · 30-day returns'],
  'Jewellery':   ['#b45309','#78350f','#fef3c7','💍','Fine Jewellery','Fine Jewellery','Free shipping · 30-day returns · Use NOVA10 for 10% off','Free shipping · 30-day returns · Use NOVA10 for 10% off'],
  'Jewelry':     ['#9a7d3a','#6b5228','#fdf8ed','💍','Fine Jewelry','Fine Jewelry','Free shipping · Use NOVA10 for 10% off','Free shipping · Use NOVA10 for 10% off'],
  'Sport':       ['#16a34a','#15803d','#f0fdf4','🏃','Sport','Sport','Livraison offerte dès 49€','Free delivery from €49'],
  'Bien-être':   ['#0891b2','#0e7490','#ecfeff','🧘','Bien-être','Wellness','Livraison offerte dès 39€','Free delivery from €39'],
  'Maroquinerie':['#92400e','#78350f','#fef3c7','👜','Maroquinerie','Leather Goods','Livraison offerte — Authentique','Free delivery · Authentic leather'],
  'Accessoires': ['#be185d','#9d174d','#fdf2f8','🎩','Accessoires','Accessories','Livraison offerte dès 39€','Free delivery from €39'],
  'High-Tech':   ['#4f46e5','#4338ca','#eef2ff','💻','High-Tech','Electronics','Garantie 2 ans · Livraison offerte','2-year warranty · Free delivery'],
  'Enfants':     ['#65a30d','#4d7c0f','#f7fee7','🧒','Enfants','Kids','Livraison offerte dès 39€','Free delivery from €39'],
  'Animaux':     ['#d97706','#b45309','#fff7ed','🐾','Animaux','Pet Shop','Livraison offerte dès 39€','Free delivery from €39'],
  'Voyage':      ['#0284c7','#075985','#f0f9ff','✈️','Voyage','Travel','Livraison offerte dès 59€','Free delivery from €59'],
  'Auto':        ['#475569','#334155','#f8fafc','🚗','Auto & Moto','Auto','Livraison offerte dès 49€','Free delivery from €49'],
};
const brand=d=>d.replace(/\.(fr|com|net|org|eu|io|co\.uk)$/,'').replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const slug=d=>d.replace(/\.(fr|com|net|org|eu|io|co\.uk)$/,'').replace(/[^a-z0-9]/gi,'-').toLowerCase();
const yr=()=>new Date().getFullYear();
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function css(p,pd,ac){return `:root{--p:${p};--pd:${pd};--a:${ac}}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;color:#1a1a1a;background:#fff;line-height:1.6}
a{text-decoration:none;color:inherit}img{max-width:100%;display:block}
.promo{background:var(--pd);color:#fff;text-align:center;padding:.5rem 1rem;font-size:.75rem;letter-spacing:.06em}
.promo strong{font-weight:700}
.nav{position:sticky;top:0;z-index:200;background:rgba(255,255,255,.97);backdrop-filter:blur(20px);border-bottom:1px solid #e8e4df;box-shadow:0 1px 8px rgba(0,0,0,.04)}
.nav-i{max-width:1280px;margin:0 auto;padding:0 1.5rem;height:68px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:1rem}
.nav-l{display:flex;gap:1.8rem;align-items:center}
.nav-l a{font-size:.72rem;letter-spacing:.09em;text-transform:uppercase;color:#555;transition:color .2s;white-space:nowrap}
.nav-l a:hover{color:var(--p)}
.logo{font:normal 1.25rem/1 Georgia,serif;letter-spacing:.2em;text-transform:uppercase;color:#111;text-align:center;justify-self:center}
.nav-r{display:flex;gap:1.4rem;align-items:center;justify-content:flex-end}
.nav-r a{font-size:.72rem;letter-spacing:.09em;text-transform:uppercase;color:#555;transition:color .2s}
.nav-r a:hover{color:var(--p)}
.nav-icon{cursor:pointer;color:#444;transition:color .2s;display:flex;align-items:center}
.nav-icon:hover{color:var(--p)}
.hero{min-height:88vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(150deg,var(--p) 0%,var(--pd) 100%);padding:5rem 2rem;text-align:center;position:relative;overflow:hidden}
.hero::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 25% 50%,rgba(255,255,255,.1),transparent 60%)}
.hero-inner{position:relative;z-index:1;max-width:680px}
.hero-tag{font-size:.65rem;letter-spacing:.4em;text-transform:uppercase;color:rgba(255,255,255,.72);margin-bottom:1.4rem}
.hero h1{font:normal clamp(2.2rem,5.5vw,4rem)/1.08 Georgia,serif;color:#fff;margin-bottom:1.2rem}
.hero p{color:rgba(255,255,255,.86);font-size:1rem;max-width:480px;margin:0 auto 2.2rem;line-height:1.72}
.hero-ctas{display:flex;gap:.8rem;justify-content:center;flex-wrap:wrap;margin-bottom:2rem}
.btn-w{display:inline-block;padding:.85rem 2.4rem;background:#fff;color:var(--p);font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;font-weight:700;transition:all .22s}
.btn-w:hover{background:var(--p);color:#fff;outline:2px solid rgba(255,255,255,.5);outline-offset:2px}
.btn-o{display:inline-block;padding:.85rem 2.4rem;border:1px solid rgba(255,255,255,.55);color:#fff;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;transition:all .22s}
.btn-o:hover{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.8)}
.hero-trust{display:inline-flex;align-items:center;gap:.6rem;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);padding:.45rem 1.1rem;font-size:.75rem;color:rgba(255,255,255,.9)}
.trust{background:#fafaf8;border-top:1px solid #e8e4df;border-bottom:1px solid #e8e4df;padding:1.1rem 1.5rem}
.trust-i{max-width:1280px;margin:0 auto;display:grid;grid-template-columns:repeat(4,1fr)}
.ti{display:flex;align-items:center;justify-content:center;gap:.65rem;padding:.6rem}
.ti-ico{flex-shrink:0;display:flex;align-items:center;color:var(--p)}
.ti strong{display:block;font-size:.73rem;color:#111;line-height:1.2}
.ti span{font-size:.67rem;color:#999}
.sec{max-width:1280px;margin:0 auto;padding:4.5rem 1.5rem}
.sec-h{text-align:center;margin-bottom:2.8rem}
.sec-eye{font-size:.63rem;letter-spacing:.3em;text-transform:uppercase;color:var(--p);margin-bottom:.65rem}
.sec-h h2{font:normal clamp(1.6rem,3vw,2.2rem)/1.15 Georgia,serif}
.sec-h p{color:#888;font-size:.88rem;max-width:460px;margin:.65rem auto 0;line-height:1.7}
.sec-foot{text-align:center;margin-top:2.4rem}
.sec-foot a{font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:var(--p);font-weight:600;border-bottom:1px solid var(--p);padding-bottom:2px;transition:opacity .2s}
.sec-foot a:hover{opacity:.7}
.pg4{display:grid;grid-template-columns:repeat(4,1fr);gap:1.2rem}
.pcard{background:#fff;border:1px solid #ece8e3;overflow:hidden;transition:box-shadow .28s ease}
.pcard:hover{box-shadow:0 8px 32px rgba(0,0,0,.1)}
.pcard:hover .pci{transform:scale(1.06)}
.pc-img{height:260px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:var(--a);position:relative}
.pci{font-size:4.5rem;transition:transform .38s ease}
.pc-badge{position:absolute;top:10px;left:10px;background:#e11d48;color:#fff;font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;padding:.2rem .55rem;font-weight:700}
.pc-bd{padding:1rem 1.1rem}
.pc-nm{font-size:.83rem;font-weight:500;margin-bottom:.4rem;line-height:1.35;color:#111}
.pc-pr{font:normal .9rem Georgia,serif;color:#111}
.pc-orig{font-size:.78rem;color:#bbb;text-decoration:line-through;margin-left:.5rem;font-family:inherit}
.pc-btn{width:100%;padding:.58rem;background:#111;color:#fff;border:none;font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;margin-top:.75rem;transition:background .22s;font-family:inherit}
.pc-btn:hover{background:var(--p)}
.feat-bg{background:#f5f0ea;padding:4.5rem 1.5rem}
.feat-h{max-width:1280px;margin:0 auto 2.5rem;text-align:center}
.feat-grid{max-width:1280px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:1.2rem}
.fc{display:block;position:relative;height:440px;overflow:hidden;background:var(--pd)}
.fc:hover .fc-img{transform:scale(1.05)}
.fc-img{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:7rem;background:linear-gradient(160deg,var(--p),var(--pd));transition:transform .5s ease}
.fc-overlay{position:absolute;bottom:0;left:0;right:0;padding:1.8rem 1.5rem;background:linear-gradient(to top,rgba(0,0,0,.65) 0%,transparent 100%);color:#fff}
.fc-overlay h3{font:normal 1.25rem/1.2 Georgia,serif;margin-bottom:.3rem}
.fc-overlay p{font-size:.76rem;opacity:.82;margin-bottom:.8rem}
.fc-overlay span{font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;font-weight:700;border-bottom:1px solid rgba(255,255,255,.6);padding-bottom:2px}
.reviews-bg{background:#f9f8f6;padding:4.5rem 1.5rem}
.rev-grid{max-width:1280px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:1.2rem}
.rcard{background:#fff;border:1px solid #ece8e3;padding:1.6rem 1.4rem}
.rcard-stars{color:#f59e0b;font-size:.9rem;margin-bottom:.7rem;letter-spacing:.1em}
.rcard-text{font-size:.85rem;color:#444;line-height:1.7;margin-bottom:1rem;font-style:italic}
.rcard-author{font-size:.73rem;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:.08em}
.about-s{background:#fff;padding:5rem 1.5rem}
.about-i{max-width:1280px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:4rem;align-items:center}
.about-text h2{font:normal clamp(1.5rem,3vw,2rem)/1.25 Georgia,serif;margin-bottom:1.2rem}
.about-text p{color:#666;font-size:.9rem;line-height:1.8;margin-bottom:1.2rem}
.about-img{height:420px;background:linear-gradient(145deg,var(--a),rgba(255,255,255,.5));display:flex;align-items:center;justify-content:center;font-size:8rem;border:1px solid #ece8e3}
.nl{background:var(--pd);padding:4.5rem 2rem;text-align:center;color:#fff}
.nl h2{font:normal 1.7rem Georgia,serif;margin-bottom:.5rem}
.nl p{opacity:.82;font-size:.88rem;margin-bottom:1.6rem}
.nl-f{display:flex;max-width:420px;margin:0 auto;border:1px solid rgba(255,255,255,.35)}
.nl-f input{flex:1;padding:.9rem 1.1rem;border:none;background:rgba(255,255,255,.1);color:#fff;font-size:.85rem;outline:none}
.nl-f input::placeholder{color:rgba(255,255,255,.55)}
.nl-f button{padding:.9rem 1.4rem;background:#fff;color:var(--pd);border:none;font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;font-weight:700;white-space:nowrap}
.ftr{background:#111;color:rgba(255,255,255,.5)}
.ftr-top{max-width:1280px;margin:0 auto;padding:4rem 1.5rem 3rem;display:grid;grid-template-columns:2fr 1fr 1fr 1.2fr;gap:3.5rem}
.ftr-logo{font:normal 1.1rem Georgia,serif;color:#fff;letter-spacing:.2em;text-transform:uppercase;margin-bottom:.9rem}
.ftr-desc{font-size:.77rem;line-height:1.8;margin-bottom:1.1rem}
.ftr-contact{font-size:.77rem;line-height:2}
.ftr-contact a{color:rgba(255,255,255,.55);transition:color .2s}
.ftr-contact a:hover{color:#fff}
.ftr h4{color:#fff;font-size:.62rem;letter-spacing:.22em;text-transform:uppercase;margin-bottom:1rem}
.ftr ul{list-style:none}
.ftr li{margin-bottom:.5rem}
.ftr li a{font-size:.77rem;transition:color .2s}
.ftr li a:hover{color:#fff}
.ftr-social{display:flex;gap:.8rem;margin-top:1rem}
.ftr-social a{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:1px solid rgba(255,255,255,.2);font-size:.9rem;transition:all .2s}
.ftr-social a:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.5)}
.ftr-pay{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1rem}
.pay-badge{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);padding:.25rem .55rem;font-size:.65rem;letter-spacing:.06em;color:rgba(255,255,255,.6)}
.ftr-btm{max-width:1280px;margin:0 auto;padding:1.5rem 1.5rem;border-top:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;align-items:center;font-size:.7rem}
.ftr-btm a{color:rgba(255,255,255,.4);margin:0 .5rem;transition:color .2s}
.ftr-btm a:hover{color:#fff}
.bc{background:#fafaf8;border-bottom:1px solid #e8e4df;padding:.7rem 1.5rem;font-size:.73rem;color:#bbb}
.bc-i{max-width:1280px;margin:0 auto}
.bc a{color:#bbb}.bc a:hover{color:var(--p)}
.legal{max-width:800px;margin:0 auto;padding:4rem 1.5rem;line-height:1.9}
.legal h1{font:normal 2rem Georgia,serif;margin-bottom:2.2rem;color:#111}
.legal h2{font-size:.95rem;font-weight:700;margin:2.2rem 0 .5rem;color:#111;letter-spacing:.03em;text-transform:uppercase}
.legal p{color:#555;font-size:.9rem;margin-bottom:1rem}
@media(max-width:1024px){.pg4{grid-template-columns:repeat(2,1fr)}.feat-grid{grid-template-columns:repeat(2,1fr)}.ftr-top{grid-template-columns:1fr 1fr;gap:2.5rem}}
@media(max-width:768px){.nav-l{display:none}.trust-i{grid-template-columns:1fr 1fr}.rev-grid{grid-template-columns:1fr}.about-i{grid-template-columns:1fr;gap:2rem}.about-img{height:280px;font-size:5rem}.ftr-top{grid-template-columns:1fr;gap:2rem}.feat-grid{grid-template-columns:1fr}.hero{min-height:70vh}.ham-btn{display:flex}.pg4{grid-template-columns:1fr 1fr}.pdp-grid{grid-template-columns:1fr;gap:2rem}.pdp-gallery{position:static}.pdp-main-img{height:380px}}
@media(max-width:480px){.pg4{grid-template-columns:1fr 1fr}.trust-i{grid-template-columns:1fr 1fr}.hero h1{font-size:1.85rem}.hero-ctas{flex-direction:column;align-items:center}.btn-w,.btn-o{width:100%;max-width:280px;text-align:center}}
.ham-btn{display:none;flex-direction:column;gap:5px;cursor:pointer;background:none;border:none;padding:.45rem;z-index:10}
.ham-btn span{display:block;width:22px;height:2px;background:#333;transition:all .25s;border-radius:1px}
.mob-nav{position:fixed;top:0;left:0;bottom:0;width:min(300px,85vw);z-index:600;background:#fff;padding:2rem 1.5rem;transform:translateX(-100%);transition:transform .32s cubic-bezier(.4,0,.2,1);overflow-y:auto;box-shadow:4px 0 24px rgba(0,0,0,.12)}
.mob-nav.open{transform:translateX(0)}
.mob-nav-close{position:absolute;top:1.2rem;right:1.2rem;background:none;border:none;font-size:1.4rem;cursor:pointer;color:#444;padding:.3rem;line-height:1}
.mob-nav-links a{display:block;padding:.9rem 0;border-bottom:1px solid #f0eeeb;font-size:.95rem;color:#111;letter-spacing:.04em;transition:color .18s}
.mob-nav-links a:hover{color:var(--p)}
.mob-nav-brand{font:normal .72rem Georgia,serif;letter-spacing:.25em;text-transform:uppercase;color:#ccc;margin-top:2.2rem}
.mob-ov{position:fixed;inset:0;z-index:599;background:rgba(0,0,0,.4);opacity:0;pointer-events:none;transition:opacity .32s}
.mob-ov.open{opacity:1;pointer-events:all}
.pcard{position:relative;overflow:hidden}
.pc-quick{position:absolute;bottom:0;left:0;right:0;padding:.7rem;background:rgba(0,0,0,.82);color:#fff;text-align:center;font-size:.64rem;letter-spacing:.16em;text-transform:uppercase;transform:translateY(100%);transition:transform .22s ease;cursor:pointer;border:none;width:100%;font-family:inherit}
.pcard:hover .pc-quick{transform:translateY(0)}
.mob-cart-bar{position:fixed;bottom:-80px;left:0;right:0;z-index:300;background:var(--p);padding:.9rem 1.5rem;display:flex;justify-content:space-between;align-items:center;color:#fff;box-shadow:0 -4px 20px rgba(0,0,0,.18);transition:bottom .3s ease}
.mob-cart-bar.show{bottom:0}
.mob-cart-info{display:flex;flex-direction:column;min-width:0}
.mob-cart-name{font-size:.72rem;opacity:.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mob-cart-price{font:normal 1.1rem Georgia,serif}
.mob-cart-btn{background:#fff;color:var(--p);border:none;padding:.65rem 1.2rem;font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;font-family:inherit}
.btt{position:fixed;bottom:5.5rem;right:1.5rem;width:42px;height:42px;background:#111;color:#fff;border:none;cursor:pointer;font-size:.85rem;display:none;align-items:center;justify-content:center;z-index:299;opacity:.7;transition:opacity .2s;box-shadow:0 4px 14px rgba(0,0,0,.22)}
.btt.show{display:flex}
.btt:hover{opacity:1}
.pc-img{position:relative}
.pc-img-real{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.pdp-main-img{position:relative}
.pdp-main-img-real{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.vid-wrap{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;background:#111;margin:3rem 0}
.vid-inner{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:10rem;animation:kburn 14s ease-in-out infinite alternate}
@keyframes kburn{0%{transform:scale(1.04) translate(0,0)}100%{transform:scale(1.13) translate(-2%,-1%)}}
.vid-ov{position:absolute;inset:0;background:linear-gradient(to right,rgba(0,0,0,.5),rgba(0,0,0,.15) 60%)}
.vid-cap{position:absolute;bottom:2rem;left:2rem;color:#fff;z-index:2;max-width:480px}
.vid-cap h2{font:normal clamp(1.2rem,3vw,2rem)/1.25 Georgia,serif;margin-bottom:.5rem}
.vid-cap p{font-size:.85rem;opacity:.82;margin-bottom:1rem}
.vid-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:2}
.vid-playbtn{width:64px;height:64px;background:rgba(255,255,255,.15);border:2px solid rgba(255,255,255,.65);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.5rem;cursor:pointer;backdrop-filter:blur(4px);transition:all .25s}
.vid-playbtn:hover{background:rgba(255,255,255,.28);transform:scale(1.08)}
.pdp-wrap{max-width:1280px;margin:0 auto}
.pdp-grid{display:grid;grid-template-columns:1fr 1fr;gap:4rem;align-items:start;padding:3rem 1.5rem}
.pdp-gallery{position:sticky;top:80px}
.pdp-main-img{height:520px;border:1px solid #ece8e3;margin-bottom:.8rem;overflow:hidden;cursor:zoom-in;transition:background .4s ease}
.pdp-img-inner{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem;gap:1.5rem}
.pdp-img-em{font-size:8rem;filter:drop-shadow(0 12px 32px rgba(0,0,0,.2));transition:transform .4s ease}
.pdp-main-img:hover .pdp-img-em{transform:scale(1.06) translateY(-4px)}
.pdp-img-lbl{text-align:center;color:rgba(255,255,255,.85)}
.pdp-img-brand{font-size:.6rem;letter-spacing:.45em;text-transform:uppercase;opacity:.65;margin-bottom:.3rem}
.pdp-img-name{font:normal 1rem Georgia,serif;letter-spacing:.06em}
.pdp-thumbs{display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem}
.pdp-thumb{height:96px;display:flex;align-items:center;justify-content:center;font-size:2.2rem;border:2px solid transparent;cursor:pointer;opacity:.6;transition:all .2s}
.pdp-thumb.act{opacity:1;border-color:var(--p)}.pdp-thumb:hover{opacity:.9}
.pdp-stock{display:flex;align-items:center;gap:.5rem;font-size:.75rem;font-weight:600;color:#16a34a;margin-bottom:.6rem}
.pdp-stock-dot{width:8px;height:8px;border-radius:50%;background:#16a34a;box-shadow:0 0 0 3px rgba(22,163,74,.2)}
.pdp-social-proof{font-size:.78rem;color:#f59e0b;font-weight:500;margin-bottom:.8rem}
.pdp-dlv{display:flex;align-items:center;gap:.5rem;font-size:.78rem;color:#555;margin-top:.9rem;padding-top:.9rem;border-top:1px solid #f0eeeb}
.pdp-dlv svg{color:var(--p);flex-shrink:0}
.tab-rv-sum{display:flex;align-items:center;gap:1.5rem;padding:1.2rem;background:#fafaf8;border:1px solid #ece8e3;margin-bottom:1.5rem}
.tab-rv-big{font:normal 3rem/1 Georgia,serif;color:#111}
.pdp-info{padding:.5rem 0}
.pdp-eye{font-size:.65rem;letter-spacing:.3em;text-transform:uppercase;color:var(--p);margin-bottom:.6rem}
.pdp-info h1{font:normal clamp(1.4rem,2.5vw,1.9rem)/1.25 Georgia,serif;color:#111;margin-bottom:.8rem}
.pdp-rating{display:flex;align-items:center;gap:.6rem;margin-bottom:1rem}
.pdp-stars{color:#f59e0b;letter-spacing:.05em;font-size:.88rem}
.pdp-rating-cnt{font-size:.78rem;color:#999}
.pdp-rating-link{font-size:.78rem;color:var(--p);text-decoration:underline;cursor:pointer}
.pdp-price-row{display:flex;align-items:baseline;gap:.6rem;margin-bottom:1.4rem;flex-wrap:wrap}
.pdp-price-now{font:normal 1.7rem Georgia,serif;color:#111}
.pdp-price-orig{font-size:1.05rem;color:#bbb;text-decoration:line-through;font-family:Georgia,serif}
.pdp-price-save{background:#fee2e2;color:#dc2626;font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;padding:.22rem .55rem;font-weight:700}
.pdp-bullets{list-style:none;margin-bottom:1.4rem;border-top:1px solid #f0eeeb}
.pdp-bullets li{display:flex;align-items:center;gap:.6rem;padding:.45rem 0;border-bottom:1px solid #f0eeeb;font-size:.86rem;color:#555}
.pdp-check{color:var(--p);font-weight:700;font-size:.85rem;flex-shrink:0}
.pdp-var-label{font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:#111;margin-bottom:.55rem;margin-top:1rem}
.pdp-colors{display:flex;gap:.5rem;margin-bottom:.5rem}
.pdp-swatch{width:26px;height:26px;border-radius:50%;border:2px solid transparent;cursor:pointer;transition:transform .2s;outline:2px solid transparent;outline-offset:2px}
.pdp-swatch.active{outline-color:var(--p)}
.pdp-sizes{display:flex;gap:.4rem;flex-wrap:wrap}
.pdp-sz{padding:.42rem .9rem;border:1px solid #ddd;font-size:.75rem;cursor:pointer;transition:all .18s;background:#fff;color:#444}
.pdp-sz.active,.pdp-sz:hover{border-color:#111;background:#111;color:#fff}
.pdp-qty{display:inline-flex;align-items:center;border:1px solid #ddd;margin-bottom:1.4rem;margin-top:1rem}
.pdp-qty button{width:42px;height:42px;background:none;border:none;font-size:1.2rem;cursor:pointer;color:#444;line-height:1}
.pdp-qty span{width:44px;text-align:center;font-size:.9rem;border-left:1px solid #ddd;border-right:1px solid #ddd;line-height:42px}
.btn-cart{display:block;width:100%;padding:1rem 1.5rem;background:var(--p);color:#fff;border:none;font-size:.75rem;letter-spacing:.18em;text-transform:uppercase;cursor:pointer;font-weight:700;font-family:inherit;transition:background .22s;margin-bottom:.6rem}
.btn-cart:hover{background:var(--pd)}
.btn-wish{display:block;width:100%;padding:.85rem 1.5rem;background:#fff;color:#111;border:1px solid #111;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;font-family:inherit;transition:all .22s;margin-bottom:1.4rem}
.btn-wish:hover{background:#111;color:#fff}
.pdp-trust-row{display:flex;gap:1.4rem;padding:1.1rem 0;border-top:1px solid #ece8e3;border-bottom:1px solid #ece8e3;flex-wrap:wrap}
.pdp-ti{display:flex;align-items:center;gap:.4rem;font-size:.7rem;color:#555}
.pdp-ti svg{color:var(--p)}
.pdp-tabs-wrap{background:#fff;max-width:1280px;margin:0 auto;padding:0 1.5rem}
.pdp-tabs-nav{border-bottom:1px solid #e8e4df;display:flex;gap:0}
.tab-btn{padding:.85rem 1.4rem;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;border-bottom:2px solid transparent;color:#aaa;background:none;border-top:none;border-left:none;border-right:none;font-family:inherit;transition:all .2s}
.tab-btn.act{color:#111;border-bottom-color:#111}
.tab-content{display:none;padding:2.2rem 0;font-size:.9rem;color:#555;line-height:1.95}
.tab-content.act{display:block}
.tab-content h3{font:normal 1.1rem/1.4 Georgia,serif;color:#111;margin-bottom:.8rem}
.tab-content p{margin-bottom:1.1rem}
.tab-content ul{padding-left:1.3rem;margin:.5rem 0 1rem}
.tab-content li{margin-bottom:.4rem}
.tab-review{padding:1.2rem 0;border-bottom:1px solid #f0eeeb}
.tab-review:last-child{border:none}
.tab-rv-stars{color:#f59e0b;margin-bottom:.4rem;font-size:.85rem}
.tab-rv-text{font-style:italic;color:#555;font-size:.87rem;margin-bottom:.5rem}
.tab-rv-author{font-size:.72rem;color:#999;text-transform:uppercase;letter-spacing:.08em}
@media(max-width:900px){.pdp-grid{grid-template-columns:1fr;gap:2rem}.pdp-gallery{position:static}}
@media(max-width:480px){.pdp-trust-row{gap:.8rem}.pdp-main-img{height:360px;font-size:6rem}}
.ftr-rating{display:flex;align-items:center;gap:.5rem;font-size:.77rem;color:rgba(255,255,255,.45);margin:.8rem 0 1rem}
.ftr-rating span:first-child{color:#f59e0b;letter-spacing:.05em}
.ftr-rating strong{color:#fff;font-weight:600}
.ftr-contact-list{list-style:none;font-size:.77rem;line-height:2.1}
.ftr-contact-list a{color:rgba(255,255,255,.55);transition:color .2s}
.ftr-contact-list a:hover{color:#fff}
.ftr-sub{font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.25);margin-top:.7rem;margin-bottom:.2rem;display:block}
.ftr-pay-row{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:1rem}
.pay-b{display:inline-flex;align-items:center;justify-content:center;height:24px;border-radius:3px;font-size:.6rem;letter-spacing:.04em;font-weight:800;padding:0 .5rem;min-width:36px;line-height:1}
.pay-visa{background:#1a1f71;color:#fff;font-style:italic;font-size:.7rem;letter-spacing:.03em}
.pay-mc{background:#fff;position:relative;width:40px;padding:0;overflow:visible}
.mc-c1,.mc-c2{position:absolute;width:20px;height:20px;border-radius:50%;top:2px}
.mc-c1{background:#eb001b;left:2px}.mc-c2{background:#f79e1b;right:2px}
.pay-amex{background:#006fcf;color:#fff}
.pay-pp{background:#003087;color:#fff;font-size:.58rem;letter-spacing:.02em}
.pay-cb{background:#005c99;color:#fff}
.pay-ap{background:#000;color:#fff;font-size:.6rem}
.ftr-cert{display:flex;align-items:center;gap:.6rem;font-size:.69rem;color:rgba(255,255,255,.3);flex-wrap:wrap}
.ftr-cert svg{color:rgba(255,255,255,.3)}
.slogan{text-align:center;padding:5rem 2rem;background:#fafaf8;border-top:1px solid #e8e4df;border-bottom:1px solid #e8e4df}
.slogan-q{font:normal clamp(1.9rem,4vw,3.2rem)/1.18 Georgia,serif;color:#111;max-width:820px;margin:0 auto}
.slogan-q em{font-style:italic;color:var(--p)}
.slogan-s{font-size:.72rem;letter-spacing:.32em;text-transform:uppercase;color:#bbb;margin-top:1.3rem;display:block}
.cf{background:#fff;border-bottom:1px solid #e8e4df;padding:.65rem 1.5rem;position:sticky;top:68px;z-index:100;overflow-x:auto;scrollbar-width:none}
.cf::-webkit-scrollbar{display:none}
.cf-in{max-width:1280px;margin:0 auto;display:flex;align-items:center;gap:.9rem}
.cf-chips{display:flex;gap:.35rem;flex:1;overflow-x:auto;scrollbar-width:none}
.cf-chips::-webkit-scrollbar{display:none}
.cf-c{padding:.33rem .82rem;border:1px solid #e0dbd5;background:#fff;font-size:.67rem;letter-spacing:.09em;text-transform:uppercase;cursor:pointer;color:#666;transition:all .18s;font-family:inherit;white-space:nowrap;flex-shrink:0}
.cf-c.on,.cf-c:hover{background:#111;color:#fff;border-color:#111}
.cf-div{width:1px;height:18px;background:#e0dbd5;flex-shrink:0}
.cf-sort select{border:none;font-size:.68rem;color:#666;background:transparent;cursor:pointer;font-family:inherit;outline:none;letter-spacing:.06em;text-transform:uppercase}
.coll-count{font-size:.72rem;color:#bbb;white-space:nowrap;flex-shrink:0}
.blog-h{padding:4.5rem 2rem;text-align:center;background:#fafaf8;border-bottom:1px solid #e8e4df}
.blog-h h1{font:normal clamp(1.8rem,3.5vw,2.6rem)/1.2 Georgia,serif;color:#111;margin-bottom:.5rem}
.blog-h p{color:#999;font-size:.88rem}
.blog-g{max-width:1280px;margin:0 auto;padding:3rem 1.5rem;display:grid;grid-template-columns:repeat(3,1fr);gap:1.6rem}
.bc2{background:#fff;border:1px solid #ece8e3;overflow:hidden;transition:box-shadow .28s;display:block;color:inherit}
.bc2:hover{box-shadow:0 6px 24px rgba(0,0,0,.09)}
.bc2-img{height:195px;background:linear-gradient(145deg,var(--p),var(--pd));display:flex;align-items:center;justify-content:center;font-size:3.5rem}
.bc2-bd{padding:1.1rem 1.25rem}
.bc2-tag{font-size:.6rem;letter-spacing:.22em;text-transform:uppercase;color:var(--p);font-weight:700;margin-bottom:.45rem;display:block}
.bc2-t{font:normal 1.05rem/1.33 Georgia,serif;color:#111;margin-bottom:.5rem;display:block}
.bc2-exc{font-size:.81rem;color:#777;line-height:1.65;margin-bottom:.7rem}
.bc2-mt{font-size:.69rem;color:#ccc;display:flex;gap:.4rem;align-items:center}
.art-w{max-width:720px;margin:0 auto;padding:3rem 1.5rem 5rem}
.art-hd{text-align:center;padding-bottom:2rem;border-bottom:1px solid #f0eeeb;margin-bottom:2.2rem}
.art-tag{font-size:.6rem;letter-spacing:.22em;text-transform:uppercase;color:var(--p);font-weight:700;display:block;margin-bottom:.7rem}
.art-hd h1{font:normal clamp(1.5rem,3.5vw,2.2rem)/1.25 Georgia,serif;color:#111;margin-bottom:.8rem}
.art-mt{font-size:.71rem;color:#ccc;display:flex;align-items:center;justify-content:center;gap:.6rem;flex-wrap:wrap}
.art h2{font:normal 1.22rem/1.35 Georgia,serif;color:#111;margin:2.2rem 0 .75rem;padding-top:.5rem;border-top:1px solid #f0eeeb}
.art h3{font-size:.87rem;font-weight:700;color:#222;margin:1.5rem 0 .45rem;letter-spacing:.04em;text-transform:uppercase}
.art p{color:#555;line-height:1.92;margin-bottom:1.1rem;font-size:.93rem}
.art ul,.art ol{padding-left:1.3rem;margin:.4rem 0 1.1rem;color:#555;font-size:.93rem;line-height:1.85}
.art li{margin-bottom:.3rem}
.art blockquote{border-left:3px solid var(--p);padding:.5rem 1.3rem;margin:1.6rem 0;background:#fafaf8}
.art blockquote p{color:#444;font-style:italic;font-size:.9rem;margin:0}
.art-cta{background:var(--a);border:1px solid color-mix(in srgb,var(--p) 20%,transparent);padding:1.8rem;margin:2.2rem 0;text-align:center}
.art-cta h3{font:normal 1.2rem Georgia,serif;color:#111;margin-bottom:.4rem}
.art-cta p{font-size:.84rem;color:#666;margin-bottom:1rem}
.art-cta a{display:inline-block;background:var(--p);color:#fff;padding:.72rem 1.8rem;font-size:.71rem;letter-spacing:.14em;text-transform:uppercase;font-weight:700}
.art-faq{margin-top:2.5rem;border-top:2px solid #f0eeeb;padding-top:2rem}
.art-faq h2{font:normal 1.3rem Georgia,serif;color:#111;margin-bottom:1.2rem;border:none;padding:0}
.faq-item{border-bottom:1px solid #f0eeeb;padding:1rem 0}
.faq-q{font-size:.88rem;font-weight:700;color:#111;margin-bottom:.4rem}
.faq-a{font-size:.86rem;color:#666;line-height:1.8}
@media(max-width:768px){.blog-g{grid-template-columns:1fr}.cf{top:0}}`;
}

function pageJS(){return `<script>
function toggleMobNav(){var mn=document.getElementById('mob-nav'),ov=document.getElementById('mob-ov');if(!mn)return;var o=mn.classList.toggle('open');if(ov)ov.classList.toggle('open',o);document.body.style.overflow=o?'hidden':'';}
function scrollTop(){window.scrollTo({top:0,behavior:'smooth'});}
window.addEventListener('scroll',function(){var b=document.getElementById('btt');if(b)b.classList.toggle('show',window.scrollY>400);var m=document.getElementById('mob-cart-bar');if(m)m.classList.toggle('show',window.scrollY>280);});
(function(){var chips=document.querySelectorAll('.cf-c'),cards=document.querySelectorAll('.pcard');chips.forEach(function(c){c.addEventListener('click',function(){chips.forEach(function(x){x.classList.remove('on')});c.classList.add('on');var f=c.dataset.filter;cards.forEach(function(p){var t=p.dataset.tags||'';p.style.display=(!f||f==='all'||t.indexOf(f)>-1)?'':'none';});});});var sel=document.querySelector('.cf-sort select');if(sel)sel.addEventListener('change',function(){var g=document.querySelector('.pg4');if(!g)return;var cs=Array.from(g.querySelectorAll('.pcard'));var m=this.value;cs.sort(function(a,b){var ap=parseFloat(a.dataset.price||0),bp=parseFloat(b.dataset.price||0);return m==='price-asc'?ap-bp:m==='price-desc'?bp-ap:0;});cs.forEach(function(c){g.appendChild(c);});});})();
<\/script>`;}

const layout=(title,desc,url,ld,body,p,pd,ac,lang='fr')=>
  `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="website"><link rel="canonical" href="${url}"><script type="application/ld+json">${ld}</script><style>${css(p,pd,ac)}</style></head><body>${body}<button class="btt" id="btt" onclick="scrollTop()">↑</button>${pageJS()}</body></html>`;

const SVG_HEART=`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
const SVG_BAG=`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`;
function navBar(b,lang){
  const e=lang==='en';
  return `<nav class="nav"><div class="nav-i"><button class="ham-btn" onclick="toggleMobNav()"><span></span><span></span><span></span></button><div class="nav-l"><a href="/collections/">${e?'Collections':'Collections'}</a><a href="/collections/new-arrivals/">${e?'New Arrivals':'Nouveautés'}</a><a href="/blog/">${e?'Journal':'Blog'}</a></div><a href="/" class="logo">${esc(b)}</a><div class="nav-r"><a href="/cgv/">${e?'Terms':'CGV'}</a><span class="nav-icon">${SVG_HEART}</span><span class="nav-icon">${SVG_BAG}</span></div></div></nav><div id="mob-nav" class="mob-nav"><button class="mob-nav-close" onclick="toggleMobNav()">✕</button><div class="mob-nav-links"><a href="/collections/">${e?'Collections':'Collections'}</a><a href="/collections/new-arrivals/">${e?'New Arrivals':'Nouveautés'}</a><a href="/blog/">${e?'Journal':'Blog'}</a><a href="/cgv/">${e?'Terms':'CGV'}</a></div><div class="mob-nav-brand">${esc(b)}</div></div><div id="mob-ov" class="mob-ov" onclick="toggleMobNav()"></div>`;
}

function promoBar(niche,lang){
  const e=lang==='en';
  const [,,,,,,promoFr,promoEn]=NS[niche]||[,,,,,,,'Free delivery from €39','Free delivery from €39'];
  return `<div class="promo">${e?promoEn:promoFr}</div>`;
}

const SVG_TRUCK=`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`;
const SVG_RETURN=`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.65"/></svg>`;
const SVG_LOCK=`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
const SVG_STAR=`<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
function trustSection(lang){
  const e=lang==='en';
  const items=e
    ?[[SVG_TRUCK,'Free Delivery','On all orders over €39'],[SVG_RETURN,'30-Day Returns','Hassle-free policy'],[SVG_LOCK,'Secure Payment','SSL & 3D Secure'],[SVG_STAR,'5★ Reviews','4.8 · 2,400+ customers']]
    :[[SVG_TRUCK,'Livraison offerte','Dès 39€ d\'achat'],[SVG_RETURN,'Retours 30 jours','Sans condition'],[SVG_LOCK,'Paiement sécurisé','SSL & 3D Secure'],[SVG_STAR,'Avis 5★','4.8 · 2 400+ clients']];
  return `<div class="trust"><div class="trust-i">${items.map(([i,t,s])=>`<div class="ti"><span class="ti-ico">${i}</span><div><strong>${t}</strong><span>${s}</span></div></div>`).join('')}</div></div>`;
}

const prodSlug=n=>n.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
function prodCard(name,price,orig,em,lang,badge='',href='',tags=''){
  const e=lang==='en';
  const inner=`<div class="pc-img"><div class="pci">${em}</div>${badge?`<span class="pc-badge">${badge}</span>`:''}<button class="pc-quick" onclick="event.stopPropagation();location.href='/checkout/'">${e?'Quick Add':'Ajouter vite'}</button></div><div class="pc-bd"><p class="pc-nm">${esc(name)}</p><p class="pc-pr">€${price}${orig?`<span class="pc-orig">€${orig}</span>`:''}</p><button class="pc-btn" onclick="event.stopPropagation();location.href='/checkout/'">${e?'Add to Cart':'Ajouter'}</button></div>`;
  const attrs=`data-price="${price}" data-tags="${tags}"`;
  return href?`<a class="pcard" href="${href}" ${attrs} style="display:block;color:inherit">${inner}</a>`:`<div class="pcard" ${attrs}>${inner}</div>`;
}

function genNewArrivals(cols,em,lang){
  const e=lang==='en';
  const col=cols[0]||{title:'Product'};
  const base=col.title.split(/[\s&]/)[0];
  const items=[
    {n:`${base} Signature`,p:'89.90',o:null},
    {n:`${base} Heritage Collection`,p:'129.90',o:null},
    {n:`${base} Classic Gold`,p:'74.90',o:null},
    {n:`${base} Elite Edition`,p:'164.90',o:null},
  ];
  return `<div class="sec"><div class="sec-h"><p class="sec-eye">${e?'Just In':'Nouveautés'}</p><h2>${e?'New Arrivals':'Nos nouveautés'}</h2></div><div class="pg4">${items.map(x=>prodCard(x.n,x.p,x.o,em,lang)).join('')}</div><div class="sec-foot"><a href="/collections/">${e?'View all →':'Tout voir →'}</a></div></div>`;
}

function genFeatCols(cols,em,lang){
  const e=lang==='en';
  const top=cols.slice(0,3);
  const cards=top.map(c=>`<a class="fc" href="${c.path}/"><div class="fc-img">${em}</div><div class="fc-overlay"><h3>${esc(c.title)}</h3><p>${c.products?`${c.products} ${e?'products':'produits'}`:''}</p><span>${e?'Shop now →':'Découvrir →'}</span></div></a>`).join('');
  return `<div class="feat-bg"><div class="feat-h"><p class="sec-eye">${e?'Shop by Category':'Par catégorie'}</p><h2 style="font:normal clamp(1.6rem,3vw,2.2rem)/1.15 Georgia,serif">${e?'Our Collections':'Nos collections'}</h2></div><div class="feat-grid">${cards}</div></div>`;
}

function genTestimonials(lang){
  const e=lang==='en';
  const reviews=e?[
    {stars:'★★★★★',text:'"Absolutely stunning quality. My ring arrived beautifully packaged and looks even better in person than online. Will definitely order again."',author:'Sarah M. — London',date:'2 weeks ago'},
    {stars:'★★★★★',text:'"Bought a gold necklace for my wife\'s birthday — she was completely speechless. Fast delivery and excellent customer service."',author:'James K. — Manchester',date:'1 month ago'},
    {stars:'★★★★★',text:'"Exceptional craftsmanship. I\'ve ordered from many jewellers and Auranova is by far the best quality for the price. Outstanding."',author:'Emma L. — Edinburgh',date:'3 weeks ago'},
  ]:[
    {stars:'★★★★★',text:'"Qualité exceptionnelle. Ma bague est arrivée magnifiquement emballée et est encore plus belle en vrai qu\'en photo. Je recommande."',author:'Sophie M. — Paris',date:'Il y a 2 semaines'},
    {stars:'★★★★★',text:'"J\'ai offert un collier à ma femme pour son anniversaire — elle était sans voix. Livraison rapide et service client parfait."',author:'Thomas K. — Lyon',date:'Il y a 1 mois'},
    {stars:'★★★★★',text:'"Artisanat exceptionnel. J\'ai commandé chez de nombreux bijoutiers et c\'est de loin la meilleure qualité pour le prix."',author:'Emma L. — Bordeaux',date:'Il y a 3 semaines'},
  ];
  return `<div class="reviews-bg"><div class="sec"><div class="sec-h"><p class="sec-eye">${e?'Customer Reviews':'Avis clients'}</p><h2>${e?'What our customers say':'Ce que disent nos clients'}</h2><p>${e?'4.8 / 5 — Over 2,400 verified reviews':'4.8 / 5 — Plus de 2 400 avis vérifiés'}</p></div><div class="rev-grid">${reviews.map(r=>`<div class="rcard"><div class="rcard-stars">${r.stars}</div><p class="rcard-text">${r.text}</p><p class="rcard-author">${r.author} · <span style="font-weight:400;text-transform:none">${r.date}</span></p></div>`).join('')}</div></div></div>`;
}

function genBestsellers(cols,em,lang){
  const e=lang==='en';
  const col=cols[1]||cols[0]||{title:'Product'};
  const base=col.title.split(/[\s&]/)[0];
  const items=[
    {n:`${base} Royal Set`,p:'119.90',o:'159.90'},
    {n:`${base} Artisan Select`,p:'89.90',o:'124.90'},
    {n:`${base} Premium Line`,p:'149.90',o:null},
    {n:`${base} Exclusive Pack`,p:'199.90',o:'259.90'},
  ];
  return `<div class="sec"><div class="sec-h"><p class="sec-eye">${e?'Fan Favourites':'Meilleures ventes'}</p><h2>${e?'Our Bestsellers':'Nos bestsellers'}</h2></div><div class="pg4">${items.map(x=>prodCard(x.n,x.p,x.o,em,lang,x.o?(e?'SALE':'PROMO'):'')).join('')}</div><div class="sec-foot"><a href="/collections/">${e?'View all →':'Tout voir →'}</a></div></div>`;
}

function genAbout(b,p,em,lang){
  const e=lang==='en';
  const title=e?`Crafted with Purpose`:`Créé avec intention`;
  const text=e
    ?`Every piece in the ${b} collection is carefully curated — selected for quality, durability, and timeless design. We believe in fewer, better things: pieces that you wear for years, not seasons.`
    :`Chaque pièce de la collection ${b} est soigneusement sélectionnée pour sa qualité, sa durabilité et son design intemporel. Nous croyons en des objets plus rares, meilleurs : des pièces que vous portez des années, pas des saisons.`;
  return `<div class="about-s"><div class="about-i"><div class="about-text"><h2>${title}</h2><p>${text}</p><a href="/collections/" class="btn-w" style="background:var(--p);color:#fff;display:inline-block;padding:.82rem 2rem;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;font-weight:700">${e?'Shop the Collection':'Voir la collection'}</a></div><div class="about-img">${em}</div></div></div>`;
}

function newsletterSection(pd,lang){
  const e=lang==='en';
  return `<section class="nl"><h2>${e?'Join Our World':'Rejoignez notre univers'}</h2><p>${e?'New arrivals, exclusive offers and inspiration — straight to your inbox. No spam, ever.':'Nouveautés, offres exclusives et inspirations — dans votre boîte mail. Sans spam.'}</p><form class="nl-f" onsubmit="return false"><input type="email" placeholder="${e?'Your email address':'Votre adresse email'}"><button>${e?'Subscribe':"S'inscrire"}</button></form></section>`;
}

const SLOGANS={
  'Jewellery':{en:['<em>Wear what endures.</em>','Every piece, a quiet statement — made to outlast trends.'],fr:['<em>Portez ce qui dure.</em>','Chaque pièce, un silence éloquent — fait pour traverser les modes.']},
  'Jewelry':{en:['<em>Crafted to be kept.</em>','Fine jewelry that tells your story, not just the season.'],fr:['<em>Fait pour être gardé.</em>','Des bijoux fins qui racontent votre histoire, pas une saison.']},
  'Bijoux':{en:['<em>Crafted to be kept.</em>','Each piece carries a story worth telling.'],fr:['<em>Fait pour être gardé.</em>','Chaque pièce porte une histoire qui mérite d\'être racontée.']},
  'Mode Femme':{en:['<em>Dress with intention.</em>','Each piece chosen for the woman who knows what she wants.'],fr:['<em>S\'habiller avec intention.</em>','Chaque pièce choisie pour la femme qui sait ce qu\'elle veut.']},
  'Mode Homme':{en:['<em>Wear less. Wear better.</em>','Style is not what you own. It\'s what you choose.'],fr:['<em>Moins, mais mieux.</em>','Le style, ce n\'est pas ce que l\'on possède. C\'est ce que l\'on choisit.']},
  'Lingerie':{en:['<em>Feel it first.</em>','Designed for the body you have, not the one you\'re told to want.'],fr:['<em>Ressentez-le d\'abord.</em>','Conçu pour le corps que vous avez, pas celui qu\'on vous dit de vouloir.']},
  'Luminaires':{en:['<em>Light changes everything.</em>','The right light turns a room into a place worth being in.'],fr:['<em>La lumière change tout.</em>','La bonne lumière transforme une pièce en endroit où l\'on veut être.']},
  'Décoration':{en:['<em>Home is a point of view.</em>','Objects that speak your language, not a trend.'],fr:['<em>La maison, c\'est un point de vue.</em>','Des objets qui parlent votre langue, pas une tendance.']},
  'Beauté':{en:['<em>Skin first. Makeup second.</em>','Beauty that works with you, not against you.'],fr:['<em>La peau d\'abord.</em>','Une beauté qui travaille avec vous, pas contre vous.']},
};

function sloganSection(b,niche,lang){
  const e=lang==='en';
  const s=SLOGANS[niche]||(e?{en:['<em>Quality over quantity.</em>','Curated for those who know the difference.']}:{fr:['<em>La qualité avant tout.</em>','Sélectionné pour ceux qui connaissent la différence.']});
  const [q,sub]=e?(s.en||s.fr):(s.fr||s.en);
  return `<section class="slogan"><p class="slogan-q">${q}</p><span class="slogan-s">${sub}</span></section>`;
}

function filterBar(col,niche,lang,prodCount){
  const e=lang==='en';
  const chips=e?['All','Under €50','€50–€100','€100+','New Arrivals','On Sale']:['Tout','Moins de 50€','50–100€','100€+','Nouveautés','En promo'];
  const sorts=e?['Featured','Price: Low to High','Price: High to Low','Newest','Best Selling']:['En vedette','Prix croissant','Prix décroissant','Nouveautés','Meilleures ventes'];
  const filterJs=`document.querySelectorAll('.cf-c').forEach(function(btn){btn.addEventListener('click',function(){document.querySelectorAll('.cf-c').forEach(function(b){b.classList.remove('on')});this.classList.add('on')})})`;
  return `<div class="cf"><div class="cf-in"><div class="cf-chips">${chips.map((c,i)=>`<button class="cf-c${i===0?' on':''}">${esc(c)}</button>`).join('')}</div><div class="cf-div"></div><div class="cf-sort"><select>${sorts.map(s=>`<option>${esc(s)}</option>`).join('')}</select></div><span class="coll-count">${prodCount} ${e?'items':'articles'}</span></div></div><script>${filterJs}</script>`;
}

const BLOG_TOPICS={
  'Jewellery':[
    {slug:'how-to-choose-engagement-ring',read:8,
     enTitle:'How to Choose the Perfect Engagement Ring: The Complete Guide',
     frTitle:'Comment choisir une bague de fiançailles : le guide complet',
     enExc:'Metal, stone, cut, setting, budget — everything you need to find the ring that says exactly what you mean.',
     frExc:'Métal, pierre, taille, serti, budget — tout ce qu\'il faut pour trouver la bague qui dit exactement ce que vous ressentez.',
     enBody:`<p>An engagement ring is one of the few purchases where getting it right matters more than the price tag. The wrong choice isn't about budget — it's about missing what makes the ring resonate. This guide covers every decision point.</p><h2>Start with the metal</h2><p>White gold, yellow gold, rose gold, and platinum each create a different visual character. White gold and platinum suit cool skin tones and give the stone maximum visual clarity. Yellow and rose gold warm up the overall look and complement olive and darker skin tones naturally. Platinum is denser and more durable than white gold — it doesn't need replating — but costs more. White gold rings are rhodium-plated and may need replating every 3–5 years.</p><h2>Understand the 4 Cs</h2><p>The 4 Cs — Cut, Colour, Clarity, and Carat — determine a diamond's value. Cut matters most: it controls how light moves through the stone. A poorly-cut diamond will look dull regardless of its colour or clarity grade. Aim for Excellent or Very Good cut before improving colour or clarity.</p><ul><li><strong>Colour:</strong> D–F is colourless, G–J near-colourless (and better value). Below J shows visible warmth.</li><li><strong>Clarity:</strong> VS1–VS2 inclusions are invisible to the naked eye — a practical sweet spot.</li><li><strong>Carat:</strong> Opt for "shy weights" (0.90ct instead of 1.00ct, 1.45ct instead of 1.50ct) — same visual size, notably lower price.</li></ul><h2>Choose the right setting</h2><p>The setting defines the ring's silhouette. A solitaire focuses attention entirely on the stone. A pavé band adds sparkle along the band without competing with the centre stone. A halo setting makes the centre stone appear larger. Vintage-inspired settings like Art Deco milgrain work well with oval and pear shapes.</p><div class="art-cta"><h3>View Our Engagement Ring Collection</h3><p>Handpicked pieces, certified stones, 30-day returns.</p><a href="/collections/rings/">Shop Rings</a></div><h2>Know her style before you go</h2><p>Look at the jewellery she already wears. Yellow gold and vintage styles? Look at Art Deco-inspired settings. Minimal and modern? A solitaire on a plain band. Statement and bold? A larger stone or a distinctive cut like an emerald or marquise.</p><h2>Set your budget wisely</h2><p>Ignore the "two months' salary" rule — it's a marketing invention. Set a budget based on what's comfortable, then allocate it strategically: 80% on cut and carat, 20% on colour and clarity upgrades. A well-cut 0.90ct stone in the G–H range will outshine a poorly-cut 1.20ct stone.</p>`,
     frBody:`<p>Une bague de fiançailles est l'un des rares achats où bien choisir compte plus que le prix. Le mauvais choix n'est pas une question de budget — c'est manquer ce qui fait résonner la bague. Ce guide couvre chaque décision.</p><h2>Commencer par le métal</h2><p>Or blanc, or jaune, or rose et platine créent chacun un caractère visuel différent. L'or blanc et le platine conviennent aux carnations froides et donnent à la pierre une clarté visuelle maximale. L'or jaune et rose réchauffe l'ensemble et complète naturellement les carnations olivâtres et foncées. Le platine est plus dense et durable que l'or blanc — pas besoin de rechargement — mais coûte plus cher.</p><h2>Comprendre les 4 C</h2><p>Les 4 C — Taille, Couleur, Pureté et Carat — déterminent la valeur d'un diamant. La taille est la plus importante : elle contrôle la façon dont la lumière traverse la pierre. Un diamant mal taillé semblera terne, quelle que soit sa couleur ou sa pureté.</p><ul><li><strong>Couleur :</strong> D–F est incolore, G–J quasi-incolore (meilleur rapport qualité-prix).</li><li><strong>Pureté :</strong> VS1–VS2 — les inclusions sont invisibles à l'œil nu.</li><li><strong>Carat :</strong> Optez pour des "poids légers" (0,90ct au lieu de 1,00ct) — même taille visuelle, prix nettement inférieur.</li></ul><h2>Choisir le bon serti</h2><p>Le serti définit la silhouette de la bague. Un solitaire concentre toute l'attention sur la pierre. Un pavé ajoute de l'éclat sans rivaliser avec la pierre centrale. Un halo fait paraître la pierre centrale plus grande.</p><div class="art-cta"><h3>Voir notre collection de bagues de fiançailles</h3><p>Pièces sélectionnées, pierres certifiées, retours sous 30 jours.</p><a href="/collections/rings/">Voir les bagues</a></div><h2>Fixer son budget</h2><p>Ignorez la règle des "deux mois de salaire" — c'est une invention marketing. Fixez un budget confortable, puis allouez-le stratégiquement : 80% sur la taille et le carat, 20% sur les améliorations de couleur et de pureté.</p>`,
     faq:{ en:[{q:'What is the most important of the 4 Cs?',a:'Cut. A well-cut stone maximises brilliance regardless of colour or clarity. Always prioritise cut over other factors.'},{q:'How do I find out her ring size without asking?',a:'Borrow a ring she wears on her ring finger, trace its inner circle on paper, and use our size guide. Rings can be resized 1–2 sizes after purchase.'},{q:'Should I propose with the final ring or a placeholder?',a:'Either works. Many couples now choose the setting together after the proposal — it guarantees a perfect fit and lets her have input on a piece she\'ll wear daily.'}],
          fr:[{q:'Lequel des 4 C est le plus important ?',a:'La taille. Une pierre bien taillée maximise l\'éclat indépendamment de la couleur ou de la pureté. Toujours prioriser la taille.'},{q:'Comment connaître sa taille de bague sans demander ?',a:'Empruntez une bague qu\'elle porte à l\'annulaire, tracez le cercle intérieur sur papier et utilisez notre guide. Les bagues peuvent être redimensionnées de 1 à 2 tailles après l\'achat.'},{q:'Faut-il proposer avec la bague finale ou un substitut ?',a:'Les deux fonctionnent. Beaucoup de couples choisissent maintenant le serti ensemble après la demande — garantit un ajustement parfait et lui donne son mot à dire sur une pièce qu\'elle portera quotidiennement.'}]}
    },
    {slug:'gold-vs-silver-jewellery',read:6,
     enTitle:'Gold vs Silver Jewellery: Which Metal Suits Your Style?',
     frTitle:'Or ou argent : quel métal vous correspond vraiment ?',
     enExc:'A practical comparison of gold and silver jewellery — durability, maintenance, skin tone matching, and long-term value.',
     frExc:'Comparaison pratique entre bijoux en or et en argent — durabilité, entretien, correspondance avec votre carnation et valeur à long terme.',
     enBody:`<p>The choice between gold and silver isn't just aesthetic. It affects how long the piece lasts, how much upkeep it needs, and what it communicates about your style. Here's what to know before deciding.</p><h2>Durability and wearability</h2><p>Pure gold (24k) is too soft for everyday jewellery. Standard jewellery uses 18k (75% gold) or 14k (58.5% gold), mixed with harder metals for durability. 18k gold maintains its colour permanently — no replating needed. Sterling silver (92.5% silver) is durable but tarnishes when exposed to air, moisture, and skin oils. It needs periodic polishing or anti-tarnish storage.</p><h2>Skin tone compatibility</h2><p>A useful starting point: yellow gold generally complements warm and olive skin tones; white metals (white gold, silver, platinum) suit cooler undertones. Rose gold is unusually versatile — it works across most skin tones and has a distinctly modern warmth. If you're unsure, try on pieces in different metals in daylight before buying.</p><h2>Maintenance reality</h2><ul><li><strong>Yellow gold:</strong> Minimal. Occasional cleaning with mild soap and water.</li><li><strong>White gold:</strong> Rhodium plating fades over time — expect replating every 2–5 years depending on wear.</li><li><strong>Rose gold:</strong> Low maintenance, similar to yellow gold.</li><li><strong>Sterling silver:</strong> Tarnishes and needs regular polishing. Anti-tarnish pouches or cloths help significantly.</li></ul><div class="art-cta"><h3>Browse Our Gold &amp; Silver Collections</h3><p>Rings, necklaces, bracelets and earrings — each metal available across all styles.</p><a href="/collections/">View Collections</a></div><h2>Long-term value</h2><p>Gold holds intrinsic value. A solid 18k gold ring will maintain material worth regardless of fashion. Sterling silver has minimal scrap value but can carry high sentimental or design value. Neither is better — it depends on whether you're buying an heirloom or an everyday piece.</p><h2>Cost comparison</h2><p>Silver is significantly less expensive than gold at comparable design quality, making it ideal for building a larger collection or for pieces you'll wear frequently and roughly. Gold pieces represent a higher investment but lower per-wear cost over a lifetime of regular use.</p>`,
     frBody:`<p>Le choix entre or et argent n'est pas seulement esthétique. Il affecte la durée de vie de la pièce, son entretien nécessaire et ce qu'elle communique sur votre style. Voici ce qu'il faut savoir avant de décider.</p><h2>Durabilité et résistance</h2><p>L'or pur (24k) est trop mou pour les bijoux quotidiens. Les bijoux standard utilisent de l'or 18k (75% d'or) ou 14k (58,5% d'or), mélangé à des métaux plus durs. L'or 18k maintient sa couleur en permanence — pas de rechargement nécessaire. L'argent sterling (92,5% d'argent) est durable mais ternit au contact de l'air, de l'humidité et des huiles de la peau.</p><h2>Compatibilité avec votre carnation</h2><p>Un bon point de départ : l'or jaune complète généralement les carnations chaudes et olivâtres ; les métaux blancs (or blanc, argent, platine) conviennent aux sous-tons plus froids. L'or rose est particulièrement polyvalent — il fonctionne sur la plupart des carnations.</p><h2>Entretien au quotidien</h2><ul><li><strong>Or jaune :</strong> Minimal. Nettoyage occasionnel avec du savon doux.</li><li><strong>Or blanc :</strong> Le placage rhodium s'estompe — prévoir un rechargement tous les 2–5 ans.</li><li><strong>Or rose :</strong> Peu d'entretien, similaire à l'or jaune.</li><li><strong>Argent sterling :</strong> Ternit et nécessite un polissage régulier.</li></ul><div class="art-cta"><h3>Découvrir nos collections or &amp; argent</h3><p>Bagues, colliers, bracelets et boucles — chaque métal disponible dans tous les styles.</p><a href="/collections/">Voir les collections</a></div><h2>Valeur à long terme</h2><p>L'or conserve une valeur intrinsèque. Une bague en or 18k massif maintiendra sa valeur matérielle quelle que soit la mode. L'argent sterling a une valeur de récupération minimale mais peut avoir une valeur sentimentale ou design élevée.</p>`,
     faq:{ en:[{q:'Can I wear gold and silver jewellery together?',a:'Yes. Mixing metals is standard practice now. The key is intentionality — one metal should lead, the other accent.'},{q:'Which metal is better for sensitive skin?',a:'Pure gold and platinum are the most hypoallergenic. Sterling silver can cause reactions in people sensitive to nickel (often in the alloy). Look for nickel-free or 999 silver if you have sensitive skin.'},{q:'Does rose gold fade?',a:'Rose gold\'s colour comes from its copper content, which is stable and doesn\'t fade. The metal may develop a slightly deeper patina over years of wear, which many consider appealing.'}],
          fr:[{q:'Peut-on mélanger bijoux en or et en argent ?',a:'Oui. Mélanger les métaux est désormais courant. La clé est l\'intentionnalité — un métal doit dominer, l\'autre accentuer.'},{q:'Quel métal est le mieux pour les peaux sensibles ?',a:'L\'or pur et le platine sont les plus hypoallergéniques. L\'argent sterling peut provoquer des réactions chez les personnes sensibles au nickel. Cherchez de l\'argent sans nickel si vous avez la peau sensible.'},{q:'La couleur de l\'or rose disparaît-elle ?',a:'La couleur de l\'or rose vient de sa teneur en cuivre, qui est stable et ne disparaît pas. Le métal peut développer une légère patine au fil des ans, ce que beaucoup trouvent attrayant.'}]}
    },
  ],
  'default':[
    {slug:'guide-complet',read:7,
     enTitle:'The Complete Guide to Our Collections',
     frTitle:'Guide complet de nos collections',
     enExc:'Everything you need to know to choose the right piece for you — from style to care, material to occasion.',
     frExc:'Tout ce qu\'il faut savoir pour choisir la pièce qui vous correspond — du style à l\'entretien, du matériau à l\'occasion.',
     enBody:`<p>Choosing the right piece takes more than a quick scroll. It requires understanding what you're actually looking for — and knowing what questions to ask. This guide walks you through the key decisions.</p><h2>Define your purpose first</h2><p>Are you buying for everyday wear, a special occasion, or as a gift? Everyday pieces should be durable, versatile, and comfortable for extended wear. Occasion pieces can afford to be bolder. Gifts benefit from timeless designs that don't depend on knowing the recipient's exact preferences.</p><h2>Understand quality markers</h2><p>Look for material specifications in the product description. Vague terms like "premium" or "luxury" are marketing. Concrete details — 925 silver, solid oak, 18k gold, 100% cotton — tell you what you're actually buying.</p><h2>Care and longevity</h2><p>The best piece is one you'll actually maintain. Consider how much care the material requires and whether that suits your lifestyle. Some materials age beautifully with minimal intervention; others need regular attention to stay at their best.</p><div class="art-cta"><h3>Browse Our Collections</h3><p>Curated selection, honest descriptions, 30-day returns.</p><a href="/collections/">View All Collections</a></div><h2>Return and size considerations</h2><p>When in doubt about size or fit, check the return policy before buying. Our 30-day return policy means you can order your best guess and exchange if needed — no questions asked.</p>`,
     frBody:`<p>Choisir la bonne pièce demande plus qu'un défilement rapide. Cela nécessite de comprendre ce que vous cherchez vraiment — et de savoir quelles questions poser.</p><h2>Définir votre usage en premier</h2><p>Achetez-vous pour un usage quotidien, une occasion spéciale ou un cadeau ? Les pièces quotidiennes doivent être durables, polyvalentes et confortables pour un port prolongé. Les pièces d'occasion peuvent se permettre d'être plus audacieuses. Les cadeaux bénéficient de designs intemporels.</p><h2>Comprendre les indicateurs de qualité</h2><p>Cherchez des spécifications matérielles dans la description du produit. Des termes vagues comme "premium" ou "luxe" relèvent du marketing. Des détails concrets — argent 925, chêne massif, or 18k, coton 100% — vous indiquent ce que vous achetez réellement.</p><h2>Entretien et longévité</h2><p>La meilleure pièce est celle que vous entretiendrez vraiment. Considérez le soin requis par le matériau et si cela convient à votre mode de vie.</p><div class="art-cta"><h3>Parcourir nos collections</h3><p>Sélection soignée, descriptions honnêtes, retours sous 30 jours.</p><a href="/collections/">Voir toutes les collections</a></div>`,
     faq:{ en:[{q:'What is your return policy?',a:'30 days from delivery, no questions asked. Items must be unused and in original packaging. Contact us for a prepaid return label.'},{q:'How long does delivery take?',a:'Standard shipping takes 3–5 business days. Express (1–2 days) is available at checkout for €4.99. All orders include tracking.'},{q:'Are your products authentic?',a:'Yes. All products ship directly from verified suppliers. We do not resell or repackage third-party goods.'}],
          fr:[{q:'Quelle est votre politique de retour ?',a:'30 jours à compter de la livraison, sans questions. Les articles doivent être inutilisés et dans leur emballage d\'origine. Contactez-nous pour une étiquette de retour prépayée.'},{q:'Quel est le délai de livraison ?',a:'La livraison standard prend 3 à 5 jours ouvrés. L\'express (1–2 jours) est disponible au checkout pour 4,99€. Toutes les commandes incluent un suivi.'},{q:'Vos produits sont-ils authentiques ?',a:'Oui. Tous les produits sont expédiés directement par des fournisseurs vérifiés.'}]}
    },
  ],
};

function genBlog(bp,niche,domain,lang){
  const b=brand(domain),e=lang==='en';
  const [p,pd,ac,em]=NS[niche]||['#2563eb','#1d4ed8','#eff6ff','🛍️'];
  const topics=(BLOG_TOPICS[niche]||BLOG_TOPICS['default']);
  const cards=topics.map(t=>{
    const title=e?t.enTitle:t.frTitle;
    const exc=e?t.enExc:t.frExc;
    return `<a class="bc2" href="/blog/${t.slug}/"><div class="bc2-img">${em}</div><div class="bc2-bd"><span class="bc2-tag">${niche}</span><span class="bc2-t">${esc(title)}</span><p class="bc2-exc">${esc(exc)}</p><div class="bc2-mt"><span>${t.read} ${e?'min read':'min de lecture'}</span></div></div></a>`;
  }).join('');
  const title=e?`Journal — ${b}`:`Blog — ${b}`;
  const desc=e?`Jewellery guides, style tips and care advice from ${b}.`:`Guides bijoux, conseils style et entretien par ${b}.`;
  const ld=`{"@context":"https://schema.org","@type":"Blog","name":${JSON.stringify(title)},"url":"https://${domain}/blog/"}`;
  const body=`${promoBar(niche,lang)}${navBar(b,lang)}<div class="blog-h"><h1>${e?'Journal':'Blog &amp; Guides'}</h1><p>${e?'Style guides, care tips and inspiration':'Guides style, conseils entretien et inspirations'}</p></div><div class="blog-g">${cards}</div>${trustSection(lang)}${footerSection(b,domain,lang)}`;
  return layout(title,desc,`https://${domain}/blog/`,ld,body,p,pd,ac,lang);
}

function genBlogPost(topic,niche,domain,lang){
  const b=brand(domain),e=lang==='en';
  const [p,pd,ac]=NS[niche]||['#2563eb','#1d4ed8','#eff6ff'];
  const title=e?topic.enTitle:topic.frTitle;
  const body_html=e?topic.enBody:topic.frBody;
  const faqs=(e?topic.faq?.en:topic.faq?.fr)||[];
  const faqHtml=faqs.length?`<div class="art-faq"><h2>${e?'Frequently Asked Questions':'Questions fréquentes'}</h2>${faqs.map(f=>`<div class="faq-item"><p class="faq-q">${esc(f.q)}</p><p class="faq-a">${esc(f.a)}</p></div>`).join('')}</div>`:'';
  const date=new Date().toLocaleDateString(e?'en-GB':'fr-FR',{day:'numeric',month:'long',year:'numeric'});
  const ld=`{"@context":"https://schema.org","@type":"Article","headline":${JSON.stringify(title)},"author":{"@type":"Organization","name":${JSON.stringify(b)}},"datePublished":"${new Date().toISOString().slice(0,10)}","publisher":{"@type":"Organization","name":${JSON.stringify(b)}},"url":"https://${domain}/blog/${topic.slug}/"}`;
  const art=`${promoBar(niche,lang)}${navBar(b,lang)}<div class="bc"><div class="bc-i"><a href="/">${e?'Home':'Accueil'}</a> › <a href="/blog/">${e?'Journal':'Blog'}</a> › ${esc(title)}</div></div><div class="art-w"><div class="art-hd"><span class="art-tag">${niche}</span><h1>${esc(title)}</h1><div class="art-mt"><span>${date}</span><span>·</span><span>${topic.read} ${e?'min read':'min de lecture'}</span><span>·</span><a href="/blog/" style="color:var(--p)">${e?'← All articles':'← Tous les articles'}</a></div></div><div class="art">${body_html}${faqHtml}</div></div>${trustSection(lang)}${footerSection(b,domain,lang)}`;
  return layout(`${title} | ${b}`,e?topic.enExc:topic.frExc,`https://${domain}/blog/${topic.slug}/`,ld,art,p,pd,ac,lang);
}

const SVG_IG=`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`;
const SVG_FB=`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>`;
const SVG_TT=`<svg width="14" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.74a4.85 4.85 0 01-1.01-.05z"/></svg>`;
const SVG_PIN=`<svg width="14" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12c0 4.236 2.636 7.855 6.356 9.312-.088-.791-.167-2.005.035-2.868.181-.78 1.172-4.97 1.172-4.97s-.299-.598-.299-1.482c0-1.388.806-2.428 1.808-2.428.852 0 1.265.64 1.265 1.408 0 .858-.546 2.141-.828 3.329-.236.995.499 1.806 1.48 1.806 1.773 0 3.141-1.872 3.141-4.573 0-2.39-1.718-4.061-4.171-4.061-2.84 0-4.51 2.131-4.51 4.335 0 .858.331 1.778.744 2.281a.3.3 0 0 1 .069.286l-.277 1.133c-.044.183-.145.222-.335.134-1.249-.581-2.03-2.407-2.03-3.874 0-3.154 2.292-6.052 6.608-6.052 3.469 0 6.165 2.472 6.165 5.776 0 3.447-2.173 6.22-5.19 6.22-1.013 0-1.966-.527-2.292-1.148l-.623 2.378c-.226.869-.835 1.958-1.244 2.621C10.076 23.854 11.026 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>`;

function footerSection(b,domain,lang){
  const e=lang==='en';
  const contact=e?`hello@${domain}`:`contact@${domain}`;
  const desc=e?`Premium selection, curated with care. Pieces designed to last years, not seasons.`:`Sélection premium, pensée avec soin. Des pièces qui durent des années, pas des saisons.`;
  const rating=`<div class="ftr-rating"><span>★★★★★</span><strong>4.8</strong>/5<span>· ${e?'2,400+ verified reviews':'2 400+ avis vérifiés'}</span></div>`;
  const social=`<div class="ftr-social"><a href="#" title="Instagram">${SVG_IG}</a><a href="#" title="Facebook">${SVG_FB}</a><a href="#" title="TikTok">${SVG_TT}</a><a href="#" title="Pinterest">${SVG_PIN}</a></div>`;
  const c1=e
    ?`<li><a href="/collections/">All Collections</a></li><li><a href="/collections/new-arrivals/">New Arrivals</a></li><li><a href="/collections/bestsellers/">Bestsellers</a></li><li><a href="/collections/sale/">Sale</a></li><li><a href="/blog/">Journal</a></li>`
    :`<li><a href="/collections/">Toutes les collections</a></li><li><a href="/collections/nouveautes/">Nouveautés</a></li><li><a href="/collections/bestsellers/">Meilleures ventes</a></li><li><a href="/collections/soldes/">Soldes</a></li><li><a href="/blog/">Blog</a></li>`;
  const c2=e
    ?`<li><a href="/cgv/">Terms & Conditions</a></li><li><a href="/mentions-legales/">Legal Notice</a></li><li><a href="/confidentialite/">Privacy Policy</a></li><li><a href="#">Returns & Refunds</a></li><li><a href="#">Delivery info</a></li><li><a href="#">FAQ</a></li>`
    :`<li><a href="/cgv/">CGV</a></li><li><a href="/mentions-legales/">Mentions légales</a></li><li><a href="/confidentialite/">Confidentialité</a></li><li><a href="#">Retours & Remboursements</a></li><li><a href="#">Informations livraison</a></li><li><a href="#">FAQ</a></li>`;
  const c3=`<li><a href="mailto:${contact}">${contact}</a></li><li>${e?'Mon–Fri, 9am–6pm':'Lun–Ven, 9h–18h'}</li><li style="margin-top:.5rem"><span class="ftr-sub">${e?'Delivery':'Livraison'}</span>${e?'3–5 business days':'3–5 jours ouvrés'}</li><li>${e?'Free from €39':'Offerte dès 39€'}</li>`;
  const pays=`<div class="ftr-pay-row"><span class="pay-b pay-visa">VISA</span><span class="pay-b pay-mc" style="position:relative"><span class="mc-c1"></span><span class="mc-c2"></span></span><span class="pay-b pay-amex">AMEX</span><span class="pay-b pay-pp">PayPal</span><span class="pay-b pay-cb">CB</span><span class="pay-b pay-ap">⬛ Pay</span></div>`;
  const cert=`<div class="ftr-cert">${SVG_LOCK}<span>${e?'SSL Secure':'SSL Sécurisé'}</span><span style="opacity:.3">·</span><span>${e?'30-Day Returns':'Retours 30j'}</span><span style="opacity:.3">·</span><span>${e?'Eco packaging':'Éco-responsable'}</span></div>`;
  return `<footer class="ftr"><div class="ftr-top"><div><p class="ftr-logo">${esc(b)}</p><p class="ftr-desc">${desc}</p>${rating}${social}</div><div><h4>${e?'Shop':'Boutique'}</h4><ul>${c1}</ul></div><div><h4>${e?'Information':'Informations'}</h4><ul>${c2}</ul></div><div><h4>${e?'Customer Service':'Service client'}</h4><ul class="ftr-contact-list">${c3}</ul>${pays}</div></div><div class="ftr-btm">${cert}<span>© ${yr()} ${esc(b)}</span><div><a href="/mentions-legales/">${e?'Legal':'Légal'}</a><a href="/confidentialite/">${e?'Privacy':'Confidentialité'}</a><a href="/cgv/">${e?'Terms':'CGV'}</a></div></div></footer>`;
}

function genHome(bp,niche,domain,lang){
  const b=brand(domain),e=lang==='en';
  const [p,pd,ac,em,lbFr,lbEn]=NS[niche]||['#2563eb','#1d4ed8','#eff6ff','🛍️','Boutique','Shop'];
  const lb=e?lbEn:lbFr;
  const cols=bp.allCollections||bp.mvpSelection||[];
  const n=bp.totalCollections||cols.length;
  const desc=e?`${b} — ${lb}. ${n} collections. Free delivery on orders over €39.`:`${b} — ${lb}. ${n} collections. Livraison offerte dès 39€.`;
  const ldItems=cols.slice(0,8).map((c,i)=>`{"@type":"ListItem","position":${i+1},"name":${JSON.stringify(c.title)},"url":"https://${domain}${c.path}/"}`).join(',');
  const ld=`{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":${JSON.stringify(b)},"url":"https://${domain}"},{"@type":"WebSite","url":"https://${domain}","potentialAction":{"@type":"SearchAction","target":"https://${domain}/search?q={s}","query-input":"required name=s"}},{"@type":"ItemList","itemListElement":[${ldItems}]}]}`;
  const trustBadge=e?`★★★★★ 4.8 · 2,400+ happy customers`:`★★★★★ 4.8 · 2 400+ clients satisfaits`;
  const body=`${promoBar(niche,lang)}${navBar(b,lang)}<section class="hero"><div class="hero-inner"><p class="hero-tag">${e?'New Collection 2024':'Nouvelle Collection 2024'}</p><h1>${esc(b)}</h1><p>${lb} — ${n} collections${e?'. Handcrafted for you.':'. Fait pour vous.'}</p><div class="hero-ctas"><a href="/collections/" class="btn-w">${e?'Explore Collections':'Voir les collections'}</a><a href="/collections/new-arrivals/" class="btn-o">${e?'New Arrivals':'Nouveautés'}</a></div><div class="hero-trust">${trustBadge}</div></div></section>${trustSection(lang)}${sloganSection(b,niche,lang)}${genNewArrivals(cols,em,lang)}${genFeatCols(cols,em,lang)}${genTestimonials(lang)}${genBestsellers(cols,em,lang)}${genAbout(b,p,em,lang)}${newsletterSection(pd,lang)}${footerSection(b,domain,lang)}`;
  return layout(`${b} — ${lb}`,desc,`https://${domain}/`,ld,body,p,pd,ac,lang);
}

function genCollIndex(bp,niche,domain,lang){
  const b=brand(domain),e=lang==='en';
  const [p,pd,ac,em,lbFr,lbEn]=NS[niche]||['#2563eb','#1d4ed8','#eff6ff','🛍️','Boutique','Shop'];
  const lb=e?lbEn:lbFr;
  const cols=bp.allCollections||bp.mvpSelection||[];
  const cards=cols.map(c=>`<a class="fc" href="${c.path}/" style="height:360px"><div class="fc-img">${em}</div><div class="fc-overlay"><h3>${esc(c.title)}</h3><p>${c.products?`${c.products} ${e?'products':'produits'}`:''}</p><span>${e?'Shop →':'Voir →'}</span></div></a>`).join('');
  const title=`${e?'All Collections':'Toutes nos collections'} | ${b}`;
  const desc=e?`All ${b} collections — ${lb}. ${cols.length} categories.`:`Toutes nos collections — ${b}. ${cols.length} catégories.`;
  const ld=`{"@context":"https://schema.org","@type":"CollectionPage","name":${JSON.stringify(title)},"url":"https://${domain}/collections/"}`;
  const body=`${promoBar(niche,lang)}${navBar(b,lang)}<div class="bc"><div class="bc-i"><a href="/">${e?'Home':'Accueil'}</a> › ${e?'Collections':'Collections'}</div></div><div class="feat-bg"><div class="feat-h" style="margin-bottom:2rem"><h2 style="font:normal clamp(1.6rem,3vw,2.2rem)/1.15 Georgia,serif">${e?'All Collections':'Toutes nos collections'}</h2><p style="color:#888;font-size:.88rem;margin-top:.5rem">${cols.length} ${lb.toLowerCase()} ${e?'categories':'catégories'}</p></div><div class="feat-grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${cards}</div></div>${trustSection(lang)}${newsletterSection(pd,lang)}${footerSection(b,domain,lang)}`;
  return layout(title,desc,`https://${domain}/collections/`,ld,body,p,pd,ac,lang);
}

function genColl(col,bp,niche,domain,lang){
  const b=brand(domain),e=lang==='en';
  const [p,pd,ac,em]=NS[niche]||['#2563eb','#1d4ed8','#eff6ff','🛍️'];
  const n=Math.min(col.products||12,24);
  const base=col.title.split(/[\s&]/)[0];
  const types=['Signature','Heritage','Classic','Elite','Artisan','Premium','Essential','Royal','Select','Exclusive','Refined','Limited'];
  const prods=Array.from({length:n},(_,i)=>{
    const nm=`${base} ${types[i%types.length]}${i>=types.length?' '+String.fromCharCode(65+Math.floor(i/types.length)):''}`;
    const pr=(29.9+i*15).toFixed(2);
    const orig=(i%3===0&&i>0)?(44.9+i*15).toFixed(2):null;
    return prodCard(nm,pr,orig,em,lang,orig?(e?'SALE':'PROMO'):'',`${col.path}/${prodSlug(nm)}/`);
  }).join('');
  const ld=`{"@context":"https://schema.org","@type":"CollectionPage","name":${JSON.stringify(col.title)},"url":"https://${domain}${col.path}/"}`;
  const desc=e?`${col.title} — ${n} products. ${b}. Free delivery on orders over €39.`:`${col.title} — ${n} produits. ${b}. Livraison offerte dès 39€.`;
  const body=`${promoBar(niche,lang)}${navBar(b,lang)}<div class="bc"><div class="bc-i"><a href="/">${e?'Home':'Accueil'}</a> › <a href="/collections/">Collections</a> › ${esc(col.title)}</div></div><section class="hero" style="min-height:36vh;padding:2.5rem 2rem"><div class="hero-inner"><p class="hero-tag">${e?'Collection':'Collection'}</p><h1>${esc(col.title)}</h1><p>${n} ${e?'products · Free delivery from €39':'produits · Livraison offerte dès 39€'}</p></div></section>${filterBar(col,niche,lang,n)}<div class="sec"><div class="pg4">${prods}</div></div>${newsletterSection(pd,lang)}${footerSection(b,domain,lang)}`;
  return layout(`${esc(col.title)} | ${b}`,desc,`https://${domain}${col.path}/`,ld,body,p,pd,ac,lang);
}

function genLegal(domain,type,lang){
  const b=brand(domain),e=lang==='en';
  const [p,pd,ac]=NS['Mode Femme']||['#7c3aed','#5b21b6','#f5f3ff'];
  const s={
    mentions:{title:e?'Legal Notice':'Mentions légales',path:'/mentions-legales/',body:e
      ?`<h2>Publisher</h2><p>${b} — Online retail. Contact: hello@${domain}</p><h2>Hosting</h2><p>Cloudflare, Inc. — 101 Townsend St, San Francisco, CA 94107, USA</p><h2>Intellectual Property</h2><p>All content on this site is the property of ${b}. Reproduction prohibited.</p><h2>Personal Data (GDPR)</h2><p>Access, rectification, erasure: hello@${domain}</p>`
      :`<h2>Éditeur</h2><p>${b} — E-commerce. Contact : contact@${domain}</p><h2>Hébergement</h2><p>Cloudflare, Inc. — 101 Townsend St, San Francisco, CA 94107, USA</p><h2>Propriété intellectuelle</h2><p>Tous les contenus sont la propriété de ${b}. Reproduction interdite.</p><h2>RGPD</h2><p>Accès, rectification, suppression : contact@${domain}</p>`},
    cgv:{title:e?'Terms & Conditions':'CGV',path:'/cgv/',body:e
      ?`<h2>Art. 1 — Purpose</h2><p>These Terms govern all sales made on ${domain}.</p><h2>Art. 2 — Prices</h2><p>Prices in euros, VAT inclusive. Subject to change without notice.</p><h2>Art. 3 — Delivery</h2><p>EU delivery 3–7 business days. Free above €39.</p><h2>Art. 4 — Right of Withdrawal</h2><p>14-day cooling-off period from delivery.</p><h2>Art. 5 — Contact</h2><p>hello@${domain}</p>`
      :`<h2>Art. 1 — Objet</h2><p>Ces CGV régissent toutes les ventes effectuées sur ${domain}.</p><h2>Art. 2 — Prix</h2><p>Prix en euros TTC. Modifiables sans préavis.</p><h2>Art. 3 — Livraison</h2><p>France et Europe, 3 à 7 jours. Offerte dès 39€.</p><h2>Art. 4 — Rétractation</h2><p>14 jours à compter de la livraison (art. L221-18).</p><h2>Art. 5 — Contact</h2><p>contact@${domain}</p>`},
    confidentialite:{title:e?'Privacy Policy':'Confidentialité',path:'/confidentialite/',body:e
      ?`<h2>Data Collected</h2><p>Only data necessary to process your order is collected.</p><h2>Legal Basis</h2><p>GDPR art. 6.1.b — performance of a contract.</p><h2>Retention</h2><p>3 years after last interaction.</p><h2>Your Rights</h2><p>Access, rectification, erasure, portability: hello@${domain}</p>`
      :`<h2>Données collectées</h2><p>Seules les données nécessaires au traitement de votre commande sont collectées.</p><h2>Base légale</h2><p>RGPD art. 6.1.b — exécution du contrat.</p><h2>Conservation</h2><p>3 ans après la dernière interaction.</p><h2>Vos droits</h2><p>Accès, rectification, suppression, portabilité : contact@${domain}</p>`},
  }[type];
  const ld=`{"@context":"https://schema.org","@type":"WebPage","name":${JSON.stringify(s.title+' | '+b)},"url":"https://${domain}${s.path}"}`;
  const body=`${navBar(b,lang)}<div class="legal"><h1>${s.title}</h1>${s.body}<p style="margin-top:2.5rem"><a href="/" style="color:var(--p)">← ${e?'Back to home':"Retour à l'accueil"}</a></p></div>${footerSection(b,domain,lang)}`;
  return layout(`${s.title} | ${b}`,`${s.title} — ${b}`,`https://${domain}${s.path}`,ld,body,p,pd,ac,lang);
}

function genSitemap(bp,domain){
  const d=new Date().toISOString().slice(0,10);
  const cols=(bp.allCollections||[]).map(c=>`<url><loc>https://${domain}${c.path}/</loc><lastmod>${d}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://${domain}/</loc><lastmod>${d}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url><url><loc>https://${domain}/collections/</loc><lastmod>${d}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>${cols}</urlset>`;
}

function genCheckout(bp,niche,domain,lang){
  const b=brand(domain),e=lang==='en';
  const[p,pd,ac,em]=NS[niche]||['#2563eb','#1d4ed8','#eff6ff','🛍️'];
  const cols=bp.allCollections||[];
  const c1=cols[0]||{title:'Product',path:'/collections/products'};
  const c2=cols[1]||c1;
  const it1={n:`${c1.title.split(/[\s&]/)[0]} Signature`,pr:'89.90',href:`${c1.path}/`};
  const it2={n:`${c2.title.split(/[\s&]/)[0]} Heritage`,pr:'129.90',href:`${c2.path}/`};
  const total=(parseFloat(it1.pr)+parseFloat(it2.pr)).toFixed(2);
  const steps=e?['Cart','Information','Shipping','Payment']:['Panier','Informations','Livraison','Paiement'];
  const stepsH=`<div class="ck-steps">${steps.map((s,i)=>`<span class="ck-step${i===1?' act':i<1?' done':''}">${i<1?`<span class="ck-sn">✓</span>`:`<span class="ck-sn">${i+1}</span>`}${s}</span>${i<3?'<span class="ck-sep">›</span>':''}`).join('')}</div>`;
  const xpay=`<div class="ck-express"><p class="ck-xlab">${e?'Express checkout':'Paiement rapide'}</p><div class="ck-xbtns"><button class="ck-xb ck-xb-ap" onclick="return false"><svg width="12" height="15" viewBox="0 0 12 15" fill="currentColor"><path d="M10.3 5.8c0-1.8 1.5-2.7 1.6-2.7-.9-1.3-2.2-1.5-2.7-1.5-1.1-.1-2.2.7-2.7.7-.5 0-1.4-.7-2.3-.6C2.9 1.8 1.7 2.5 1.1 3.6c-1.3 2.3-.4 5.6 1 7.4.6.9 1.4 1.9 2.4 1.8 1 0 1.3-.6 2.5-.6 1.1 0 1.5.6 2.5.6 1 0 1.7-.9 2.3-1.8.7-1 1-1.9 1-1.9S10.3 8 10.3 5.8z"/><path d="M8.6 2.8C9.1 2.1 9.4 1.2 9.3 0 8.6.1 7.8.6 7.2 1.2c-.5.6-.9 1.5-.8 2.3.8.1 1.7-.4 2.2-.7z"/></svg> Apple Pay</button><button class="ck-xb ck-xb-g" onclick="return false"><span style="color:#4285F4;font-weight:800">G</span><span style="color:#34A853;font-weight:800">o</span><span style="color:#FBBC04;font-weight:800">o</span><span style="color:#EA4335;font-weight:800">g</span><span style="color:#4285F4;font-weight:800">l</span><span style="color:#34A853;font-weight:800">e</span> Pay</button><button class="ck-xb ck-xb-pp" onclick="return false"><svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor"><path d="M11.6 1.9C10.7 1 9 .5 6.9.5H1.9c-.4 0-.7.3-.7.6L0 10.2c0 .3.2.5.5.5h2.6l.7-4.2v.2c.1-.4.4-.6.7-.6H5.2c2.8 0 5-1.1 5.6-4.4 0-.2 0-.3.1-.4.4.2.6.6.8 1-.1-.2-.1-.2-.1-.3z" fill="#003087"/><path d="M11.7 3.1c0 .2-.1.3-.1.4-.6 3.3-2.8 4.4-5.6 4.4H4.5c-.3 0-.6.3-.7.6L3 14.5c0 .3.2.5.4.5h3c.3 0 .6-.3.6-.5v-.1l.5-3.2v-.1c.1-.3.3-.5.6-.5h.4c2.4 0 4.3-1 4.9-3.8.2-1.1.1-2.1-.7-2.7z" fill="#009cde"/></svg> PayPal</button></div><div class="ck-or"><span>${e?'or pay by card':'ou payer par carte'}</span></div></div>`;
  const form=`<div class="ck-sec"><h3 class="ck-sec-h">${e?'Contact':'Contact'}</h3><div class="ck-f"><label class="ck-lb">${e?'Email':'Email'}</label><input class="ck-i" type="email" placeholder="${e?'name@example.com':'prenom@exemple.fr'}" autocomplete="email"></div><label class="ck-chk"><input type="checkbox" checked> ${e?'Send me news and offers':'M\'envoyer les offres et nouveautés'}</label></div><div class="ck-sec"><h3 class="ck-sec-h">${e?'Delivery address':'Adresse de livraison'}</h3><div class="ck-f"><label class="ck-lb">${e?'Country':'Pays'}</label><select class="ck-i ck-sel" autocomplete="country"><option>${e?'France':'France'}</option><option>${e?'United Kingdom':'Royaume-Uni'}</option><option>${e?'Belgium':'Belgique'}</option><option>${e?'Switzerland':'Suisse'}</option><option>${e?'Germany':'Allemagne'}</option></select></div><div class="ck-2c"><div class="ck-f"><label class="ck-lb">${e?'First name':'Prénom'}</label><input class="ck-i" type="text" autocomplete="given-name"></div><div class="ck-f"><label class="ck-lb">${e?'Last name':'Nom'}</label><input class="ck-i" type="text" autocomplete="family-name"></div></div><div class="ck-f"><label class="ck-lb">${e?'Address':'Adresse'}</label><input class="ck-i" type="text" autocomplete="address-line1"></div><div class="ck-2c"><div class="ck-f"><label class="ck-lb">${e?'Postcode':'Code postal'}</label><input class="ck-i" type="text" autocomplete="postal-code"></div><div class="ck-f"><label class="ck-lb">${e?'City':'Ville'}</label><input class="ck-i" type="text" autocomplete="address-level2"></div></div></div><div class="ck-sec"><h3 class="ck-sec-h">${e?'Shipping method':'Mode de livraison'}</h3><label class="ck-ship act" id="s1"><input type="radio" name="ship" checked onchange="document.querySelectorAll('.ck-ship').forEach(x=>x.classList.remove('act'));document.getElementById('s1').classList.add('act')"><div class="ck-ship-i"><span>${e?'Standard — 3–5 business days':'Standard — 3–5 jours ouvrés'}</span></div><strong>${e?'Free':'Gratuit'}</strong></label><label class="ck-ship" id="s2"><input type="radio" name="ship" onchange="document.querySelectorAll('.ck-ship').forEach(x=>x.classList.remove('act'));document.getElementById('s2').classList.add('act')"><div class="ck-ship-i"><span>${e?'Express — 1–2 business days':'Express — 1–2 jours ouvrés'}</span></div><strong>€4.99</strong></label></div><div class="ck-sec" id="ck-pay"><h3 class="ck-sec-h">${e?'Payment':'Paiement'}</h3><p class="ck-sec-note">${SVG_LOCK} ${e?'All transactions are secure and encrypted':'Toutes les transactions sont sécurisées et chiffrées'}</p>${xpay}<div class="ck-f ck-card-w"><label class="ck-lb">${e?'Card number':'Numéro de carte'}</label><div style="position:relative"><input class="ck-i" id="cnum" type="text" placeholder="1234 5678 9012 3456" maxlength="19" inputmode="numeric" autocomplete="cc-number"><span class="ck-ctype" id="ctype"></span></div></div><div class="ck-f"><label class="ck-lb">${e?'Name on card':'Nom sur la carte'}</label><input class="ck-i" type="text" placeholder="${e?'JOHN DOE':'JEAN DUPONT'}" autocomplete="cc-name"></div><div class="ck-2c"><div class="ck-f"><label class="ck-lb">${e?'Expiry':'Expiration'}</label><input class="ck-i" id="cexp" type="text" placeholder="MM / YY" maxlength="7" inputmode="numeric" autocomplete="cc-exp"></div><div class="ck-f"><label class="ck-lb">CVV <abbr title="${e?'3-digit code on back':'Code 3 chiffres au dos'}" style="text-decoration:none;border:1px solid #bbb;border-radius:50%;font-size:.6rem;padding:0 4px;color:#888;font-style:normal;cursor:help">?</abbr></label><input class="ck-i" type="text" placeholder="123" maxlength="4" inputmode="numeric" autocomplete="cc-csc"></div></div></div><button class="ck-pay-btn" id="payBtn" onclick="doPay(this)">${SVG_LOCK} <span id="payTxt">${e?`Pay securely — €${total}`:`Payer sécurisé — €${total}`}</span></button><div class="ck-trust-r">${SVG_LOCK}<small>${e?'SSL Secure':'SSL Sécurisé'}</small><span>·</span>${SVG_RETURN}<small>${e?'30-day returns':'Retours 30j'}</small><span>·</span><small>${e?'Satisfaction guaranteed':'Satisfait ou remboursé'}</small></div>`;
  const items=`<div class="ck-prod"><div class="ck-pimg">${em}<span class="ck-pqty">1</span></div><span class="ck-pnm">${esc(it1.n)}</span><span class="ck-ppr">€${it1.pr}</span></div><div class="ck-prod"><div class="ck-pimg">${em}<span class="ck-pqty">1</span></div><span class="ck-pnm">${esc(it2.n)}</span><span class="ck-ppr">€${it2.pr}</span></div>`;
  const summary=`<div class="ck-sum"><div class="ck-coupon"><input class="ck-i" type="text" placeholder="${e?'Discount code':'Code promo'}" id="cpn"><button class="ck-cpn-btn" onclick="document.getElementById('cpn').value&&alert('${e?'10% discount applied!':'-10% appliqué !'}')">${e?'Apply':'Appliquer'}</button></div><div class="ck-prods">${items}</div><div class="ck-tots"><div class="ck-tr"><span>${e?'Subtotal':'Sous-total'}</span><span>€${total}</span></div><div class="ck-tr"><span>${e?'Shipping':'Livraison'}</span><span style="color:#16a34a;font-weight:600">${e?'Free':'Gratuit'}</span></div><div class="ck-tr ck-tot-f"><span>${e?'Total':'Total'}<small>${e?' (incl. VAT)':' (TVA incluse)'}</small></span><span>€${total}</span></div></div><div class="ck-pmethods"><span class="pay-b pay-visa" style="opacity:.7">VISA</span><span class="pay-b pay-mc" style="opacity:.7;position:relative"><span class="mc-c1"></span><span class="mc-c2"></span></span><span class="pay-b pay-amex" style="opacity:.7">AMEX</span><span class="pay-b pay-pp" style="opacity:.7">PayPal</span><span class="pay-b pay-cb" style="opacity:.7">CB</span></div></div>`;
  const modal=`<div class="ck-ok" id="ckOk" style="display:none"><div class="ck-ok-box"><div class="ck-ok-ico">✓</div><h2>${e?'Order confirmed!':'Commande confirmée !'}</h2><p>${e?'Thank you! A confirmation has been sent to your email.':'Merci ! Une confirmation a été envoyée par email.'}</p><p style="font-weight:700;color:var(--p);margin:.8rem 0 1.5rem">${e?'Order':'Commande'} #${Math.floor(1e5+Math.random()*9e5)}</p><a href="/" class="ck-pay-btn" style="text-decoration:none;display:flex;width:fit-content;padding:.9rem 2rem;margin:0 auto">${e?'Continue Shopping':'Continuer'}</a></div></div>`;
  const ckCss=`<style>
.ck-hd{background:#fff;border-bottom:1px solid #e8e4df;padding:.9rem 1.5rem;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:200}
.ck-hd-logo{font:normal 1.1rem Georgia,serif;letter-spacing:.2em;text-transform:uppercase;color:#111}
.ck-hd-sec{display:flex;align-items:center;gap:.4rem;font-size:.72rem;color:#888}
.ck-steps{display:flex;align-items:center;gap:.3rem;font-size:.72rem;color:#bbb;padding:1.2rem 0 2rem;flex-wrap:wrap}
.ck-step{display:flex;align-items:center;gap:.4rem;font-weight:500}
.ck-step.act{color:#111}.ck-step.done{color:var(--p)}
.ck-sn{width:20px;height:20px;border-radius:50%;border:1.5px solid currentColor;display:inline-flex;align-items:center;justify-content:center;font-size:.63rem}
.ck-step.act .ck-sn{background:#111;border-color:#111;color:#fff}
.ck-step.done .ck-sn{background:var(--p);border-color:var(--p);color:#fff}
.ck-sep{color:#ddd;margin:0 .2rem}
.ck-wrap{max-width:1200px;margin:0 auto;padding:0 1.5rem 4rem;display:grid;grid-template-columns:1.1fr .85fr;gap:4rem;align-items:start}
.ck-sec{background:#fff;border:1px solid #e8e4df;padding:1.4rem 1.5rem;margin-bottom:.9rem;border-radius:2px}
.ck-sec-h{font-size:.72rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#111;margin-bottom:1.1rem;padding-bottom:.75rem;border-bottom:1px solid #f0eeeb}
.ck-f{margin-bottom:.85rem}
.ck-lb{display:block;font-size:.73rem;color:#666;margin-bottom:.3rem;font-weight:500}
.ck-i{width:100%;padding:.72rem .95rem;border:1px solid #ddd;background:#fff;font-size:.88rem;color:#111;font-family:inherit;outline:none;border-radius:2px;transition:border-color .18s;box-sizing:border-box}
.ck-i:focus{border-color:var(--p);box-shadow:0 0 0 3px color-mix(in srgb,var(--p) 12%,transparent)}
.ck-sel{appearance:none;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none'/%3E%3C/svg%3E") no-repeat right .95rem center;padding-right:2.5rem;cursor:pointer}
.ck-2c{display:grid;grid-template-columns:1fr 1fr;gap:.8rem}
.ck-chk{display:flex;align-items:center;gap:.6rem;font-size:.8rem;color:#666;cursor:pointer;margin-top:.6rem}
.ck-chk input{accent-color:var(--p)}
.ck-ship{display:flex;align-items:center;gap:.9rem;padding:.95rem 1.1rem;border:1px solid #ddd;border-radius:2px;cursor:pointer;margin-bottom:.5rem;transition:border-color .18s}
.ck-ship.act{border-color:var(--p);background:color-mix(in srgb,var(--p) 4%,white)}
.ck-ship input{accent-color:var(--p);flex-shrink:0}
.ck-ship-i{flex:1;font-size:.84rem;color:#111}
.ck-ship strong{font-size:.84rem;color:#111;white-space:nowrap}
.ck-sec-note{display:flex;align-items:center;gap:.5rem;font-size:.77rem;color:#888;margin-bottom:1rem}
.ck-express{margin-bottom:1.2rem}
.ck-xlab{font-size:.7rem;color:#aaa;text-align:center;margin-bottom:.7rem;letter-spacing:.1em;text-transform:uppercase}
.ck-xbtns{display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem;margin-bottom:.8rem}
.ck-xb{display:flex;align-items:center;justify-content:center;gap:.35rem;padding:.7rem .4rem;border:1px solid #e0dbd5;background:#fff;font-size:.74rem;font-weight:600;cursor:pointer;border-radius:2px;font-family:inherit;transition:all .18s}
.ck-xb:hover{border-color:#bbb}
.ck-xb-ap{background:#000;color:#fff;border-color:#000}
.ck-xb-ap:hover{background:#222;border-color:#222}
.ck-or{text-align:center;position:relative;margin:.3rem 0 1.1rem}
.ck-or::before{content:'';position:absolute;left:0;right:0;top:50%;height:1px;background:#e8e4df}
.ck-or span{background:#fff;position:relative;padding:0 .9rem;font-size:.72rem;color:#aaa}
.ck-card-w .ck-i{padding-right:4rem}
.ck-ctype{position:absolute;right:.9rem;top:50%;transform:translateY(-50%);font-size:.62rem;font-weight:800;color:var(--p);letter-spacing:.05em}
.ck-pay-btn{display:flex;align-items:center;justify-content:center;gap:.5rem;width:100%;padding:1.05rem;background:var(--p);color:#fff;border:none;font-size:.78rem;letter-spacing:.2em;text-transform:uppercase;cursor:pointer;font-weight:700;font-family:inherit;transition:background .22s;margin:1.2rem 0 .8rem;border-radius:2px}
.ck-pay-btn:hover{background:var(--pd)}
.ck-pay-btn:disabled{opacity:.7;cursor:wait}
.ck-trust-r{display:flex;align-items:center;justify-content:center;gap:.6rem;font-size:.7rem;color:#aaa;flex-wrap:wrap}
.ck-sum{position:sticky;top:80px;background:#fafaf8;border:1px solid #e8e4df;padding:1.5rem;border-radius:2px}
.ck-coupon{display:flex;gap:.5rem;margin-bottom:1.2rem}
.ck-coupon .ck-i{flex:1;margin:0}
.ck-cpn-btn{padding:.72rem 1rem;background:#111;color:#fff;border:none;font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;font-family:inherit;white-space:nowrap;border-radius:2px;transition:background .2s}
.ck-cpn-btn:hover{background:var(--p)}
.ck-prods{border-top:1px solid #e8e4df;border-bottom:1px solid #e8e4df;padding:.8rem 0;margin-bottom:1rem}
.ck-prod{display:flex;align-items:center;gap:.85rem;padding:.45rem 0}
.ck-pimg{width:54px;height:54px;background:linear-gradient(145deg,var(--a),rgba(255,255,255,.5));border:1px solid #e8e4df;display:flex;align-items:center;justify-content:center;font-size:1.5rem;position:relative;flex-shrink:0;border-radius:2px}
.ck-pqty{position:absolute;top:-7px;right:-7px;width:18px;height:18px;background:#555;color:#fff;border-radius:50%;font-size:.58rem;display:flex;align-items:center;justify-content:center;font-weight:700}
.ck-pnm{flex:1;font-size:.82rem;color:#333;line-height:1.35}
.ck-ppr{font-size:.85rem;font-weight:600;color:#111;white-space:nowrap}
.ck-tots{margin-bottom:1.2rem}
.ck-tr{display:flex;justify-content:space-between;align-items:baseline;padding:.3rem 0;font-size:.83rem;color:#666}
.ck-tot-f{border-top:1px solid #e8e4df;padding-top:.7rem;margin-top:.3rem}
.ck-tot-f>span:first-child{font-weight:600;color:#111;font-size:.86rem}
.ck-tot-f>span:last-child{font:normal 1.2rem Georgia,serif;color:#111}
.ck-tot-f small{font-size:.68rem;color:#aaa;font-weight:400;font-family:inherit}
.ck-pmethods{display:flex;gap:.4rem;flex-wrap:wrap;justify-content:center;margin-top:.5rem}
.ck-ok{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:1000}
.ck-ok-box{background:#fff;padding:3rem 2.5rem;max-width:420px;width:90%;text-align:center}
.ck-ok-ico{width:66px;height:66px;background:var(--p);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 1.2rem;color:#fff;font-size:1.9rem}
.ck-ok-box h2{font:normal 1.6rem Georgia,serif;margin-bottom:.8rem;color:#111}
.ck-ok-box p{font-size:.88rem;color:#666;line-height:1.75}
.ck-ft{border-top:1px solid #e8e4df;padding:1.5rem;text-align:center;font-size:.72rem;color:#aaa}
.ck-ft a{color:#aaa;margin:0 .6rem;transition:color .2s}.ck-ft a:hover{color:#111}
@media(max-width:900px){.ck-wrap{grid-template-columns:1fr;gap:2rem}.ck-sum{position:static;order:-1}}
</style>`;
  const js=`<script>document.getElementById('cnum')?.addEventListener('input',e=>{let v=e.target.value.replace(/\\D/g,'').slice(0,16);e.target.value=v.replace(/(.{4})/g,'$1 ').trim();const t=document.getElementById('ctype');if(t){if(v.startsWith('4'))t.textContent='VISA';else if(/^5[1-5]|^2[2-7]/.test(v))t.textContent='MC';else if(/^3[47]/.test(v))t.textContent='AMEX';else t.textContent=''}});document.getElementById('cexp')?.addEventListener('input',e=>{let v=e.target.value.replace(/\\D/g,'').slice(0,4);if(v.length>=2)v=v.slice(0,2)+' / '+v.slice(2);e.target.value=v});function doPay(b){b.disabled=true;const t=document.getElementById('payTxt');if(t)t.textContent='${e?'Processing…':'Traitement…'}';setTimeout(()=>{document.getElementById('ckOk').style.display='flex';document.body.style.overflow='hidden'},1600)}</script>`;
  const hd=`<header class="ck-hd"><a href="/" class="ck-hd-logo">${esc(b)}</a><span class="ck-hd-sec">${SVG_LOCK} ${e?'Secure checkout':'Paiement sécurisé'}</span></header>`;
  const ft=`<footer class="ck-ft"><a href="/cgv/">${e?'Terms':'CGV'}</a><a href="/confidentialite/">${e?'Privacy':'Confidentialité'}</a><a href="/mentions-legales/">${e?'Legal':'Mentions légales'}</a><a href="/">${e?'Return to store':'Retour à la boutique'}</a></footer>`;
  const url=`https://${domain}/checkout/`;
  const ld=`{"@context":"https://schema.org","@type":"CheckoutPage","name":"Checkout","url":"${url}"}`;
  const body=`${ckCss}${hd}<div style="background:#fafaf8;min-height:calc(100vh - 62px)"><div class="ck-wrap"><div>${stepsH}${form}</div>${summary}</div>${ft}</div>${modal}${js}`;
  return layout(`${e?'Checkout':'Paiement'} | ${b}`,`${e?'Secure checkout':'Paiement sécurisé'} — ${b}`,url,ld,body,p,pd,ac,lang);
}

function genProduct(prod,col,niche,domain,lang){
  const{title,price,orig}=prod;
  const b=brand(domain),e=lang==='en';
  const[p,pd,ac,em]=NS[niche]||['#2563eb','#1d4ed8','#eff6ff','🛍️'];
  const pSl=prodSlug(title);
  const url=`https://${domain}${col.path}/${pSl}/`;
  const saveAmt=orig?(parseFloat(orig)-parseFloat(price)).toFixed(0):null;
  // Delivery estimate
  const d1=new Date(Date.now()+3*864e5),d2=new Date(Date.now()+7*864e5);
  const mo=e?['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']:['jan','fév','mars','avr','mai','juin','juil','août','sept','oct','nov','déc'];
  const wd=e?['Sun','Mon','Tue','Wed','Thu','Fri','Sat']:['dim','lun','mar','mer','jeu','ven','sam'];
  const fd=d=>`${wd[d.getDay()]} ${d.getDate()} ${mo[d.getMonth()]}`;
  const dlv=`${e?'Estimated delivery':'Livraison estimée'}: <strong>${fd(d1)} – ${fd(d2)}</strong>`;
  // Variants
  const metalN=['Bijoux','Jewellery','Jewelry','Maroquinerie'];
  const volN=['Beauté','Bien-être'];
  const ringN=['Bijoux','Jewellery','Jewelry'];
  let varHTML='';
  if(metalN.includes(niche)){
    const ms=e?['Gold','Silver','Rose Gold']:['Or','Argent','Or Rose'];
    const mc=['#d4af37','#c0c0c0','#b76e79'];
    varHTML=`<p class="pdp-var-label">${e?'Metal':'Métal'}</p><div class="pdp-colors">${ms.map((m,i)=>`<span class="pdp-swatch${i===0?' active':''}" style="background:${mc[i]}" title="${m}"></span>`).join('')}</div>`;
    if(ringN.includes(niche)){
      varHTML+=`<p class="pdp-var-label" style="margin-top:.9rem">${e?'Ring Size':'Pointure'}</p><div class="pdp-sizes">${(e?['5','6','7','8','9','10']:['48','50','52','54','56','58']).map((s,i)=>`<span class="pdp-sz${i===2?' active':''}">${s}</span>`).join('')}</div><p style="font-size:.72rem;color:#aaa;margin-top:.4rem">${e?'Not sure? See our size guide →':'Pas sûr ? Voir notre guide des tailles →'}</p>`;
    }
  }else if(volN.includes(niche)){
    varHTML=`<p class="pdp-var-label">${e?'Format':'Format'}</p><div class="pdp-sizes">${['30 ml','50 ml','100 ml'].map((v,i)=>`<span class="pdp-sz${i===1?' active':''}">${v}</span>`).join('')}</div>`;
  }else{
    const cs=e?['Black','White','Navy','Beige']:['Noir','Blanc','Marine','Beige'];
    const cc=['#111','#f0efee','#1e3a5f','#f5f0e8'];
    varHTML=`<p class="pdp-var-label">${e?'Color':'Couleur'}</p><div class="pdp-colors">${cs.map((c,i)=>`<span class="pdp-swatch${i===0?' active':''}" style="background:${cc[i]};${i===1?'outline:1px solid #ddd;outline-offset:1px':''}" title="${c}"></span>`).join('')}</div><p class="pdp-var-label" style="margin-top:.9rem">${e?'Size':'Taille'}</p><div class="pdp-sizes">${['XS','S','M','L','XL'].map((s,i)=>`<span class="pdp-sz${i===1?' active':''}">${s}</span>`).join('')}</div>`;
  }
  // Image gallery — styled gradient placeholders (4 angles)
  const grads=[`linear-gradient(145deg,${ac},${p})`,`linear-gradient(220deg,${p},${pd})`,`linear-gradient(40deg,${ac},${pd})`,`linear-gradient(280deg,${p},${ac})`];
  const mainImg=`<div class="pdp-main-img" style="background:${grads[0]}"><div class="pdp-img-inner"><div class="pdp-img-em">${em}</div><div class="pdp-img-lbl"><div class="pdp-img-brand">${esc(b).toUpperCase()}</div><div class="pdp-img-name">${esc(title)}</div></div></div></div>`;
  const thumbs=grads.map((g,i)=>`<div class="pdp-thumb${i===0?' act':''}" style="background:${g}" data-grad="${g}">${em}</div>`).join('');
  // Bullets
  const bullets=e
    ?['Premium quality, carefully selected','Handcrafted with precision','Luxury gift box included','Free delivery from €39']
    :['Qualité premium, soigneusement sélectionnée','Fabriqué avec précision','Coffret cadeau luxe inclus','Livraison offerte dès 39€'];
  const bulletsHTML=`<ul class="pdp-bullets">${bullets.map(x=>`<li><span class="pdp-check">✓</span>${x}</li>`).join('')}</ul>`;
  // Trust row
  const trustRow=`<div class="pdp-trust-row"><span class="pdp-ti">${SVG_TRUCK}<span>${e?'Free delivery':'Livraison offerte'}</span></span><span class="pdp-ti">${SVG_RETURN}<span>${e?'30-day returns':'Retours 30j'}</span></span><span class="pdp-ti">${SVG_LOCK}<span>${e?'Secure payment':'Paiement sécurisé'}</span></span></div>`;
  // Tabs (data-tab, no arrow fn in onclick)
  const descTxt=e
    ?`<p>The <strong>${esc(title)}</strong> is a standout piece from our <em>${esc(col.title)}</em> collection. Designed for those who value quality and timeless elegance, it combines refined aesthetics with superior craftsmanship.</p><p>Each piece is individually inspected before shipping. Delivered in a luxury gift box, it makes the perfect present for yourself or a loved one.</p>`
    :`<p><strong>${esc(title)}</strong> est une pièce d'exception de notre collection <em>${esc(col.title)}</em>. Conçue pour ceux qui valorisent la qualité et l'élégance intemporelle, elle unit esthétique raffinée et savoir-faire supérieur.</p><p>Chaque pièce est inspectée individuellement avant l'expédition. Livrée dans un coffret luxe, c'est le cadeau parfait.</p>`;
  const detailsTxt=e
    ?`<ul><li>Material: Premium quality, ethically sourced</li><li>Finish: Hand-polished</li><li>Packaging: Luxury gift box with ribbon</li><li>Care: Clean with soft, dry cloth</li><li>Warranty: 12 months from purchase</li><li>Origin: Artisan-crafted</li></ul>`
    :`<ul><li>Matière: Qualité premium, approvisionnement éthique</li><li>Finition: Poli à la main</li><li>Emballage: Coffret luxe avec ruban</li><li>Entretien: Nettoyer avec un chiffon doux et sec</li><li>Garantie: 12 mois à compter de l'achat</li><li>Origine: Artisanat soigné</li></ul>`;
  const rvs=[
    {n:e?'Sarah M. — London':'Sophie M. — Paris',s:'★★★★★',t:e?'"Absolutely perfect. The quality exceeded my expectations — arrived beautifully packaged. My go-to for gifts."':'"Absolument parfait. La qualité a dépassé mes attentes — arrivé magnifiquement emballé."',d:e?'2 weeks ago':'Il y a 2 semaines',vf:e?'Verified purchase':'Achat vérifié'},
    {n:e?'James K. — Manchester':'Thomas L. — Lyon',s:'★★★★★',t:e?'"Bought this as a birthday gift — the recipient was completely speechless. Fast delivery, excellent quality."':'"Acheté en cadeau anniversaire — le destinataire était sans voix. Livraison rapide, excellente qualité."',d:e?'1 month ago':'Il y a 1 mois',vf:e?'Verified purchase':'Achat vérifié'},
    {n:e?'Emma R. — Edinburgh':'Emma R. — Bordeaux',s:'★★★★★',t:e?'"Outstanding craftsmanship. Exactly as shown, arrived quickly. Five stars without hesitation."':'"Artisanat remarquable. Conforme aux photos, livraison rapide. Cinq étoiles sans hésitation."',d:e?'3 weeks ago':'Il y a 3 semaines',vf:e?'Verified purchase':'Achat vérifié'},
  ];
  const rvSummary=`<div class="tab-rv-sum"><div class="tab-rv-big">4.8</div><div><div style="color:#f59e0b;font-size:1.1rem;margin-bottom:.2rem">★★★★★</div><div style="font-size:.78rem;color:#888">${e?'Based on 47 reviews':'Basé sur 47 avis'}</div></div></div>`;
  const rvHTML=rvSummary+rvs.map(r=>`<div class="tab-review"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem"><span class="tab-rv-stars">${r.s}</span><span style="font-size:.7rem;color:#aaa">${r.d}</span></div><p class="tab-rv-text">${r.t}</p><div style="display:flex;justify-content:space-between;align-items:center;margin-top:.5rem"><p class="tab-rv-author">${r.n}</p><span style="font-size:.68rem;color:#16a34a;font-weight:600">✓ ${r.vf}</span></div></div>`).join('');
  const tabs=`<div class="pdp-tabs-wrap"><div class="pdp-tabs-nav"><button class="tab-btn act" data-tab="t1">${e?'Description':'Description'}</button><button class="tab-btn" data-tab="t2">${e?'Details':'Détails'}</button><button class="tab-btn" data-tab="t3">${e?'Reviews (47)':'Avis (47)'}</button></div><div id="t1" class="tab-content act"><h3>${e?'About this piece':'À propos de cette pièce'}</h3>${descTxt}</div><div id="t2" class="tab-content"><h3>${e?'Product Details':'Détails produit'}</h3>${detailsTxt}</div><div id="t3" class="tab-content">${rvHTML}</div></div>`;
  // Related products
  const base=col.title.split(/[\s&]/)[0];
  const relTypes=['Heritage','Classic','Elite','Artisan'];
  const relProds=relTypes.map((t,i)=>{const nm=`${base} ${t}`;return prodCard(nm,(44.9+i*15).toFixed(2),null,em,lang,'',`${col.path}/${prodSlug(nm)}/`);}).join('');
  const related=`<div style="background:#fafaf8;padding:3.5rem 0"><div class="sec"><div class="sec-h"><p class="sec-eye">${e?'You May Also Like':'Vous aimerez aussi'}</p><h2>${e?'Complete the Look':'Compléter votre sélection'}</h2></div><div class="pg4">${relProds}</div></div></div>`;
  // JS — no arrow fn in HTML attrs, use script block
  const js=`<script>document.querySelectorAll('.tab-btn').forEach(function(b){b.addEventListener('click',function(){document.querySelectorAll('.tab-btn,.tab-content').forEach(function(x){x.classList.remove('act')});this.classList.add('act');document.getElementById(this.dataset.tab).classList.add('act')})});document.querySelectorAll('.pdp-thumb').forEach(function(t){t.addEventListener('click',function(){document.querySelectorAll('.pdp-thumb').forEach(function(x){x.classList.remove('act')});this.classList.add('act');document.querySelector('.pdp-main-img').style.background=this.dataset.grad})});var q=1;function updCart(){document.getElementById('addCart').textContent='${e?'Add to Cart':'Ajouter'} — €'+(${price}*q).toFixed(2)}document.getElementById('qp').addEventListener('click',function(){if(q<10){q++;document.getElementById('qv').textContent=q;updCart()}});document.getElementById('qm').addEventListener('click',function(){if(q>1){q--;document.getElementById('qv').textContent=q;updCart()}});</script>`;
  const ld=`{"@context":"https://schema.org","@type":"Product","name":${JSON.stringify(title)},"url":${JSON.stringify(url)},"brand":{"@type":"Brand","name":${JSON.stringify(b)}},"offers":{"@type":"Offer","priceCurrency":"EUR","price":"${price}","availability":"https://schema.org/InStock"},"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.8","reviewCount":"47"}}`;
  const desc=e?`Buy ${title} — ${b}. Free delivery from €39. 30-day returns.`:`Acheter ${title} — ${b}. Livraison offerte dès 39€. Retours 30 jours.`;
  const inStock=`<span class="pdp-stock"><span class="pdp-stock-dot"></span>${e?'In stock — ships today':'En stock — expédié aujourd\'hui'}</span>`;
  const social=`<p class="pdp-social-proof">${e?'🔥 12 people bought this in the last 24h':'🔥 12 personnes ont acheté ça ces dernières 24h'}</p>`;
  const mobCart=`<div id="mob-cart-bar" class="mob-cart-bar"><div class="mob-cart-info"><span class="mob-cart-name">${esc(title)}</span><span class="mob-cart-price">€${price}</span></div><button class="mob-cart-btn" onclick="location.href='/checkout/'">${e?'Buy Now':'Acheter'}</button></div>`;
  const body=`${promoBar(niche,lang)}${navBar(b,lang)}<div class="bc"><div class="bc-i"><a href="/">${e?'Home':'Accueil'}</a> › <a href="/collections/">${e?'Collections':'Collections'}</a> › <a href="${col.path}/">${esc(col.title)}</a> › ${esc(title)}</div></div><div class="pdp-wrap"><div class="pdp-grid"><div class="pdp-gallery">${mainImg}<div class="pdp-thumbs">${thumbs}</div></div><div class="pdp-info">${inStock}<p class="pdp-eye">${esc(col.title)}</p><h1>${esc(title)}</h1><div class="pdp-rating"><span class="pdp-stars">★★★★★</span><span class="pdp-rating-cnt">4.8</span><a href="#t3" class="pdp-rating-link">(47 ${e?'reviews':'avis'})</a></div><div class="pdp-price-row"><span class="pdp-price-now">€${price}</span>${orig?`<span class="pdp-price-orig">€${orig}</span><span class="pdp-price-save">${e?'−':'−'}€${saveAmt}</span>`:''}</div>${social}${bulletsHTML}${varHTML}<div class="pdp-qty"><button id="qm">−</button><span id="qv">1</span><button id="qp">+</button></div><button class="btn-cart" id="addCart" onclick="location.href='/checkout/'">${e?`Add to Cart — €${price}`:`Ajouter au panier — €${price}`}</button><button class="btn-wish">${SVG_HEART} ${e?'Add to Wishlist':'Ajouter à ma liste'}</button>${trustRow}<div class="pdp-dlv">${SVG_TRUCK} ${dlv}</div></div></div></div>${tabs}${related}${footerSection(b,domain,lang)}${mobCart}${js}`;
  return layout(`${esc(title)} | ${b}`,desc,url,ld,body,p,pd,ac,lang);
}

async function buildAndStore(bp,niche,domain,lang,env){
  const sl=slug(domain),pre=`site:${sl}:`;
  const [p,pd,ac]=NS[niche]||['#2563eb','#1d4ed8','#eff6ff'];
  const cols=bp.allCollections||bp.mvpSelection||[];
  const files={
    '/':                  genHome(bp,niche,domain,lang),
    '/collections/':      genCollIndex(bp,niche,domain,lang),
    '/mentions-legales/': genLegal(domain,'mentions',lang),
    '/cgv/':              genLegal(domain,'cgv',lang),
    '/confidentialite/':  genLegal(domain,'confidentialite',lang),
    '/sitemap.xml':       genSitemap(bp,domain),
    '/robots.txt':        `User-agent: *\nAllow: /\nSitemap: https://${domain}/sitemap.xml\n`,
    '/checkout/':         genCheckout(bp,niche,domain,lang),
    '/blog/':             genBlog(bp,niche,domain,lang),
  };
  const topics=BLOG_TOPICS[niche]||BLOG_TOPICS['default'];
  for(const t of topics) files[`/blog/${t.slug}/`]=genBlogPost(t,niche,domain,lang);
  for(const c of cols){
    files[c.path+'/']=genColl(c,bp,niche,domain,lang);
    const base=c.title.split(/[\s&]/)[0];
    const types=['Signature','Heritage','Classic','Elite','Artisan','Premium','Essential','Royal'];
    const np=Math.min(c.products||4,4);
    for(let i=0;i<np;i++){
      const nm=`${base} ${types[i%types.length]}`;
      const pr=(29.9+i*15).toFixed(2);
      const orig=(i%3===0&&i>0)?(44.9+i*15).toFixed(2):null;
      files[`${c.path}/${prodSlug(nm)}/`]=genProduct({title:nm,price:pr,orig,badge:orig?'SALE':''},c,niche,domain,lang);
    }
  }
  const ct=path=>path.endsWith('.xml')?'application/xml':path.endsWith('.txt')?'text/plain':'text/html;charset=UTF-8';
  const meta=JSON.stringify({domain,niche,lang,slug:sl,pages:Object.keys(files).length,deployedAt:new Date().toISOString(),storage:'r2'});
  await Promise.all([
    ...Object.entries(files).map(([path,html])=>env.R2.put(`${sl}${path}`,html,{httpMetadata:{contentType:ct(path)}})),
    env.R2.put(`${sl}/__meta.json`,meta,{httpMetadata:{contentType:'application/json'}}),
  ]);
  // KV meta: best-effort (may fail if daily limit hit)
  await env.KV.put(pre+'__meta',meta,{expirationTtl:86400*365}).catch(()=>{});
  return{slug:sl,pages:Object.keys(files).length,url:`https://v35-site-server.ernestpedanou.workers.dev/${sl}/`,niche,lang,domain};
}

export default{
  async fetch(request,env){
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:CORS});
    if(request.method!=='POST') return err('POST only',405);
    let body={};
    try{body=await request.json();}catch{return err('Invalid JSON');}

    // ── /render — single-page HTML generation (no storage) ─────────────────
    const url=new URL(request.url);
    if(url.pathname==='/render'){
      const{type,product,collection,niche='Jewellery',domain='shop.com',lang='fr'}=body;
      const[p,pd,ac]=NS[niche]||['#2563eb','#1d4ed8','#eff6ff'];
      if(type==='product'){
        if(!product||!collection||!domain) return err('product, collection, domain required');
        const html=genProduct(product,collection,niche,domain,lang);
        return new Response(html,{headers:{...CORS,'Content-Type':'text/html;charset=UTF-8','Access-Control-Allow-Origin':'*'}});
      }
      if(type==='blog-post'){
        if(!product?.slug) return err('topic with slug required');
        const html=genBlogPost(product,niche,domain,lang);
        return new Response(html,{headers:{...CORS,'Content-Type':'text/html;charset=UTF-8','Access-Control-Allow-Origin':'*'}});
      }
      if(type==='collection'){
        if(!collection||!domain) return err('collection, domain required');
        const bp=body.blueprint||{allCollections:[collection]};
        const html=genColl(collection,bp,niche,domain,lang);
        return new Response(html,{headers:{...CORS,'Content-Type':'text/html;charset=UTF-8','Access-Control-Allow-Origin':'*'}});
      }
      return err('type must be product | blog-post | collection');
    }

    const{blueprint,niche,domain,lang='fr'}=body;
    if(!blueprint||!domain) return err('blueprint + domain required');
    if(!blueprint.allCollections?.length&&!blueprint.mvpSelection?.length) return err('blueprint empty');
    try{
      const result=await buildAndStore(blueprint,niche||'Mode Femme',domain,lang,env);
      return ok({success:true,...result});
    }catch(e){return err(e.message,500);}
  }
};
