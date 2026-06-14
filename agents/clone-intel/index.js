// V35 Clone Intel — Competitive intelligence for PHP/HTML site reconstruction
// Philosophy: extract STRUCTURE + SIGNALS, never copy content (duplicate content = death)
// Output: improvement brief ready to build a better version, not a replica
//
// POST /discover  — full parallel analysis → clone brief
// POST /products  — all products with ali_query (Shopify API → WC → HTML)
// POST /seo       — page-level SEO audit with improvement list
// POST /design    — color palette, fonts, UX trust signals
// POST /stack     — tech stack (pixels, apps, BNPL, chat, urgency)
// GET  /health

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Content-Type': 'application/json',
};
const J = d => Response.json({ ok: true, ...d }, { headers: CORS });
const E = (m, s=400) => Response.json({ ok: false, error: m }, { status: s, headers: CORS });

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
];
const ua = () => UAS[Math.floor(Math.random() * UAS.length)];
const hdr = (ref='') => ({
  'User-Agent': ua(), 'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8', 'Cache-Control': 'no-cache',
  'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate',
  ...(ref ? { Referer: ref } : {}),
});

// ── HTML fetch with Wayback fallback ─────────────────────────────────────────
async function fetchHTML(url, timeout = 12000) {
  try {
    const r = await fetch(url, { headers: hdr('https://www.google.fr/'), signal: AbortSignal.timeout(timeout) });
    if (r.ok) {
      const html = await r.text();
      if (html.length > 500 && !/cf-browser-verification|just a moment|__cf_chl/i.test(html)) return html;
    }
  } catch {}
  // Wayback fallback
  try {
    const cdx = await fetch(`https://web.archive.org/cdx/search/cdx?url=${new URL(url).hostname}&output=json&limit=1&fl=timestamp&filter=statuscode:200`, { signal: AbortSignal.timeout(6000) });
    const j = await cdx.json();
    if (j.length >= 2) {
      const r = await fetch(`https://web.archive.org/web/${j[1][0]}if_/${url}`, { headers: hdr(), signal: AbortSignal.timeout(12000) });
      if (r.ok) return r.text();
    }
  } catch {}
  return '';
}

// ── CMS detection ─────────────────────────────────────────────────────────────
function detectCMS(html) {
  const h = html.toLowerCase();
  if (['/cdn.shopify.com/', 'myshopify.com', 'shopify.loadFeatures'].some(s => h.includes(s.toLowerCase()))) return 'shopify';
  if (['woocommerce', '/wp-content/plugins/woo', 'wc-cart'].some(s => h.includes(s))) return 'woocommerce';
  if (['prestashop', '/modules/blockcart/', 'PrestaShop'].some(s => h.toLowerCase().includes(s.toLowerCase()))) return 'prestashop';
  if (h.includes('wix.com')) return 'wix';
  if (h.includes('webflow.com')) return 'webflow';
  if (h.includes('squarespace.com')) return 'squarespace';
  return 'custom';
}

// ── PRODUCTS ─────────────────────────────────────────────────────────────────
function cleanQuery(title) {
  // Extract product keywords, strip brand noise → AliExpress search query
  return title
    .replace(/®|™|©/g, '')
    .replace(/\b(boutique|shop|store|officiel|official|france|french|fr\.?)\b/gi, '')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 80);
}

async function extractProducts(domain) {
  const base = `https://${domain}`;
  const apiH = { 'User-Agent': ua(), 'Accept': 'application/json' };

  // ── Shopify /products.json (fastest, most complete)
  try {
    const all = [];
    for (let page = 1; all.length < 500; page++) {
      const r = await fetch(`${base}/products.json?limit=250&page=${page}`, { headers: apiH, signal: AbortSignal.timeout(10000) });
      if (!r.ok) break;
      const { products } = await r.json();
      if (!products?.length) break;
      all.push(...products);
      if (products.length < 250) break;
    }
    if (all.length) {
      // Get collection list for grouping
      const colR = await fetch(`${base}/collections.json?limit=250`, { headers: apiH, signal: AbortSignal.timeout(8000) });
      const colJ = colR.ok ? await colR.json() : {};
      return {
        platform: 'shopify', source: 'api',
        collections: (colJ.collections || []).map(c => ({ title: c.title, handle: c.handle, url: `${base}/collections/${c.handle}` })),
        products: all.map(p => ({
          title: p.title, handle: p.handle,
          type: p.product_type || '',
          tags: (p.tags || '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 8),
          price: parseFloat(p.variants?.[0]?.price || 0),
          compare_price: parseFloat(p.variants?.[0]?.compare_at_price || 0),
          variants: (p.options || []).map(o => ({ name: o.name, values: o.values.slice(0, 6) })),
          images: (p.images || []).slice(0, 4).map(i => i.src),
          available: p.variants?.some(v => v.available) ?? true,
          url: `${base}/products/${p.handle}`,
          ali_query: cleanQuery(p.title),
          has_description: !!p.body_html?.trim(),
        })),
      };
    }
  } catch {}

  // ── WooCommerce REST API
  try {
    const r = await fetch(`${base}/wp-json/wc/v3/products?per_page=100&status=publish`, { headers: apiH, signal: AbortSignal.timeout(10000) });
    if (r.ok) {
      const prods = await r.json();
      if (Array.isArray(prods) && prods.length) {
        const catR = await fetch(`${base}/wp-json/wc/v3/products/categories?per_page=100`, { headers: apiH, signal: AbortSignal.timeout(8000) });
        const cats = catR.ok ? await catR.json() : [];
        return {
          platform: 'woocommerce', source: 'api',
          collections: Array.isArray(cats) ? cats.map(c => ({ title: c.name, handle: c.slug, url: `${base}/product-category/${c.slug}` })) : [],
          products: prods.map(p => ({
            title: p.name, handle: p.slug, type: p.type,
            tags: (p.tags || []).map(t => t.name).slice(0, 8),
            price: parseFloat(p.price || 0), compare_price: parseFloat(p.regular_price || 0),
            variants: [], images: (p.images || []).slice(0, 4).map(i => i.src),
            available: p.stock_status === 'instock',
            url: p.permalink, ali_query: cleanQuery(p.name),
            has_description: !!(p.short_description || p.description),
          })),
        };
      }
    }
  } catch {}

  return { platform: 'unknown', source: 'none', collections: [], products: [] };
}

// ── SEO AUDIT ─────────────────────────────────────────────────────────────────
function parsePage(html, url) {
  const g = rx => rx.exec(html)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';
  const title    = g(/<title[^>]*>([^<]{1,160})/i);
  const metaDesc = /meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,320})/i.exec(html)?.[1]?.trim() || '';
  const h1       = g(/<h1[^>]*>([\s\S]{1,160}?)<\/h1>/i);
  const h2s      = [...html.matchAll(/<h2[^>]*>([\s\S]{1,120}?)<\/h2>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean).slice(0, 8);
  const schemaTypes = [...new Set([...html.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map(m => m[1]))];
  const canonical   = /rel=["']canonical["'][^>]+href=["']([^"']+)/i.exec(html)?.[1] || '';
  const ogImg       = /property=["']og:image["'][^>]+content=["']([^"']+)/i.exec(html)?.[1] || '';
  const totalImgs   = (html.match(/<img[^>]+/gi) || []).length;
  const altImgs     = (html.match(/<img[^>]+alt=["'][^"']{3,}/gi) || []).length;
  const wordCount   = Math.round(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').length * 0.6); // approx visible words

  const issues = [];
  if (!title) issues.push({ type: 'title_missing', impact: 'critical' });
  else if (title.length > 60) issues.push({ type: 'title_too_long', impact: 'high', detail: `${title.length} chars` });
  else if (title.length < 30) issues.push({ type: 'title_too_short', impact: 'medium', detail: `${title.length} chars` });
  if (!metaDesc) issues.push({ type: 'meta_desc_missing', impact: 'high' });
  else if (metaDesc.length > 160) issues.push({ type: 'meta_desc_too_long', impact: 'medium', detail: `${metaDesc.length} chars` });
  if (!h1) issues.push({ type: 'h1_missing', impact: 'critical' });
  if (!schemaTypes.length) issues.push({ type: 'schema_missing', impact: 'high' });
  if (!schemaTypes.includes('Product') && url.includes('/product')) issues.push({ type: 'product_schema_missing', impact: 'high' });
  if (!schemaTypes.includes('BreadcrumbList')) issues.push({ type: 'breadcrumb_schema_missing', impact: 'medium' });
  if (!canonical) issues.push({ type: 'canonical_missing', impact: 'medium' });
  if (!ogImg) issues.push({ type: 'og_image_missing', impact: 'low' });
  if (totalImgs > 0 && altImgs / totalImgs < 0.5) issues.push({ type: 'images_missing_alt', impact: 'medium', detail: `${altImgs}/${totalImgs}` });
  if (wordCount < 200 && !url.includes('/product')) issues.push({ type: 'thin_content', impact: 'high', detail: `~${wordCount} mots` });

  return { url, title, meta_desc: metaDesc, h1, h2s, schema_types: schemaTypes, canonical, og_image: ogImg, alt_ratio: totalImgs ? Math.round(altImgs / totalImgs * 100) : 100, word_count: wordCount, issues };
}

async function auditSEO(domain, collections = []) {
  const urls = [
    `https://${domain}`,
    ...collections.slice(0, 3).map(c => c.url || `https://${domain}${c.path || '/collections/' + c.handle}`),
  ];
  const pages = await Promise.all(urls.map(async url => {
    const html = await fetchHTML(url);
    if (!html) return { url, error: 'fetch_failed', issues: [] };
    return parsePage(html, url);
  }));

  // Aggregate global improvement list
  const seen = new Set();
  const improvements = [];
  for (const p of pages) {
    for (const iss of (p.issues || [])) {
      const key = iss.type;
      if (!seen.has(key)) { seen.add(key); improvements.push({ ...iss, page: p.url }); }
    }
  }
  improvements.sort((a, b) => ({ critical: 0, high: 1, medium: 2, low: 3 }[a.impact] - { critical: 0, high: 1, medium: 2, low: 3 }[b.impact]));

  return { pages_audited: pages.length, pages, improvements, critical: improvements.filter(i => i.impact === 'critical').length, high: improvements.filter(i => i.impact === 'high').length };
}

// ── DESIGN EXTRACTION ─────────────────────────────────────────────────────────
function extractDesign(html) {
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');
  const hexes = [...new Set([...css.matchAll(/#([0-9a-fA-F]{6})\b/g)].map(m => '#' + m[1].toUpperCase()))].slice(0, 16);
  const cssVars = {};
  for (const m of css.matchAll(/--([\w-]*color[\w-]*|primary|secondary|accent|background|bg|text-color)\s*:\s*(#[0-9a-fA-F]{3,6}|rgba?\([^)]+\))/g)) cssVars[`--${m[1]}`] = m[2].trim();
  const fonts = [...new Set([...html.matchAll(/fonts\.googleapis\.com\/css[^"']*family=([A-Za-z+]+)/g)].map(m => m[1].replace(/\+/g, ' ')))];
  const announceTxt = /<[^>]+(?:announcement|announce|promo-bar|top-bar|shipping-bar|header-notice)[^>]*>([\s\S]{5,300}?)<\//i.exec(html)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '';
  const freeShip = /(?:livraison gratuite|free shipping|envío gratis|versand frei)[^\d€$£]*([0-9]+)\s*[€$£]/i.exec(html);
  const ctaBtn = /<button[^>]*(?:add.to.cart|panier|cart|checkout|buy|commander)[^>]*>([\s\S]{1,60}?)<\/button>/i.exec(html)?.[1]?.replace(/<[^>]+>/g, '').trim() || '';
  const trust = [];
  for (const m of html.matchAll(/<[^>]+(?:trust|secure|badge|garantie|certif)[^>]*>([\s\S]{2,200}?)<\//gi)) {
    const t = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (t.length > 5) trust.push(t);
    if (trust.length >= 5) break;
  }
  return {
    colors: { hex_palette: hexes, css_vars: Object.keys(cssVars).length ? cssVars : null },
    fonts: fonts.length ? fonts : null,
    announcement_bar: announceTxt || null,
    free_shipping_threshold: freeShip ? parseInt(freeShip[1]) : null,
    cta_text: ctaBtn || null,
    trust_elements: trust,
  };
}

// ── TECH STACK DETECTION ──────────────────────────────────────────────────────
const STACK = {
  pixels:   { fb_pixel: [/fbq\(/, /connect\.facebook\.net/], ga4: [/G-[A-Z0-9]{8,10}/, /gtag\(/], tiktok: [/analytics\.tiktok\.com/, /ttq\./], pinterest: [/ct\.pinterest\.com/, /pintrk\(/], snapchat: [/tr\.snapchat\.com/] },
  email:    { klaviyo: [/klaviyo\.com/, /\_learnq/], omnisend: [/omnisend\.com/], mailchimp: [/chimpstatic\.com/], privy: [/widget\.privy\.com/] },
  reviews:  { judge_me: [/judge\.me/], loox: [/loox\.io/], trustpilot: [/trustpilot\.com\/trustboxes/], yotpo: [/yotpo\.com/], stamped: [/stamped\.io/] },
  bnpl:     { klarna: [/klarna\.com/], alma: [/almapay\.com/, /cdn\.getalma/], scalapay: [/scalapay\.com/], afterpay: [/afterpay\.com/] },
  chat:     { tidio: [/code\.tidio\.co/], gorgias: [/config\.gorgias\.chat/], intercom: [/widget\.intercom\.io/], zendesk: [/static\.zdassets\.com/] },
  heatmaps: { hotjar: [/static\.hotjar\.com/], clarity: [/clarity\.ms/], smartlook: [/rec\.smartlook\.com/] },
  urgency:  { countdown: [/countdown-timer/i, /CountdownTimer/], back_in_stock: [/back.in.stock/i, /notify.me/i], cart_notification: [/recently.viewed/i] },
};

function detectStack(html) {
  const result = {};
  for (const [cat, tools] of Object.entries(STACK)) {
    result[cat] = [];
    for (const [tool, patterns] of Object.entries(tools)) {
      if (patterns.some(rx => rx.test(html))) result[cat].push(tool);
    }
  }
  // GA4 measurement ID
  const ga4 = /G-([A-Z0-9]{8,10})/.exec(html);
  if (ga4) result.ga4_id = ga4[0];
  // FB pixel ID
  const fbp = /fbq\('init',\s*'(\d{10,})'/.exec(html);
  if (fbp) result.fb_pixel_id = fbp[1];
  return result;
}

// ── CLONE BRIEF GENERATOR ─────────────────────────────────────────────────────
function generateBrief(domain, cms, productData, seoData, designData, stackData) {
  const actionList = [];

  // Schema opportunity (almost always missing, high ROI)
  if (!seoData.pages.some(p => p.schema_types?.includes('Product'))) actionList.push({ priority: 1, effort: 'low', impact: 'high', action: 'Ajouter schema.org Product + AggregateRating sur chaque fiche produit → rich snippets étoiles dans SERP' });
  if (!seoData.pages.some(p => p.schema_types?.includes('BreadcrumbList'))) actionList.push({ priority: 2, effort: 'low', impact: 'medium', action: 'Ajouter BreadcrumbList schema → meilleure lecture d\'arborescence par Google' });
  if (seoData.pages.some(p => !p.schema_types?.includes('FAQPage'))) actionList.push({ priority: 3, effort: 'medium', impact: 'high', action: 'Créer FAQ par catégorie avec FAQPage schema → capture longue traîne + position 0' });

  // SEO title/meta improvements
  const thinPages = seoData.pages.filter(p => p.word_count < 200 && !p.url.includes('/product'));
  if (thinPages.length) actionList.push({ priority: 4, effort: 'medium', impact: 'high', action: `Ajouter description SEO de 300-500 mots sous chaque page collection (${thinPages.length} pages thin content détectées)` });
  if (seoData.improvements.some(i => i.type === 'meta_desc_missing')) actionList.push({ priority: 5, effort: 'low', impact: 'high', action: 'Écrire meta descriptions sur toutes les pages — absent chez le concurrent → CTR rapide à gagner' });

  // Design improvements
  if (designData.free_shipping_threshold) actionList.push({ priority: 6, effort: 'low', impact: 'medium', action: `Seuil livraison gratuite concurrent : ${designData.free_shipping_threshold}€ — tester -10% pour différenciation` });
  if (!stackData.reviews?.length) actionList.push({ priority: 7, effort: 'low', impact: 'high', action: 'Aucun outil d\'avis client détecté — implémenter Judge.me ou Google Reviews dès J1 (preuve sociale)' });
  else actionList.push({ priority: 7, effort: 'low', impact: 'high', action: `Avis client via ${stackData.reviews.join('/')} détecté — implémenter le même outil et importer des avis AliExpress dès le lancement` });

  // Stack opportunities
  if (!stackData.email?.length) actionList.push({ priority: 8, effort: 'medium', impact: 'high', action: 'Aucun email marketing détecté — implémenter Klaviyo/Omnisend dès J1 (pop-up -10% = liste email)' });
  if (!stackData.bnpl?.length) actionList.push({ priority: 9, effort: 'low', impact: 'medium', action: 'Pas de BNPL détecté — intégrer Alma (3×/4× sans frais) pour augmenter panier moyen de 20-40%' });
  if (stackData.pixels?.includes('tiktok')) actionList.push({ priority: 10, effort: 'medium', impact: 'high', action: 'TikTok pixel actif chez le concurrent → canal d\'acquisition prioritaire à dupliquer' });

  const cloneTime = { shopify: '2 jours', woocommerce: '3 jours', prestashop: '5 jours', custom: '4 jours' };
  const noDesc = productData.products.filter(p => !p.has_description).length;

  return {
    domain, cms, generated_at: new Date().toISOString(),
    stats: { collections: productData.collections.length, products: productData.products.length, no_description: noDesc, seo_issues: seoData.critical + seoData.high },
    clone_time: cloneTime[cms] || '3 jours',
    priority_actions: actionList.slice(0, 12),
    to_replicate: {
      stack: [...(stackData.email || []), ...(stackData.reviews || []), ...(stackData.bnpl || [])].filter(Boolean),
      free_shipping_threshold: designData.free_shipping_threshold,
      announcement_bar: designData.announcement_bar,
    },
    not_worth_copying: ['legal pages', 'blog posts text', 'full product descriptions', 'CSS/design system', 'account pages'],
  };
}

// ── ROUTER ────────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '');
    let body = {};
    if (request.method === 'POST') { try { body = await request.json(); } catch {} }
    const domain = (body.domain || url.searchParams.get('domain') || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();

    if (path === '/health') return J({ worker: 'v35-clone-intel', status: 'up' });

    if (path === '/products') {
      if (!domain) return E('domain required');
      const data = await extractProducts(domain);
      return J(data);
    }

    if (path === '/seo') {
      if (!domain) return E('domain required');
      const cols = body.collections || [];
      const data = await auditSEO(domain, cols);
      return J(data);
    }

    if (path === '/design') {
      if (!domain) return E('domain required');
      const html = await fetchHTML(`https://${domain}`);
      if (!html) return E('fetch_failed');
      return J(extractDesign(html));
    }

    if (path === '/stack') {
      if (!domain) return E('domain required');
      const html = await fetchHTML(`https://${domain}`);
      if (!html) return E('fetch_failed');
      return J(detectStack(html));
    }

    if (path === '/discover') {
      if (!domain) return E('domain required');
      // Fetch homepage once — reuse for design + stack + CMS
      const homeHtml = await fetchHTML(`https://${domain}`);
      const cms = detectCMS(homeHtml);

      const [productData, stackData] = await Promise.all([
        extractProducts(domain),
        Promise.resolve(homeHtml ? detectStack(homeHtml) : {}),
      ]);
      const designData = homeHtml ? extractDesign(homeHtml) : {};
      const seoData = await auditSEO(domain, productData.collections.slice(0, 3));
      const brief = generateBrief(domain, cms, productData, seoData, designData, stackData);

      return J({ brief, products: productData, seo: seoData, design: designData, stack: stackData });
    }

    return E('Not found', 404);
  },
};
