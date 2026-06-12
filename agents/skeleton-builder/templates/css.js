export function mainCss(p) {
  return `/* === Variables === */
:root {
  --primary:       ${p.primary};
  --primary-dark:  ${p.primary_dark};
  --primary-light: ${p.primary_light};
  --secondary:     ${p.secondary};
  --accent:        ${p.accent};
  --surface:       ${p.surface};
  --bg:            ${p.bg};
  --text:          ${p.text};
  --text-muted:    ${p.text_muted};
  --border:        ${p.border};
  --grad-from:     ${p.gradient_from};
  --grad-to:       ${p.gradient_to};
  --hero-text:     ${p.hero_text};
  --radius:        .5rem;
  --shadow-sm:     0 1px 3px rgba(0,0,0,.08);
  --shadow-md:     0 4px 16px rgba(0,0,0,.12);
  --shadow-lg:     0 8px 32px rgba(0,0,0,.18);
  --transition:    .25s cubic-bezier(.4,0,.2,1);
  --max-w:         1240px;
  --font:          'Inter', system-ui, -apple-system, sans-serif;
}

/* === Reset === */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-size:16px;scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{font-family:var(--font);color:var(--text);background:var(--bg);line-height:1.6;min-height:100vh;display:flex;flex-direction:column}
img{max-width:100%;height:auto;display:block}
a{color:inherit;text-decoration:none}
button{cursor:pointer;border:none;background:none;font:inherit}
ul,ol{list-style:none}
main{flex:1}

/* === Typography === */
h1{font-size:clamp(1.8rem,5vw,3.2rem);font-weight:800;line-height:1.15;letter-spacing:-.03em}
h2{font-size:clamp(1.4rem,3vw,2.2rem);font-weight:700;line-height:1.25;letter-spacing:-.02em}
h3{font-size:clamp(1rem,2vw,1.4rem);font-weight:600;line-height:1.35}
p{line-height:1.75}

/* === Utility === */
.container{width:100%;max-width:var(--max-w);margin-inline:auto;padding-inline:1.25rem}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
.btn{display:inline-flex;align-items:center;gap:.5rem;padding:.75rem 1.75rem;border-radius:var(--radius);font-weight:600;font-size:.95rem;transition:all var(--transition);cursor:pointer}
.btn-primary{background:var(--primary);color:#fff}
.btn-primary:hover{background:var(--primary-dark);transform:translateY(-1px);box-shadow:var(--shadow-md)}
.btn-outline{border:2px solid var(--primary);color:var(--primary)}
.btn-outline:hover{background:var(--primary);color:#fff}
.btn-ghost{border:2px solid rgba(255,255,255,.6);color:#fff}
.btn-ghost:hover{background:rgba(255,255,255,.15)}
.badge{display:inline-block;padding:.2rem .7rem;border-radius:2rem;font-size:.75rem;font-weight:600;background:var(--primary-light);color:var(--primary-dark)}
.tag{display:inline-block;padding:.15rem .6rem;border-radius:.25rem;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;background:var(--accent);color:#fff}

/* === Loader === */
.page-loader{position:fixed;inset:0;background:#fff;z-index:9999;display:flex;align-items:center;justify-content:center;transition:opacity .4s}
.page-loader.hide{opacity:0;pointer-events:none}
.loader-ring{width:48px;height:48px;border:4px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* === Header === */
.site-header{position:sticky;top:0;z-index:100;background:#fff;border-bottom:1px solid var(--border);box-shadow:var(--shadow-sm)}
.header-top{display:flex;align-items:center;justify-content:space-between;padding:.9rem 0;gap:1rem}
.logo{display:flex;align-items:center;gap:.5rem;font-weight:800;font-size:1.25rem;color:var(--primary);white-space:nowrap}
.logo svg,.logo-icon{width:36px;height:36px;background:linear-gradient(135deg,var(--grad-from),var(--grad-to));border-radius:var(--radius);flex-shrink:0}
.header-search{flex:1;max-width:440px;position:relative}
.header-search input{width:100%;padding:.6rem 1rem .6rem 2.75rem;border:1.5px solid var(--border);border-radius:2rem;font-size:.9rem;background:var(--surface);transition:border-color var(--transition)}
.header-search input:focus{outline:none;border-color:var(--primary)}
.header-search .search-icon{position:absolute;left:.9rem;top:50%;transform:translateY(-50%);color:var(--text-muted);width:18px;height:18px}
.header-actions{display:flex;align-items:center;gap:.5rem}
.icon-btn{width:42px;height:42px;border-radius:var(--radius);display:flex;align-items:center;justify-content:center;color:var(--text);transition:all var(--transition);position:relative}
.icon-btn:hover{background:var(--surface);color:var(--primary)}
.icon-btn .badge-count{position:absolute;top:4px;right:4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:#fff;font-size:.65rem;font-weight:700;display:flex;align-items:center;justify-content:center}
.site-nav{border-top:1px solid var(--border)}
.nav-list{display:flex;align-items:center;gap:0;padding:.15rem 0}
.nav-list a{display:block;padding:.65rem 1rem;font-weight:500;font-size:.9rem;color:var(--text);border-radius:var(--radius);transition:all var(--transition);white-space:nowrap}
.nav-list a:hover,.nav-list a.active{color:var(--primary);background:var(--primary-light)}
.hamburger{display:none;flex-direction:column;gap:5px;padding:.5rem;cursor:pointer}
.hamburger span{display:block;width:22px;height:2px;background:var(--text);border-radius:2px;transition:all var(--transition)}

/* === Hero === */
.hero{position:relative;min-height:88vh;display:flex;align-items:center;background:linear-gradient(135deg,var(--grad-from) 0%,var(--grad-to) 100%);overflow:hidden}
.hero-overlay{position:absolute;inset:0;background:rgba(0,0,0,.25)}
.hero-pattern{position:absolute;inset:0;background-image:radial-gradient(circle at 20% 50%,rgba(255,255,255,.08) 0%,transparent 50%),radial-gradient(circle at 80% 20%,rgba(255,255,255,.06) 0%,transparent 40%)}
.hero-content{position:relative;z-index:1;text-align:center;max-width:780px;margin:0 auto;padding:4rem 1.25rem}
.hero-eyebrow{display:inline-block;padding:.35rem 1rem;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);border-radius:2rem;color:rgba(255,255,255,.9);font-size:.85rem;font-weight:600;margin-bottom:1.5rem;backdrop-filter:blur(8px)}
.hero h1{color:var(--hero-text);margin-bottom:1.25rem;text-shadow:0 2px 20px rgba(0,0,0,.2)}
.hero-sub{color:rgba(255,255,255,.85);font-size:1.15rem;max-width:560px;margin:0 auto 2.5rem}
.hero-ctas{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap}
.hero-scroll{position:absolute;bottom:2rem;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.6);display:flex;flex-direction:column;align-items:center;gap:.5rem;font-size:.8rem;animation:bounce 2s ease-in-out infinite}
@keyframes bounce{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(6px)}}

/* === Section headers === */
.section-header{text-align:center;margin-bottom:3rem}
.section-header p{color:var(--text-muted);font-size:1.05rem;max-width:540px;margin:.75rem auto 0}
.section-sep{width:60px;height:4px;background:linear-gradient(90deg,var(--primary),var(--accent));border-radius:2px;margin:1rem auto 0}

/* === Collections Grid === */
.collections{padding:5rem 0;background:var(--bg)}
.collections-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1.5rem}
.coll-card{position:relative;border-radius:calc(var(--radius)*2);overflow:hidden;box-shadow:var(--shadow-sm);transition:all var(--transition);background:var(--surface)}
.coll-card:hover{transform:translateY(-4px);box-shadow:var(--shadow-lg)}
.coll-thumb{aspect-ratio:4/3;overflow:hidden;background:linear-gradient(135deg,var(--primary-light),var(--surface))}
.coll-thumb img{width:100%;height:100%;object-fit:cover;transition:transform .5s ease}
.coll-card:hover .coll-thumb img{transform:scale(1.06)}
.coll-thumb-placeholder{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:3.5rem}
.coll-info{padding:1.25rem}
.coll-info h3{margin-bottom:.35rem;font-size:1.05rem}
.coll-meta{color:var(--text-muted);font-size:.85rem;margin-bottom:1rem}
.coll-link{color:var(--primary);font-weight:600;font-size:.9rem;display:flex;align-items:center;gap:.3rem}
.coll-link::after{content:'→';transition:transform var(--transition)}
.coll-card:hover .coll-link::after{transform:translateX(4px)}

/* === Products === */
.products{padding:4rem 0}
.products-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1.25rem}
.prod-card{border-radius:calc(var(--radius)*2);overflow:hidden;background:#fff;box-shadow:var(--shadow-sm);transition:all var(--transition)}
.prod-card:hover{transform:translateY(-3px);box-shadow:var(--shadow-md)}
.prod-thumb{aspect-ratio:1;overflow:hidden;background:var(--surface);position:relative}
.prod-thumb img{width:100%;height:100%;object-fit:cover;transition:transform .4s ease}
.prod-card:hover .prod-thumb img{transform:scale(1.04)}
.prod-badge{position:absolute;top:.65rem;left:.65rem}
.prod-info{padding:1rem}
.prod-name{font-size:.95rem;font-weight:600;margin-bottom:.3rem;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.prod-brand{font-size:.8rem;color:var(--text-muted);margin-bottom:.5rem}
.prod-price{font-size:1.05rem;font-weight:700;color:var(--primary)}
.prod-actions{display:flex;gap:.5rem;margin-top:.85rem}
.prod-actions .btn{flex:1;padding:.55rem 1rem;font-size:.85rem}

/* === USP Bar === */
.usp-bar{padding:3.5rem 0;background:var(--surface);border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
.usp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:2rem;text-align:center}
.usp-item .usp-icon{width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,var(--primary-light),var(--border));display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;font-size:1.75rem}
.usp-item h4{font-size:1rem;font-weight:700;margin-bottom:.35rem}
.usp-item p{font-size:.88rem;color:var(--text-muted)}

/* === Blog === */
.blog-section{padding:5rem 0;background:var(--bg)}
.blog-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1.75rem;margin-top:3rem}
.blog-card{background:#fff;border-radius:calc(var(--radius)*2);overflow:hidden;box-shadow:var(--shadow-sm);transition:all var(--transition);display:flex;flex-direction:column}
.blog-card:hover{transform:translateY(-4px);box-shadow:var(--shadow-md)}
.blog-thumb{aspect-ratio:16/9;overflow:hidden;background:linear-gradient(135deg,var(--primary-light),var(--surface))}
.blog-thumb img{width:100%;height:100%;object-fit:cover;transition:transform .5s ease}
.blog-card:hover .blog-thumb img{transform:scale(1.05)}
.blog-body{padding:1.5rem;flex:1;display:flex;flex-direction:column}
.blog-tag{margin-bottom:.75rem}
.blog-body h3{margin-bottom:.6rem;font-size:1.05rem;line-height:1.4}
.blog-body p{color:var(--text-muted);font-size:.9rem;flex:1;margin-bottom:1rem;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.blog-meta{display:flex;align-items:center;gap.5rem;font-size:.8rem;color:var(--text-muted)}
.blog-meta time{margin-left:auto}
.blog-read-more{color:var(--primary);font-weight:600;font-size:.9rem;margin-top:auto;align-self:flex-start}

/* === Newsletter === */
.newsletter{padding:4.5rem 0;background:linear-gradient(135deg,var(--grad-from),var(--grad-to));text-align:center;position:relative;overflow:hidden}
.newsletter::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 70% 50%,rgba(255,255,255,.08),transparent 60%)}
.newsletter h2,.newsletter p{color:#fff;position:relative}
.newsletter p{opacity:.85;max-width:480px;margin:.75rem auto 2rem}
.newsletter-form{display:flex;gap:.75rem;max-width:480px;margin:0 auto;position:relative}
.newsletter-form input{flex:1;padding:.8rem 1.25rem;border-radius:var(--radius);border:2px solid rgba(255,255,255,.3);background:rgba(255,255,255,.12);color:#fff;font-size:.95rem;backdrop-filter:blur(8px)}
.newsletter-form input::placeholder{color:rgba(255,255,255,.6)}
.newsletter-form input:focus{outline:none;border-color:rgba(255,255,255,.7)}
.newsletter-success{color:#fff;font-weight:600;display:none}

/* === Footer === */
.site-footer{background:var(--text);color:rgba(255,255,255,.75);padding:4rem 0 0}
.footer-grid{display:grid;grid-template-columns:1.4fr repeat(3,1fr);gap:3rem;margin-bottom:3rem}
.footer-brand .logo{color:#fff;margin-bottom:1rem}
.footer-brand p{font-size:.88rem;line-height:1.75;max-width:280px;margin-bottom:1.5rem}
.footer-col h5{font-size:.85rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#fff;margin-bottom:1.25rem}
.footer-col ul li+li{margin-top:.6rem}
.footer-col ul a{font-size:.88rem;transition:color var(--transition)}
.footer-col ul a:hover{color:#fff}
.social-links{display:flex;gap:.75rem;margin-top:.5rem}
.social-links a{width:38px;height:38px;border-radius:var(--radius);background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;transition:all var(--transition)}
.social-links a:hover{background:var(--primary)}
.footer-bottom{border-top:1px solid rgba(255,255,255,.1);padding:1.5rem 0;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;font-size:.82rem}
.payment-icons{display:flex;gap:.5rem;align-items:center}
.payment-icons img{height:26px;opacity:.7}

/* === Breadcrumb === */
.breadcrumb{padding:1rem 0;font-size:.85rem;color:var(--text-muted)}
.breadcrumb a{color:var(--text-muted);transition:color var(--transition)}
.breadcrumb a:hover{color:var(--primary)}
.breadcrumb span+span::before{content:'›';margin:0 .5rem}
.breadcrumb span:last-child{color:var(--text)}

/* === Collection detail === */
.coll-hero{background:linear-gradient(135deg,var(--primary-light),var(--surface));padding:3.5rem 0;margin-bottom:3rem;border-bottom:1px solid var(--border)}
.coll-hero h1{margin-bottom:.75rem}
.coll-hero p{color:var(--text-muted);max-width:600px;font-size:1.05rem}
.coll-hero-meta{display:flex;align-items:center;gap:1.5rem;margin-top:1.5rem;flex-wrap:wrap}
.filter-bar{display:flex;align-items:center;gap:1rem;margin-bottom:2rem;flex-wrap:wrap}
.filter-bar select{padding:.55rem 1rem;border:1.5px solid var(--border);border-radius:var(--radius);font-size:.9rem;color:var(--text);background:var(--surface)}
.results-count{color:var(--text-muted);font-size:.9rem;margin-left:auto}

/* === Blog article === */
.article-hero{padding:4rem 0 3rem;background:var(--surface);border-bottom:1px solid var(--border)}
.article-header{max-width:760px;margin:0 auto}
.article-header .tag{margin-bottom:1rem}
.article-header h1{margin-bottom:1rem}
.article-meta{display:flex;align-items:center;gap:1rem;color:var(--text-muted);font-size:.88rem}
.article-body{max-width:760px;margin:3rem auto;padding:0 1.25rem}
.article-body h2{margin:2.5rem 0 1rem}
.article-body h3{margin:2rem 0 .75rem}
.article-body p{margin-bottom:1.5rem}
.article-body img{border-radius:calc(var(--radius)*2);margin:2rem 0;box-shadow:var(--shadow-md)}
.article-body ul,.article-body ol{margin:0 0 1.5rem 1.5rem}
.article-body li{margin-bottom:.5rem}
.article-body blockquote{border-left:4px solid var(--primary);padding-left:1.5rem;margin:2rem 0;color:var(--text-muted);font-style:italic}

/* === Pagination === */
.pagination{display:flex;justify-content:center;align-items:center;gap:.5rem;margin:3rem 0}
.page-btn{width:42px;height:42px;border-radius:var(--radius);border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:.9rem;transition:all var(--transition)}
.page-btn:hover,.page-btn.active{background:var(--primary);color:#fff;border-color:var(--primary)}

/* === Toast === */
.toast{position:fixed;bottom:1.5rem;right:1.5rem;padding:.85rem 1.5rem;background:#1e293b;color:#fff;border-radius:var(--radius);box-shadow:var(--shadow-lg);transform:translateY(100px);opacity:0;transition:all .35s;z-index:999;font-size:.9rem;max-width:320px}
.toast.show{transform:translateY(0);opacity:1}
.toast.success{background:var(--primary)}
.toast.error{background:#ef4444}

/* === Cookie Banner === */
.cookie-banner{position:fixed;bottom:0;left:0;right:0;background:var(--text);color:#fff;padding:1.25rem;z-index:500;display:none;align-items:center;gap:1.5rem;flex-wrap:wrap}
.cookie-banner p{flex:1;font-size:.88rem;opacity:.85;min-width:250px}
.cookie-banner a{text-decoration:underline;opacity:.7}
.cookie-banner .btn{padding:.55rem 1.25rem;font-size:.85rem;flex-shrink:0}

/* === Skeleton loading === */
.skel{background:linear-gradient(90deg,var(--border) 25%,var(--surface) 50%,var(--border) 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;border-radius:var(--radius)}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}

/* === Responsive === */
@media(max-width:768px){
  .header-search{display:none}
  .hamburger{display:flex}
  .nav-list{display:none;flex-direction:column;position:absolute;top:100%;left:0;right:0;background:#fff;border-bottom:1px solid var(--border);padding:.5rem}
  .nav-list.open{display:flex}
  .footer-grid{grid-template-columns:1fr 1fr;gap:2rem}
  .hero{min-height:72vh}
  .collections-grid{grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}
  .newsletter-form{flex-direction:column}
}
@media(max-width:480px){
  .footer-grid{grid-template-columns:1fr}
  .hero-ctas{flex-direction:column;align-items:center}
  .footer-bottom{flex-direction:column;text-align:center}
  .usp-grid{grid-template-columns:1fr 1fr}
}
`;
}
