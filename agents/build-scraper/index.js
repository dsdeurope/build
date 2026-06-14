// V35 Build Scraper — Universal CMS scraper with key rotation + safe browsing
// Handles: Shopify, WooCommerce, PrestaShop, Wix, Webflow, Squarespace, BigCommerce,
//          Magento, OpenCart, Drupal Commerce, Jimdo, Weebly, static HTML, custom

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Content-Type': 'application/json',
};

// ── User-Agent pool (rotate to avoid fingerprinting) ─────────────────────────
const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.60 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.107 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.60 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.60 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.60 Safari/537.36 Edg/124.0.0.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.94 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.94 Safari/537.36',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.60 Safari/537.36',
];

// ── Realistic headers rotation ───────────────────────────────────────────────
const ACCEPT_LANGS = ['fr-FR,fr;q=0.9,en;q=0.8','fr,en-US;q=0.9,en;q=0.8','fr-FR,fr;q=0.9','en-US,en;q=0.9,fr;q=0.8','de-DE,de;q=0.9,fr;q=0.8'];
const ACCEPT_ENCODINGS = ['gzip, deflate, br','gzip, deflate, br, zstd'];
const REFERERS = ['https://www.google.fr/','https://www.google.com/','https://duckduckgo.com/','https://www.bing.com/',''];

function pickUA() { return UA_POOL[Math.floor(Math.random()*UA_POOL.length)]; }
function pickLang() { return ACCEPT_LANGS[Math.floor(Math.random()*ACCEPT_LANGS.length)]; }
function pickReferer() { return REFERERS[Math.floor(Math.random()*REFERERS.length)]; }

function safeHeaders(extraReferer='') {
  const ref = extraReferer || pickReferer();
  const h = {
    'User-Agent': pickUA(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': pickLang(),
    'Accept-Encoding': ACCEPT_ENCODINGS[Math.floor(Math.random()*ACCEPT_ENCODINGS.length)],
    'Cache-Control': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': ref ? 'cross-site' : 'none',
    'Upgrade-Insecure-Requests': '1',
  };
  if (ref) h['Referer'] = ref;
  return h;
}

// ── Rate limiter (KV-based, per domain) ──────────────────────────────────────
async function checkRateLimit(domain, env) {
  const key = `rl:${domain}`;
  const last = parseInt(await env.KV.get(key)||'0');
  const now = Date.now();
  if (now - last < 3000) return false; // 3s minimum between requests per domain
  await env.KV.put(key, String(now), { expirationTtl: 60 });
  return true;
}

// ── Key rotation pool ────────────────────────────────────────────────────────
function getKeys(secret) {
  if (!secret) return [];
  return secret.split(',').map(k=>k.trim()).filter(Boolean);
}

function pickKey(keys) {
  if (!keys?.length) return null;
  return keys[Math.floor(Math.random()*keys.length)];
}

// ── Proxy fetchers ───────────────────────────────────────────────────────────
async function fetchScrapingBee(url, keys) {
  const key = pickKey(keys);
  if (!key) throw new Error('no_key');
  const apiUrl = `https://app.scrapingbee.com/api/v1/?api_key=${key}&url=${encodeURIComponent(url)}&render_js=false&premium_proxy=false&country_code=fr`;
  const r = await fetch(apiUrl, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`sb:${r.status}`);
  return r.text();
}

async function fetchZenRows(url, keys) {
  const key = pickKey(keys);
  if (!key) throw new Error('no_key');
  const apiUrl = `https://api.zenrows.com/v1/?apikey=${key}&url=${encodeURIComponent(url)}&js_render=false&premium_proxy=false`;
  const r = await fetch(apiUrl, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`zr:${r.status}`);
  return r.text();
}

async function fetchWayback(domain) {
  const cdx = await fetch(`https://web.archive.org/cdx/search/cdx?url=${domain}&output=json&limit=1&fl=timestamp&filter=statuscode:200&from=20240101&to=20250601`, { signal: AbortSignal.timeout(8000) });
  const j = await cdx.json();
  if (j.length < 2) throw new Error('no_snapshot');
  const ts = j[1][0];
  const wb = await fetch(`https://web.archive.org/web/${ts}if_/https://${domain}`, { headers: safeHeaders(), signal: AbortSignal.timeout(15000) });
  if (!wb.ok) throw new Error(`wb:${wb.status}`);
  return wb.text();
}

// ── CMS Detection ────────────────────────────────────────────────────────────
function detectCMS(html, headers = {}) {
  const h = html.toLowerCase();
  const sig = {
    shopify:      ['/cdn.shopify.com/', 'shopify.com/s/files', 'cdn.shopifycdn.com', '"shopify"', 'myshopify.com', '/collections.json', 'shopify.loadFeatures'],
    woocommerce:  ['woocommerce', '/wp-content/plugins/woo', 'wc-cart', 'add_to_cart_url', 'woocommerce-page', 'wc_add_to_cart'],
    prestashop:   ['prestashop', '/modules/blockcart/', '/themes/classic/', 'prestashop.com', 'addToCart', '/fr/panier', 'PrestaShop'],
    wix:          ['wix.com', 'wixsite.com', 'wix-code', '_wix_', 'X-Wix-', 'wix-image'],
    webflow:      ['webflow.com', 'webflow.io', '.webflow.', 'wf-form', 'w-webflow'],
    squarespace:  ['squarespace.com', 'static.squarespace.com', 'squarespace-cdn', 'squarespacecdn'],
    bigcommerce:  ['bigcommerce.com', 'cdn.bigcommerce.com', 'bc-sf-filter', 'bigcommerce'],
    magento:      ['magento', '/pub/static/', 'mage/cookies', 'X-Magento', 'MAGE_', '/catalog/product/'],
    opencart:     ['opencart', '/catalog/view/theme/', 'route=product/', 'route=common/'],
    jimdo:        ['jimdo.com', 'jimdofree.com', 'jimdo-website'],
    weebly:       ['weebly.com', 'weeblycloud.com', 'weebly-'],
    godaddy:      ['godaddy.com', 'securecheckout.godaddy.com'],
    drupal:       ['drupal', '/sites/default/files/', 'drupal.org'],
    joomla:       ['joomla', '/components/com_', 'Joomla!'],
    custom:       [],
  };
  for (const [cms, patterns] of Object.entries(sig)) {
    if (patterns.some(p => h.includes(p.toLowerCase()))) return cms;
  }
  return 'custom';
}

// ── Universal collection/category extractor ──────────────────────────────────
const COL_RX = [
  /\/(collections?|categorie(?:-produit)?|product-category|categories?|shop|boutique|magasin|rayon|rayons|departement|departments?)\//gi,
  /\/(c|cat|catalog|catalogue|category)\//gi,
  /\/([a-z-]+)\/products?\b/gi,
];

function extractCollections(html, cms, domain) {
  if (cms === 'shopify') return null; // handled via JSON API

  const links = new Map();
  const rx = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]{2,80})<\/a>/gi;
  let m;
  while ((m = rx.exec(html)) !== null) {
    const [, href, text] = m;
    if (!href.startsWith('http') && !href.startsWith('/')) continue;
    if (COL_RX.some(r => { r.lastIndex=0; return r.test(href); })) {
      const path = href.startsWith('http') ? new URL(href).pathname : href;
      const key = path.replace(/\/+$/,'').toLowerCase();
      if (!links.has(key) && path.split('/').length <= 6) {
        links.set(key, { title: text.trim(), path: key, handle: key.split('/').pop(), products: null });
      }
    }
  }
  return [...links.values()].slice(0, 150);
}

// ── Shopify full scraper ─────────────────────────────────────────────────────
async function scrapeShopify(domain) {
  const ua = pickUA();
  const headers = { 'User-Agent': ua, 'Accept': 'application/json' };
  const r = await fetch(`https://${domain}/collections.json?limit=250`, { headers, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`shopify_api:${r.status}`);
  const j = await r.json();
  if (!j.collections?.length) throw new Error('no_collections');
  const cols = j.collections.slice(0, 120);
  const withCounts = await Promise.all(cols.map(async c => {
    try {
      const cr = await fetch(`https://${domain}/collections/${c.handle}/products.json?limit=250&fields=id`, { headers, signal: AbortSignal.timeout(8000) });
      const cj = await cr.json();
      return { title: c.title, handle: c.handle, path: `/collections/${c.handle}`, url: `https://${domain}/collections/${c.handle}`, products: cj.products?.length ?? null, image: c.image?.src || null };
    } catch { return { title: c.title, handle: c.handle, path: `/collections/${c.handle}`, products: null }; }
  }));
  return { platform: 'shopify', collections: withCounts, source: 'api' };
}

// ── WooCommerce scraper ──────────────────────────────────────────────────────
async function scrapeWooCommerce(domain, html) {
  const cols = extractCollections(html, 'woocommerce', domain) || [];
  // Try WC REST API (public endpoint)
  try {
    const r = await fetch(`https://${domain}/wp-json/wc/v3/products/categories?per_page=100`, {
      headers: { 'User-Agent': pickUA() }, signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const cats = await r.json();
      if (Array.isArray(cats) && cats.length) {
        return { platform: 'woocommerce', collections: cats.map(c=>({title:c.name,handle:c.slug,path:`/product-category/${c.slug}`,products:c.count})), source: 'api' };
      }
    }
  } catch {}
  return { platform: 'woocommerce', collections: cols, source: 'html' };
}

// ── PrestaShop scraper ───────────────────────────────────────────────────────
async function scrapePrestaShop(domain, html) {
  const cols = extractCollections(html, 'prestashop', domain) || [];
  // Try PS web service
  try {
    const r = await fetch(`https://${domain}/api/categories?output_format=JSON&limit=100`, {
      headers: { 'User-Agent': pickUA() }, signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const j = await r.json();
      const cats = j.categories || [];
      if (cats.length) return { platform: 'prestashop', collections: cats.map(c=>({title:c.name||String(c.id),handle:String(c.id),path:`/fr/${c.link_rewrite||c.id}`,products:null})), source: 'api' };
    }
  } catch {}
  return { platform: 'prestashop', collections: cols, source: 'html' };
}

// ── Generic HTML scraper ─────────────────────────────────────────────────────
function scrapeGeneric(html, cms, domain) {
  return { platform: cms, collections: extractCollections(html, cms, domain) || [], source: 'html' };
}

// ── Main fetch HTML pipeline ─────────────────────────────────────────────────
async function fetchHTML(domain, env) {
  let html = '', error = null, method = 'direct';

  // 1. Direct fetch
  try {
    const r = await fetch(`https://${domain}`, { headers: safeHeaders(`https://www.google.fr/search?q=${domain}`), signal: AbortSignal.timeout(14000) });
    if (r.ok) { html = await r.text(); method = 'direct'; }
    else error = `http:${r.status}`;
  } catch(e) { error = e.message; }

  const isCF = html && /cf-browser-verification|just a moment|__cf_chl|challengejs/i.test(html);
  const isEmpty = !html || html.length < 500;

  // 2. ScrapingBee fallback (if CF protected or empty)
  if ((isCF || isEmpty) && env.SCRAPINGBEE_KEYS) {
    try {
      html = await fetchScrapingBee(`https://${domain}`, getKeys(env.SCRAPINGBEE_KEYS));
      method = 'scrapingbee'; error = null;
    } catch(e) { error = `sb:${e.message}`; }
  }

  // 3. ZenRows fallback
  if ((isCF || isEmpty) && error && env.ZENROWS_KEYS) {
    try {
      html = await fetchZenRows(`https://${domain}`, getKeys(env.ZENROWS_KEYS));
      method = 'zenrows'; error = null;
    } catch(e) { error = `zr:${e.message}`; }
  }

  // 4. Wayback Machine fallback (always free, no key needed)
  if (!html || html.length < 500) {
    try {
      html = await fetchWayback(domain);
      method = 'wayback'; error = null;
    } catch(e) { error = `wb:${e.message}`; }
  }

  return { html, method, error };
}

// ── Master scrape function ───────────────────────────────────────────────────
async function masterScrape(domain, env) {
  domain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();

  // Cache (1h)
  const cacheKey = `scrape:${domain}`;
  const cached = await env.KV.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Rate limit
  const allowed = await checkRateLimit(domain, env);
  if (!allowed) return { domain, error: 'rate_limited', collections: [] };

  // 1. Try Shopify API first (fastest + most complete)
  try {
    const result = await scrapeShopify(domain);
    const out = { domain, ...result, ts: Date.now() };
    await env.KV.put(cacheKey, JSON.stringify(out), { expirationTtl: 3600 });
    return out;
  } catch {}

  // 2. Fetch HTML
  const { html, method, error } = await fetchHTML(domain, env);
  if (!html || html.length < 200) {
    return { domain, error: error || 'empty_response', collections: [], platform: 'unknown', fetchMethod: method };
  }

  const cms = detectCMS(html);
  let result;

  switch (cms) {
    case 'woocommerce':  result = await scrapeWooCommerce(domain, html); break;
    case 'prestashop':  result = await scrapePrestaShop(domain, html); break;
    default:            result = scrapeGeneric(html, cms, domain);
  }

  // Extract meta
  const g = rx => rx.exec(html)?.[1]?.replace(/<[^>]+>/g,'').trim()||'';
  const meta = {
    title: g(/<title[^>]*>([^<]+)/i),
    desc:  g(/meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})/i),
    h1:    g(/<h1[^>]*>([^<]+)/i),
  };

  const out = {
    domain, ...result, meta, fetchMethod: method,
    collectionsCount: result.collections?.length || 0,
    niches: detectNiches(meta.title+' '+meta.desc+' '+meta.h1),
    ts: Date.now(),
  };
  await env.KV.put(cacheKey, JSON.stringify(out), { expirationTtl: 3600 });
  return out;
}

// ── Niche detection (inline, no external call) ───────────────────────────────
const NICHE_KW = {
  lingerie:['lingerie','dessous','soutien','culotte','bra','swimwear'],
  bijoux:['bijou','bague','collier','bracelet','pendentif','montre','joaillerie'],
  beaute:['beaute','soin','cosmetique','parfum','serum','maquillage','skincare'],
  mode:['robe','femme','mode','fashion','vetement','jupe','top','manteau'],
  sport:['sport','trail','bike','velo','fitness','running','sportswear','outdoor'],
  maison:['deco','decoration','maison','meuble','canape','luminaire','lampe'],
  electronique:['tech','electronique','gaming','smartphone','informatique','geek'],
  animaux:['animal','chien','chat','pet','veterinaire'],
  cuisine:['food','epicerie','cafe','bio','gourmet','chocolat','vin','gastronomie'],
  auto:['auto','moto','voiture','pieces','tuning'],
  luxe:['luxe','luxury','premium','haute couture','prestige'],
  jardinage:['jardin','plante','fleur','semence','potager','jardinage'],
  sante:['sante','pharmacie','parapharmacie','vitamines','complement'],
  enfants:['enfant','bebe','kids','jouet','naissance'],
  voyages:['voyage','travel','camping','trek','aventure'],
};
function detectNiches(text) {
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const scores = {};
  for (const [n,kws] of Object.entries(NICHE_KW)) {
    const s = kws.reduce((acc,k)=>acc+(t.split(k).length-1),0);
    if (s>0) scores[n]=s;
  }
  return Object.entries(scores).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([n])=>n);
}

// ── Footprints dorks database ────────────────────────────────────────────────
// Stored in KV as plt:footprint_dorks — seeded on first GET /api/dorks
const DORKS = {
  shopify: [
    'intitle:"collections" inurl:"/collections" -site:myshopify.com',
    'inurl:"/collections" inurl:"/products" -site:shopify.com',
    '"powered by shopify"',
    'inurl:".myshopify.com"',
    'intitle:"collections" "Ajouter au panier" site:.fr',
    'intitle:"collections" "Add to cart" site:.com',
    '"cdn.shopify.com" intitle:"boutique"',
    'inurl:"/products/" inurl:"/collections/" site:.fr',
    'intext:"cdn.shopify.com/s/files" site:.fr',
    '"Powered by Shopify" site:.fr',
    '"Powered by Shopify" site:.de',
    '"Powered by Shopify" site:.es',
    'intitle:"Shop" inurl:"/collections/all"',
    'inurl:"/cart" "cdn.shopify.com" site:.fr',
    'intext:"shopify.com/s/files" "lingerie"',
    'intext:"shopify.com/s/files" "bijoux"',
    'intext:"shopify.com/s/files" "beaute" OR "beauté"',
    'intext:"shopify.com/s/files" "mode" site:.fr',
    'intext:"shopify.com/s/files" "sport"',
    '"boutique" inurl:"/collections" -site:shopify.com site:.fr',
    'inurl:"/collections/femme" OR inurl:"/collections/homme"',
    'inurl:"/collections/sale" intext:"shopify"',
    'intitle:"boutique" "Livraison gratuite" inurl:"/collections"',
    '"myshopify.com" -site:shopify.com lingerie',
    '"myshopify.com" -site:shopify.com bijoux',
  ],
  woocommerce: [
    'inurl:"/product-category/" -site:wordpress.com',
    'inurl:"/shop/" "WooCommerce" site:.fr',
    '"woocommerce" inurl:"/product-category/"',
    'intext:"woocommerce" "Ajouter au panier" site:.fr',
    'inurl:"/product-category/lingerie"',
    'inurl:"/product-category/bijoux"',
    'inurl:"/product-category/mode"',
    '"wp-content/plugins/woocommerce" site:.fr',
    'intext:"wc-cart" intitle:"boutique"',
    'inurl:"/shop/page/" site:.fr',
    '"WordPress" "WooCommerce" inurl:"/boutique"',
    'inurl:"/panier/" intext:"woocommerce"',
    'inurl:"/mon-compte/" intext:"woocommerce" site:.fr',
    '"Boutique en ligne" inurl:"/product-category/"',
    'intitle:"shop" inurl:"/product-category/" site:.de',
    'intitle:"tienda" inurl:"/product-category/" site:.es',
    'inurl:"/product-category/" "livraison" site:.fr',
  ],
  prestashop: [
    'inurl:"/fr/panier" -site:prestashop.com',
    '"prestashop" intitle:"boutique" site:.fr',
    'inurl:"/modules/blockcart/" site:.fr',
    '"Propulsé par PrestaShop" site:.fr',
    '"PrestaShop" inurl:"/fr/" site:.fr',
    'inurl:"/fr/categorie" site:.fr',
    'inurl:"/es/tienda" site:.es',
    'inurl:"/de/shop" site:.de',
    '"prestashop.com" intitle:"lingerie"',
    '"prestashop.com" intitle:"bijoux"',
    'intext:"prestashop" "Ajouter au panier" "Livraison"',
    'inurl:"/index.php?id_category=" site:.fr',
    '"PrestaShop" inurl:"/fr/accueil"',
  ],
  wix: [
    'site:wixsite.com "boutique"',
    'site:wixsite.com "shop"',
    'site:wixsite.com lingerie',
    'site:wixsite.com bijoux',
    'site:wixsite.com mode',
    '"created with wix" intitle:"boutique"',
    '"www.wix.com" "boutique en ligne"',
    'intext:"wix.com/dplugins" site:.fr',
    '"wix.com" inurl:"/shop" site:.fr',
    'site:*.wixsite.com mode OR lingerie OR bijoux',
  ],
  webflow: [
    '"Made with Webflow" intitle:"shop"',
    'site:webflow.io "boutique"',
    'intext:"webflow.com" inurl:"/shop"',
    '"webflow" intext:"Add to cart"',
    'site:*.webflow.io "collection"',
  ],
  squarespace: [
    '"Powered by Squarespace" intitle:"shop"',
    'site:squarespace.com "boutique"',
    '"static.squarespace.com" inurl:"/shop"',
    '"squarespace" "Add to cart" site:.fr',
    '"squarespace" intitle:"collection" site:.fr',
  ],
  bigcommerce: [
    '"Powered by BigCommerce" site:.fr',
    '"BigCommerce" inurl:"/cart.php" site:.fr',
    '"cdn.bigcommerce.com" intitle:"boutique"',
    '"bigcommerce" "Ajouter au panier"',
  ],
  magento: [
    'inurl:"/catalog/product/" site:.fr',
    '"Magento" inurl:"/checkout/cart" site:.fr',
    '"Magento" "Ajouter au panier" site:.fr',
    '"Magento" intitle:"boutique" site:.fr',
    'inurl:"/pub/static/" "Magento"',
    '"MAGE_" intext:"boutique" site:.fr',
  ],
  opencart: [
    'inurl:"route=product/category" site:.fr',
    '"OpenCart" inurl:"/index.php?route=" site:.fr',
    'intext:"opencart" "Ajouter au panier" site:.fr',
    'inurl:"route=common/home" site:.fr',
  ],
  // ── Footprints qualité (issus de l'analyse de 140 boutiques réelles) ──────
  qualite: [
    // Klaviyo = email marketing actif → CA sérieux (56% des shops analysés)
    'intext:"klaviyo.com" "cdn.shopify.com" site:.fr',
    'intext:"klaviyo.com" "cdn.shopify.com" site:.de',
    'intext:"klaviyo.com" "cdn.shopify.com" site:.es',
    'intext:"klaviyo.com" "cdn.shopify.com" site:.com',
    // Judge.me = reviews actives (33%)
    'intext:"judge.me" "cdn.shopify.com" site:.fr',
    'intext:"judge.me" "cdn.shopify.com" site:.com',
    // Combo Klaviyo + Judge.me = shop mature avec audience fidèle
    'intext:"klaviyo" intext:"judge.me" "cdn.shopify.com" site:.fr',
    'intext:"klaviyo" intext:"judge.me" "cdn.shopify.com" site:.com',
    // Loox = photos reviews clients (10%)
    'intext:"loox.io" "cdn.shopify.com" site:.fr',
    // Clarity = heatmaps Microsoft → optimisation active (16%)
    'intext:"clarity.ms" "cdn.shopify.com" site:.fr',
    // TikTok pixel = acquisition payante TikTok active (3% → forte croissance)
    'intext:"analytics.tiktok.com" "cdn.shopify.com" site:.fr',
    'intext:"tiktok" intext:"klaviyo" "cdn.shopify.com" site:.fr',
    // GA4 + Klaviyo + Judge.me = stack complet boutique pro
    'intext:"G-" intext:"klaviyo" intext:"judge.me" "cdn.shopify.com" site:.fr',
  ],
  bnpl: [
    // BNPL = panier moyen élevé (Klarna 14%, Alma FR, Google Pay 13%)
    'intext:"klarna.com" "cdn.shopify.com" site:.fr',
    'intext:"klarna.com" "cdn.shopify.com" site:.de',
    'intext:"klarna.com" "cdn.shopify.com" site:.es',
    'intext:"almapay.com" "cdn.shopify.com" site:.fr',
    'intext:"alma.eu" inurl:"/collections" site:.fr',
    'intext:"almapay" intext:"klaviyo" site:.fr',
    // Apple Pay = checkout rapide → conversion mobile élevée (68%)
    'intext:"ApplePaySession" "cdn.shopify.com" site:.fr',
    'intext:"apple-pay-button" "cdn.shopify.com" site:.fr',
    // Google Pay (13%)
    'intext:"google.com/pay" "cdn.shopify.com" site:.fr',
  ],
  scale: [
    // Hreflang = multi-pays (17% des shops → internationalisation)
    'intext:"hreflang" "cdn.shopify.com" site:.fr',
    'intext:"hreflang=" inurl:"/collections" "shopify"',
    'intext:"x-default" intext:"hreflang" "cdn.shopify.com"',
    // Pinterest = trafic organique visuel (7%)
    'intext:"ct.pinterest.com" "cdn.shopify.com" site:.fr',
    'intext:"pintrk" "cdn.shopify.com" site:.fr',
    // Criteo = retargeting avancé → budget pub conséquent
    'intext:"static.criteo.net" inurl:"/collections" site:.fr',
    'intext:"criteo" "cdn.shopify.com" site:.fr',
    // Omnisend = automation email avancée (5%)
    'intext:"omnisend.com" "cdn.shopify.com" site:.fr',
    // Livraison express = positionnement premium (34%)
    'intext:"livraison express" "cdn.shopify.com" site:.fr',
    'intext:"livraison en 24h" inurl:"/collections" site:.fr',
  ],
  generic: [
    'intitle:"boutique en ligne" "livraison gratuite" site:.fr -site:amazon.fr -site:cdiscount.com',
    'intitle:"boutique" "Ajouter au panier" site:.fr -site:amazon.fr',
    'intitle:"shop" "free shipping" site:.com -site:amazon.com -site:etsy.com',
    'intitle:"tienda online" "envío gratis" site:.es',
    'intitle:"online shop" "free delivery" site:.de',
    '"boutique" "collections" "livraison" site:.fr',
    'intitle:"nouveautés" "collection" "boutique" site:.fr',
    'intitle:"collections" "produits" "boutique" site:.fr',
    '"catalogue" "boutique" "commander" site:.fr',
    'inurl:"/boutique" OR inurl:"/shop" OR inurl:"/store" intitle:"collection"',
    '"vente en ligne" "collection" "livraison" site:.fr',
    '"e-shop" OR "eshop" intitle:"collection" site:.fr',
    'intitle:"mode" "collection" "boutique" site:.fr',
    'intitle:"lingerie" "collection" "boutique" site:.fr -site:darjeeling.fr',
    'intitle:"bijoux" "collection" "boutique" site:.fr',
    'intitle:"maison" "déco" "boutique" site:.fr',
    '"fast fashion" site:.fr OR site:.com intitle:"collection"',
    'intitle:"outlet" "collection" "boutique" site:.fr',
    '"drop shipping" OR "dropshipping" site:.fr intitle:"boutique"',
    'inurl:"/collections" OR inurl:"/categories" "boutique" site:.fr',
  ],
};

function ok(d) { return Response.json({ ok:true, ...d }, { headers: CORS }); }
function err(m, s=400) { return Response.json({ ok:false, error:m }, { status:s, headers: CORS }); }

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const [,, action] = url.pathname.split('/');
    let body = {};
    if (request.method === 'POST') { try { body = await request.json(); } catch {} }

    // GET /api/dorks — return full dork database
    if (action === 'dorks') {
      return ok({ dorks: DORKS, total: Object.values(DORKS).flat().length, categories: Object.keys(DORKS) });
    }

    // POST /api/scrape — scrape a domain
    if (action === 'scrape') {
      const domain = body.domain || url.searchParams.get('domain');
      if (!domain) return err('domain required');
      try {
        const result = await masterScrape(domain, env);
        return ok(result);
      } catch(e) { return err(e.message); }
    }

    // POST /api/scrape-batch — scrape multiple domains
    if (action === 'scrape-batch') {
      const domains = body.domains || [];
      if (!domains.length) return err('domains[] required');
      const results = await Promise.allSettled(
        domains.slice(0,10).map(d => masterScrape(d, env))
      );
      return ok({ results: results.map(r => r.status==='fulfilled' ? r.value : { error: r.reason?.message }) });
    }

    // GET /api/detect?domain=x — CMS detection only (no scrape)
    if (action === 'detect') {
      const domain = url.searchParams.get('domain');
      if (!domain) return err('domain required');
      const { html } = await fetchHTML(domain, env);
      const cms = detectCMS(html);
      const niches = detectNiches(html.slice(0,5000));
      return ok({ domain, cms, niches });
    }

    // GET /api/health
    if (action === 'health') {
      return ok({ status: 'up', worker: 'v35-build-scraper', ua_pool: UA_POOL.length, dorks: Object.values(DORKS).flat().length });
    }

    return err('Not found', 404);
  }
};
