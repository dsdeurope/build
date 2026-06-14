// V35 Market Intel — margin calculator + Google Trends + Ad Spy
// POST /margin   { domain, product_title, ali_url? }
// POST /trends   { keyword, geo?, period? }
// POST /adspy    { domain }
// POST /validate { domain, keywords[] }  — full validation report

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Content-Type': 'application/json',
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';

// ── Helpers ───────────────────────────────────────────────────────────────────
function ok(d)        { return Response.json({ ok: true, ...d },  { headers: CORS }); }
function fail(m, s=400) { return Response.json({ ok: false, error: m }, { status: s, headers: CORS }); }

async function get(url, headers = {}) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8', ...headers },
    signal: AbortSignal.timeout(12000),
    redirect: 'follow',
  });
  return { ok: r.ok, status: r.status, text: await r.text() };
}

// ── MARGIN CALCULATOR ─────────────────────────────────────────────────────────

// Extract price from HTML (schema.org, og:price, common selectors in text)
function extractPrice(html) {
  // 1. JSON-LD schema.org/Product
  const jldRe = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = jldRe.exec(html)) !== null) {
    try {
      const d = JSON.parse(m[1]);
      const items = Array.isArray(d) ? d : [d];
      for (const item of items) {
        const type = item['@type'];
        if (type === 'Product' || type === 'https://schema.org/Product') {
          const offer = item.offers || item.offer;
          if (offer) {
            const price = Array.isArray(offer) ? offer[0]?.price : offer.price;
            if (price && !isNaN(parseFloat(price))) return parseFloat(price);
          }
        }
      }
    } catch {}
  }

  // 2. og:price meta
  const ogPrice = html.match(/<meta[^>]*property="product:price:amount"[^>]*content="([\d.,]+)"/i)
    || html.match(/<meta[^>]*name="twitter:data1"[^>]*content="([\d.,]+\s*€)"/i);
  if (ogPrice) {
    const v = parseFloat(ogPrice[1].replace(',', '.'));
    if (!isNaN(v)) return v;
  }

  // 3. Pattern numérique €  (ex: "29,99 €" ou "€29.99")
  const prices = [];
  for (const re of [
    /["'>]([\d]+[,.]\d{2})\s*€["'<]/g,
    /€\s*([\d]+[,.]\d{2})/g,
    /"price"\s*:\s*"?([\d.]+)"?/g,
    /class="[^"]*price[^"]*"[^>]*>([\d]+[,.]\d{2})/gi,
  ]) {
    let mm;
    while ((mm = re.exec(html)) !== null) {
      const v = parseFloat(mm[1].replace(',', '.'));
      if (!isNaN(v) && v > 0.5 && v < 5000) prices.push(v);
    }
  }
  if (prices.length) {
    // Return median to avoid outliers
    prices.sort((a, b) => a - b);
    return prices[Math.floor(prices.length / 2)];
  }
  return null;
}

// Scrape first AliExpress search result price via DDG
async function getAliPrice(productTitle) {
  try {
    const q = `site:aliexpress.com ${productTitle}`;
    const r = await get(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`);
    const html = r.text;

    // Extract AliExpress product URLs from DDG results
    const urlRe = /https?:\/\/(?:fr\.)?aliexpress\.com\/item\/[\d]+\.html/gi;
    const urls = [...new Set(html.match(urlRe) || [])].slice(0, 3);
    if (!urls.length) return { price: null, url: null };

    // Scrape first product page for price
    for (const url of urls) {
      try {
        const page = await get(url, { 'Accept': 'text/html' });
        // AliExpress price in JSON
        const priceMatch = page.text.match(/"discountPrice"\s*:\s*\{[^}]*"value"\s*:\s*"?([\d.]+)"?/);
        if (priceMatch) return { price: parseFloat(priceMatch[1]), url, currency: 'EUR' };
        // Fallback: any price pattern
        const simple = page.text.match(/class="[^"]*snow-price[^"]*"[^>]*>([\d.]+)/);
        if (simple) return { price: parseFloat(simple[1]), url, currency: 'EUR' };
      } catch {}
    }

    // Last fallback: search URL (user navigates manually)
    return {
      price: null,
      url: `https://fr.aliexpress.com/wholesale?SearchText=${encodeURIComponent(productTitle)}`,
      note: 'Prix non extrait — ouvrir le lien pour vérifier',
    };
  } catch {
    return { price: null, url: null };
  }
}

async function calcMargin(domain, productTitle, providedAliUrl) {
  // 1. Scrape competitor product price
  let competitorPrice = null;
  let competitorUrl = null;
  try {
    // Try to find a product URL via search on the site
    const search = await get(`https://${domain}/search?q=${encodeURIComponent(productTitle)}`);
    // Extract first product link
    const prodRe = new RegExp(`https?://${domain.replace('.', '\\.')}(?:/[a-z]{2})?/products?/[^"'\\s<>]+`, 'i');
    const prodMatch = search.text.match(prodRe);
    if (prodMatch) {
      competitorUrl = prodMatch[0];
      const page = await get(competitorUrl);
      competitorPrice = extractPrice(page.text);
    }
    // Fallback: try homepage / collections first product
    if (!competitorPrice) {
      const home = await get(`https://${domain}`);
      competitorPrice = extractPrice(home.text);
    }
  } catch {}

  // 2. AliExpress price
  const ali = providedAliUrl
    ? { price: null, url: providedAliUrl, note: 'URL fournie — prix à vérifier manuellement' }
    : await getAliPrice(productTitle);

  // 3. Margin calculation
  let margin = null, marginPct = null, verdict = 'inconnu';
  if (competitorPrice && ali.price) {
    margin    = Math.round((competitorPrice - ali.price) * 100) / 100;
    marginPct = Math.round((margin / competitorPrice) * 100);
    if (marginPct >= 60)      verdict = '🟢 Excellente';
    else if (marginPct >= 40) verdict = '🟡 Correcte';
    else if (marginPct >= 20) verdict = '🟠 Faible';
    else                      verdict = '🔴 Insuffisante';
  }

  return {
    domain,
    product_title: productTitle,
    competitor_price: competitorPrice,
    competitor_url:   competitorUrl,
    ali_price:   ali.price,
    ali_url:     ali.url,
    margin,
    margin_pct:  marginPct,
    verdict,
    note: ali.note || null,
    x3_price: competitorPrice ? Math.round(competitorPrice * 3 * 100) / 100 : null, // règle ×3
  };
}

// ── GOOGLE TRENDS (unofficial API) ────────────────────────────────────────────
async function getTrends(keyword, geo = 'FR', period = 'today 12-m') {
  try {
    // Step 1: get token from explore API
    const exploreUrl = `https://trends.google.com/trends/api/explore?hl=fr&tz=-60&req=${encodeURIComponent(JSON.stringify({
      comparisonItem: [{ keyword, geo, time: period }],
      category: 0,
      property: '',
    }))}`;

    const explore = await get(exploreUrl, {
      'Accept': 'application/json',
      'Referer': 'https://trends.google.com/',
    });

    // Remove ")]}'" prefix Google adds
    const cleanExplore = explore.text.replace(/^\)\]\}'/, '').trim();
    const exploreData = JSON.parse(cleanExplore);
    const widgets = exploreData.widgets || [];

    const timeWidget = widgets.find(w => w.id === 'TIMESERIES');
    const geoWidget  = widgets.find(w => w.id === 'GEO_MAP');
    const relWidget  = widgets.find(w => w.id === 'RELATED_QUERIES');

    if (!timeWidget) return { keyword, geo, error: 'widget non trouvé', trend: null };

    // Step 2: fetch timeseries data
    const tsReq = encodeURIComponent(JSON.stringify(timeWidget.request));
    const tsUrl = `https://trends.google.com/trends/api/widgetdata/multiline?hl=fr&tz=-60&req=${tsReq}&token=${encodeURIComponent(timeWidget.token)}`;
    const tsRes = await get(tsUrl, { 'Referer': 'https://trends.google.com/' });
    const cleanTs = tsRes.text.replace(/^\)\]\}'/, '').trim();
    const tsData = JSON.parse(cleanTs);

    const points = (tsData.default?.timelineData || []).map(p => ({
      date: p.formattedTime,
      value: p.value?.[0] ?? 0,
    }));

    // Trend direction: compare last 3 months vs previous 3
    const last3  = points.slice(-3).reduce((s, p) => s + p.value, 0) / 3;
    const prev3  = points.slice(-6, -3).reduce((s, p) => s + p.value, 0) / 3;
    const delta  = prev3 > 0 ? Math.round(((last3 - prev3) / prev3) * 100) : 0;
    const trend  = delta > 10 ? '📈 En hausse' : delta < -10 ? '📉 En baisse' : '➡️ Stable';
    const avgVal = Math.round(points.reduce((s, p) => s + p.value, 0) / (points.length || 1));

    // Step 3: related queries
    let rising = [], top = [];
    if (relWidget) {
      const relReq = encodeURIComponent(JSON.stringify(relWidget.request));
      const relUrl = `https://trends.google.com/trends/api/widgetdata/relatedsearches?hl=fr&tz=-60&req=${relReq}&token=${encodeURIComponent(relWidget.token)}`;
      try {
        const relRes = await get(relUrl, { 'Referer': 'https://trends.google.com/' });
        const cleanRel = relRes.text.replace(/^\)\]\}'/, '').trim();
        const relData = JSON.parse(cleanRel);
        rising = (relData.default?.rankedList?.[0]?.rankedKeyword || []).slice(0, 5).map(k => ({ query: k.query, value: k.value }));
        top    = (relData.default?.rankedList?.[1]?.rankedKeyword || []).slice(0, 5).map(k => ({ query: k.query, value: k.value }));
      } catch {}
    }

    return { keyword, geo, period, points: points.slice(-12), avg_interest: avgVal, trend, delta_pct: delta, rising, top };

  } catch (e) {
    return { keyword, geo, error: e.message, trend: null };
  }
}

// ── AD SPY ────────────────────────────────────────────────────────────────────
async function spyAds(domain) {
  const root = domain.replace(/^www\./, '');
  const results = { domain, meta: null, tiktok: null, verdict: '' };

  // 1. Meta Ad Library (public search, no auth needed for basic)
  try {
    const metaUrl = `https://www.facebook.com/ads/library/api/?search_type=keyword_unordered&q=${encodeURIComponent(root)}&country=FR&active_status=active&ad_type=all&media_type=all&fields=id,page_name,ad_delivery_start_time,ad_creative_bodies,spend`;
    const metaRes = await get(metaUrl, {
      'Accept': 'application/json',
      'Referer': 'https://www.facebook.com/ads/library/',
      'Cookie': 'locale=fr_FR',
    });
    if (metaRes.ok) {
      try {
        const data = JSON.parse(metaRes.text);
        const ads = Array.isArray(data) ? data : (data.data || []);
        results.meta = {
          active_ads: ads.length,
          pages: [...new Set(ads.map(a => a.page_name).filter(Boolean))].slice(0, 5),
          oldest_ad: ads.map(a => a.ad_delivery_start_time).filter(Boolean).sort()[0] || null,
          sample_copy: ads.slice(0, 2).map(a => (a.ad_creative_bodies || [])[0] || '').filter(Boolean),
        };
      } catch { results.meta = { active_ads: 0, raw: metaRes.text.slice(0, 100) }; }
    }
  } catch {}

  // 2. Meta Ad Library HTML search (fallback)
  if (!results.meta || results.meta.active_ads === 0) {
    try {
      const htmlUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=FR&q=${encodeURIComponent(root)}&search_type=keyword_unordered_fuzzy&media_type=all`;
      const htmlRes = await get(htmlUrl);
      const hasAds = htmlRes.text.includes(root) && !htmlRes.text.includes('Aucune publicité');
      const countMatch = htmlRes.text.match(/(\d+)\s+résultat/i);
      results.meta = {
        active_ads: countMatch ? parseInt(countMatch[1]) : (hasAds ? '1+' : 0),
        source: 'html',
      };
    } catch {}
  }

  // 3. TikTok Ad Library
  try {
    const ttUrl = `https://library.tiktok.com/ads/search?query=${encodeURIComponent(root)}&region=FR&status=active`;
    const ttRes = await get(ttUrl, { 'Accept': 'application/json' });
    if (ttRes.ok) {
      try {
        const d = JSON.parse(ttRes.text);
        results.tiktok = { active_ads: d.data?.total || 0 };
      } catch { results.tiktok = { active_ads: 0 }; }
    }
  } catch {}

  // 4. TikTok Creative Center search (fallback)
  if (!results.tiktok) {
    try {
      const ttHtml = await get(`https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en?region=FR&keyword=${encodeURIComponent(root)}`);
      results.tiktok = { active_ads: ttHtml.text.includes(root) ? '1+' : 0, source: 'html' };
    } catch { results.tiktok = { active_ads: 0 }; }
  }

  // Verdict
  const metaActive = results.meta?.active_ads && results.meta.active_ads !== 0;
  const ttActive   = results.tiktok?.active_ads && results.tiktok.active_ads !== 0;
  if (metaActive && ttActive) results.verdict = '🔥 Actif Meta + TikTok — budget pub conséquent';
  else if (metaActive)        results.verdict = '📘 Actif Meta — bonne preuve de rentabilité';
  else if (ttActive)          results.verdict = '🎵 Actif TikTok — audience jeune/virale';
  else                        results.verdict = '💤 Aucune pub détectée — SEO only ou budget faible';

  return results;
}

// ── VALIDATE (rapport complet) ────────────────────────────────────────────────
async function fullValidation(domain, keywords) {
  const [ads, ...trends] = await Promise.all([
    spyAds(domain),
    ...keywords.slice(0, 3).map(kw => getTrends(kw, 'FR', 'today 12-m')),
  ]);

  const avgInterest = trends.filter(t => t.avg_interest).reduce((s, t) => s + t.avg_interest, 0) / (trends.filter(t => t.avg_interest).length || 1);
  const trendDir    = trends.some(t => t.delta_pct > 10) ? '📈' : trends.some(t => t.delta_pct < -10) ? '📉' : '➡️';

  return {
    domain,
    ads,
    trends,
    summary: {
      ad_activity: ads.verdict,
      trend_direction: trendDir,
      avg_search_interest: Math.round(avgInterest),
      recommendation: avgInterest > 40 && ads.meta?.active_ads ? '🟢 Valider' : avgInterest > 20 ? '🟡 Approfondir' : '🔴 Risqué',
    },
  };
}

// ── FETCH HANDLER ─────────────────────────────────────────────────────────────
export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url  = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '');
    let body   = {};
    if (request.method === 'POST') { try { body = await request.json(); } catch {} }

    // POST /margin
    if (path === '/margin' && request.method === 'POST') {
      const { domain, product_title, ali_url } = body;
      if (!domain || !product_title) return fail('domain + product_title requis');
      const result = await calcMargin(domain.replace(/^https?:\/\//, ''), product_title, ali_url);
      return ok(result);
    }

    // POST /trends
    if (path === '/trends' && request.method === 'POST') {
      const { keyword, geo = 'FR', period = 'today 12-m' } = body;
      if (!keyword) return fail('keyword requis');
      const result = await getTrends(keyword, geo, period);
      return ok(result);
    }

    // POST /adspy
    if (path === '/adspy' && request.method === 'POST') {
      const { domain } = body;
      if (!domain) return fail('domain requis');
      const result = await spyAds(domain.replace(/^https?:\/\//, ''));
      return ok(result);
    }

    // POST /validate
    if (path === '/validate' && request.method === 'POST') {
      const { domain, keywords = [] } = body;
      if (!domain) return fail('domain requis');
      const result = await fullValidation(domain.replace(/^https?:\/\//, ''), keywords);
      return ok(result);
    }

    // GET /health
    if (path === '/health') {
      return ok({ service: 'market-intel', endpoints: ['/margin', '/trends', '/adspy', '/validate'] });
    }

    return fail('Not found', 404);
  },
};
