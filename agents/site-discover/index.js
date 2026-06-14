// V35 Site Discover — détecte des boutiques Shopify/WC avec produits 100% AliExpress
// Pipeline: Google CSE dorks → scrape CMS → vérifie AliExpress → score → save boutiques

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};
const BUILD_API = 'https://v35-build-api.ernestpedanou.workers.dev/api';

// ── Footprints CMS (utilisés par le moteur de recherche) ─────────────────────
// Shopify  : cdn.shopify.com | "powered by shopify" | /collections/ | /products/ | myshopify.com
// WC       : wp-content/plugins/woocommerce | /?add-to-cart= | /product-category/ | wc-ajax
// PrestaShop: "powered by prestashop" | /prestashop/ | /module/ps_shoppingcart/ | PrestaShop.token

// ── Niches compatibles AliExpress ────────────────────────────────────────────
// EXCLUES : cuisine, luxe, auto, sante, voyages
const NICHES = {
  bijoux: {
    cpc: 0.65,
    ali_kw: ['bague femme dorée', 'collier pendentif femme', 'bracelet acier femme', 'boucle oreille fantaisie'],
    dorks: [
      // Shopify footprints
      '"powered by shopify" "bijoux" site:.fr',
      '"cdn.shopify.com" "bague" OR "collier" OR "bracelet" site:.fr',
      'inurl:/collections/bijoux site:.fr',
      'inurl:/collections/bagues site:.fr',
      'inurl:/collections/colliers site:.fr',
      'inurl:/collections/bracelets site:.fr',
      'inurl:/collections/boucles-oreilles site:.fr',
      'intitle:"bijoux" inurl:/collections/ site:.fr',
      'intitle:"bijoux fantaisie" "shopify" site:.fr',
      'intitle:"bague" OR intitle:"collier" inurl:/products/ site:.fr',
      // WooCommerce footprints
      '"woocommerce" "bijoux" "product-category" site:.fr',
      'inurl:/product-category/bijoux site:.fr',
      'inurl:/boutique/bijoux site:.fr',
      '"/wp-content/plugins/woocommerce" "bijoux" site:.fr',
      'intitle:"bijoux" "ajouter au panier" "woocommerce" site:.fr',
      // PrestaShop footprints
      '"powered by prestashop" "bijoux" site:.fr',
      'inurl:/fr/bijoux site:.fr "prestashop"',
      'intitle:"bijoux" "prestashop" "panier" site:.fr',
      // Générique dropshipping
      '"bijoux" "livraison gratuite" "shopify" site:.fr',
      '"bijoux tendance" "nouveautés" inurl:/collections/ site:.fr',
    ],
  },
  mode: {
    cpc: 0.45,
    ali_kw: ['robe femme tendance', 'pull oversize femme', 'veste femme casual', 'jupe midi femme'],
    dorks: [
      '"powered by shopify" "mode femme" site:.fr',
      '"cdn.shopify.com" "robe" OR "veste" OR "pull" site:.fr',
      'inurl:/collections/robes site:.fr',
      'inurl:/collections/tops site:.fr',
      'inurl:/collections/vestes site:.fr',
      'inurl:/collections/jupes site:.fr',
      'inurl:/collections/nouveautes site:.fr',
      'intitle:"robe femme" inurl:/collections/ site:.fr',
      'intitle:"mode femme" "shopify" site:.fr',
      '"woocommerce" "mode" inurl:/product-category/robes site:.fr',
      'inurl:/product-category/mode-femme site:.fr',
      '"powered by prestashop" "mode femme" site:.fr',
      '"boutique mode" "livraison offerte" inurl:/collections/ site:.fr',
      '"nouvelle collection" "mode" inurl:/collections/ site:.fr',
      '"vêtements femme" "shopify" "livraison" site:.fr',
    ],
  },
  beaute: {
    cpc: 0.55,
    ali_kw: ['sérum visage antiâge', 'crème hydratante femme', 'masque soin peau', 'huile visage naturelle'],
    dorks: [
      '"powered by shopify" "beauté" OR "cosmétiques" site:.fr',
      '"cdn.shopify.com" "sérum" OR "crème" OR "soin" site:.fr',
      'inurl:/collections/soins-visage site:.fr',
      'inurl:/collections/beaute site:.fr',
      'inurl:/collections/cosmetiques site:.fr',
      'inurl:/collections/serums site:.fr',
      'intitle:"soin visage" inurl:/collections/ site:.fr',
      'intitle:"beauté naturelle" "shopify" site:.fr',
      '"woocommerce" inurl:/product-category/beaute site:.fr',
      '"powered by prestashop" "cosmétique" site:.fr',
      '"sérum" "crème" "livraison gratuite" inurl:/collections/ site:.fr',
      '"routine beauté" "shopify" site:.fr',
    ],
  },
  maison: {
    cpc: 0.70,
    ali_kw: ['décoration maison tendance', 'coussin déco salon', 'bougie parfumée', 'vase décoratif moderne'],
    dorks: [
      '"powered by shopify" "décoration" OR "déco" site:.fr',
      '"cdn.shopify.com" "décoration" OR "bougie" OR "coussin" site:.fr',
      'inurl:/collections/decoration site:.fr',
      'inurl:/collections/bougies site:.fr',
      'inurl:/collections/coussins site:.fr',
      'inurl:/collections/vases site:.fr',
      'inurl:/collections/art-de-vivre site:.fr',
      'intitle:"décoration maison" inurl:/collections/ site:.fr',
      'intitle:"déco" "shopify" "livraison" site:.fr',
      '"woocommerce" inurl:/product-category/decoration site:.fr',
      '"powered by prestashop" "décoration intérieure" site:.fr',
      '"bougie" "décoration" "livraison offerte" inurl:/collections/ site:.fr',
    ],
  },
  sport: {
    cpc: 0.60,
    ali_kw: ['legging sport femme', 'brassière sport yoga', 'sac sport fitness', 'accessoire yoga tapis'],
    dorks: [
      '"powered by shopify" "sport" OR "fitness" site:.fr',
      '"cdn.shopify.com" "legging" OR "yoga" OR "fitness" site:.fr',
      'inurl:/collections/sport site:.fr',
      'inurl:/collections/yoga site:.fr',
      'inurl:/collections/fitness site:.fr',
      'inurl:/collections/leggings site:.fr',
      'inurl:/collections/equipement-sport site:.fr',
      'intitle:"legging sport" inurl:/collections/ site:.fr',
      'intitle:"yoga" "shopify" site:.fr',
      '"woocommerce" inurl:/product-category/sport site:.fr',
      '"powered by prestashop" "sport" "fitness" site:.fr',
      '"activewear" OR "sportswear" inurl:/collections/ site:.fr',
    ],
  },
  animaux: {
    cpc: 0.50,
    ali_kw: ['accessoire chien tendance', 'collier chat original', 'jouet chien interactif', 'manteau chien hiver'],
    dorks: [
      '"powered by shopify" "animaux" OR "chien" OR "chat" site:.fr',
      '"cdn.shopify.com" "chien" OR "chat" OR "animal" site:.fr',
      'inurl:/collections/chiens site:.fr',
      'inurl:/collections/chats site:.fr',
      'inurl:/collections/animaux site:.fr',
      'inurl:/collections/accessoires-chien site:.fr',
      'intitle:"accessoire chien" inurl:/collections/ site:.fr',
      'intitle:"boutique chien" "shopify" site:.fr',
      '"woocommerce" inurl:/product-category/animaux site:.fr',
      '"powered by prestashop" "animaux de compagnie" site:.fr',
      '"collier chien" "manteau" inurl:/collections/ site:.fr',
    ],
  },
  enfant: {
    cpc: 0.55,
    ali_kw: ['jouet enfant éveil éducatif', 'vêtement bébé original', 'peluche enfant doux', 'accessoire poussette'],
    dorks: [
      '"powered by shopify" "enfant" OR "bébé" OR "jouet" site:.fr',
      '"cdn.shopify.com" "enfant" OR "bébé" OR "jouet" site:.fr',
      'inurl:/collections/jouets site:.fr',
      'inurl:/collections/bebe site:.fr',
      'inurl:/collections/enfants site:.fr',
      'inurl:/collections/peluches site:.fr',
      'inurl:/collections/puericulture site:.fr',
      'intitle:"jouet enfant" inurl:/collections/ site:.fr',
      'intitle:"bébé" "shopify" "livraison" site:.fr',
      '"woocommerce" inurl:/product-category/jouets site:.fr',
      '"powered by prestashop" "jouets" "enfants" site:.fr',
      '"peluche" "jouet éducatif" inurl:/collections/ site:.fr',
    ],
  },
  electronique: {
    cpc: 0.80,
    ali_kw: ['gadget électronique tendance', 'accessoire smartphone original', 'écouteurs sans fil', 'chargeur rapide usb'],
    dorks: [
      '"powered by shopify" "tech" OR "gadget" OR "électronique" site:.fr',
      '"cdn.shopify.com" "tech" OR "gadget" OR "accessoire" site:.fr',
      'inurl:/collections/gadgets site:.fr',
      'inurl:/collections/tech site:.fr',
      'inurl:/collections/accessoires-telephone site:.fr',
      'inurl:/collections/ecouteurs site:.fr',
      'inurl:/collections/chargeurs site:.fr',
      'intitle:"gadget" inurl:/collections/ site:.fr',
      'intitle:"accessoire smartphone" "shopify" site:.fr',
      '"woocommerce" inurl:/product-category/electronique site:.fr',
      '"powered by prestashop" "gadget" "tech" site:.fr',
      '"écouteurs sans fil" OR "chargeur rapide" inurl:/collections/ site:.fr',
    ],
  },
};

const BLACKLIST = /amazon\.|ebay\.|etsy\.|cdiscount\.|fnac\.|darty\.|zalando\.|asos\.|shein\.|aliexpress\.|alibaba\.|leroymerlin\.|ikea\.|zara\.|hm\.com|uniqlo\.|veepee\.|showroomprive\.|vinted\.|leboncoin\.|rakuten\./i;
const CMS_OK  = ['shopify', 'woocommerce', 'prestashop'];
const CMS_BAD = ['magento', 'bigcommerce', 'sap', 'vtex', 'sylius'];

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function ok(d, s=200) { return Response.json({ ok:true, ...d }, { status:s, headers:CORS }); }
function fail(m, s=400) { return Response.json({ ok:false, error:m }, { status:s, headers:CORS }); }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Moteur de recherche : Google CSE ou SerpAPI (fallback) ───────────────────
function extractDomainsFr(items = []) {
  const domains = new Set();
  for (const item of items) {
    const url = item.link || item.url || '';
    const d = url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0].toLowerCase();
    if (!BLACKLIST.test(d) && d.includes('.') && d.endsWith('.fr')) domains.add(d);
  }
  return [...domains];
}

async function googleSearch(query, gkey, gcx, count = 10) {
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${gkey}&cx=${gcx}&q=${encodeURIComponent(query)}&num=${Math.min(count,10)}&gl=fr&hl=fr`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return [];
    const j = await r.json();
    if (j.error) return [];
    return extractDomainsFr(j.items || []);
  } catch { return []; }
}

async function serpSearch(query, serp_key, count = 10) {
  try {
    const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&gl=fr&hl=fr&num=${count}&api_key=${serp_key}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return [];
    const j = await r.json();
    return extractDomainsFr(j.organic_results || []);
  } catch { return []; }
}

// ── OpenAI web_search — moteur principal (juin 2026) ─────────────────────────
async function openaiSearch(niche_id, niche, openai_key, count = 15) {
  const prompt = `Tu es un expert en e-commerce dropshipping français.
Trouve ${count} boutiques françaises en ligne (domaines .fr uniquement) qui vendent des produits de niche "${niche_id}" (${niche.ali_kw.slice(0,3).join(', ')}).
Ces boutiques doivent :
- Avoir un CMS Shopify, WooCommerce ou PrestaShop
- Vendre des produits sourçables sur AliExpress
- Être de vraies boutiques actives en France
- Avoir un domaine .fr

Réponds UNIQUEMENT avec une liste JSON de domaines, sans explication :
["example1.fr","example2.fr","example3.fr",...]`;

  try {
    // Essai 1 : API Responses avec web_search_preview (OpenAI juin 2025+)
    const r1 = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openai_key}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        tools: [{ type: 'web_search_preview' }],
        input: prompt,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (r1.ok) {
      const j1 = await r1.json();
      const text = j1.output?.find(o => o.type === 'message')?.content?.[0]?.text || '';
      const match = text.match(/\[[\s\S]*?\]/);
      if (match) {
        const raw = JSON.parse(match[0]);
        return raw.filter(d => typeof d === 'string' && d.endsWith('.fr') && !BLACKLIST.test(d));
      }
    }

    // Fallback : Chat completions standard (sans web search — retourne des domaines connus)
    const r2 = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openai_key}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (r2.ok) {
      const j2 = await r2.json();
      const text = j2.choices?.[0]?.message?.content || '';
      const match = text.match(/\[[\s\S]*?\]/);
      if (match) {
        const raw = JSON.parse(match[0]);
        return raw.filter(d => typeof d === 'string' && d.endsWith('.fr') && !BLACKLIST.test(d));
      }
    }
  } catch {}
  return [];
}

async function searchDomains(query, env, count = 10) {
  // Priorité : OpenAI web search (meilleur, juin 2026)
  // Note : openaiSearch() est appelé par niche, pas par dork
  if (env.GOOGLE_CSE_KEY && env.GOOGLE_CSE_CX) {
    const res = await googleSearch(query, env.GOOGLE_CSE_KEY, env.GOOGLE_CSE_CX, count);
    if (res.length > 0) return res;
  }
  if (env.SERP_API_KEY) return serpSearch(query, env.SERP_API_KEY, count);
  return [];
}

// ── AliExpress coverage — scrape direct (sans moteur de recherche) ────────────
async function checkAliexpress(keywords, gkey, gcx) {
  let found = 0;
  const kws = keywords.slice(0, 4);

  // Méthode 1 : scrape direct AliExpress wholesale search
  for (const kw of kws) {
    try {
      const r = await fetch(
        `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(kw)}&SortType=default_desc&page=1`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html',
            'Accept-Language': 'fr-FR,fr;q=0.9',
            'Referer': 'https://www.aliexpress.com/',
          },
          signal: AbortSignal.timeout(10000),
        }
      );
      if (r.ok) {
        const html = await r.text();
        if (/\/item\/\d{8,}/.test(html) || /"productId":\d+/.test(html) || /itemList/.test(html) || /product-snippet/.test(html)) found++;
      }
      await delay(300);
    } catch {}
  }

  // Méthode 2 fallback : Google CSE site:aliexpress.com
  if (found === 0 && gkey && gcx) {
    for (const kw of kws.slice(0, 2)) {
      try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${gkey}&cx=${gcx}&q=${encodeURIComponent('site:aliexpress.com ' + kw)}&num=5`;
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (r.ok) {
          const j = await r.json();
          if ((j.items || []).some(x => x.link?.includes('aliexpress.com/item'))) found++;
        }
        await delay(200);
      } catch {}
    }
  }

  const total = kws.length;
  return { found, total, pct: total > 0 ? Math.round((found / total) * 100) : 0 };
}

// ── Score composite (0–10) ───────────────────────────────────────────────────
function scoresite(ali_pct, cpc, traffic, cms, collections, domain_age_years) {
  const s_ali  = (ali_pct / 100) * 3.5;
  const s_cpc  = Math.min((cpc || 0) * 2.5, 2.0);
  const s_traf = (Math.log10(Math.max(traffic || 100, 100)) / 5) * 1.5;
  const s_cms  = cms === 'shopify' ? 1.0 : cms === 'woocommerce' ? 0.8 : cms === 'prestashop' ? 0.6 : 0.3;
  const s_age  = (domain_age_years || 0) >= 3 ? 1.0 : (domain_age_years || 0) >= 1 ? 0.5 : 0.0;
  const s_col  = Math.min((collections || 0) / 100, 0.5);
  return Math.min(Math.round((s_ali + s_cpc + s_traf + s_cms + s_age + s_col) * 10) / 10, 10);
}

// ── Fetch site + detect CMS ──────────────────────────────────────────────────
async function detectSite(domain) {
  const url = `https://${domain}`;
  let html = '', cms = 'unknown', status = 0;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    status = r.status;
    if (!r.ok) return { online: false, http_status: status, cms: 'unknown' };
    html = await r.text();
  } catch { return { online: false, cms: 'unknown' }; }

  if (/cdn\.shopify\.com|Shopify\.theme|shopify\.loadFeatures/i.test(html)) cms = 'shopify';
  else if (/woocommerce|wp-content\/plugins\/woo/i.test(html)) cms = 'woocommerce';
  else if (/prestashop|id_category|PrestaShop/i.test(html)) cms = 'prestashop';
  else if (/magento|Mage\.|MAGE_/i.test(html)) cms = 'magento';
  else if (/wix\.com|wixsite\.com/i.test(html)) cms = 'wix';
  else if (/webflow\.com/i.test(html)) cms = 'webflow';

  // Extraction HTML — fonctionne depuis CF datacenter (collections.json bloqué par Shopify)
  const colHandles = new Set((html.match(/href="\/collections\/([a-z0-9_-]+)"/gi) || [])
    .map(h => h.replace(/href="\/collections\//i, '').replace('"', ''))
    .filter(h => h && h !== 'all' && h !== 'frontpage'));
  let collections = colHandles.size;
  let products = ((html.match(/href="\/products\/[a-z0-9_-]+"/gi) || []).length);

  // Shopify: si 0 collections depuis HTML, tente /collections.json avec headers navigateur
  if (cms === 'shopify' && collections === 0) {
    try {
      const cr = await fetch(`https://${domain}/collections.json?limit=250`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json,*/*',
          'Accept-Language': 'fr-FR,fr;q=0.9',
          'Referer': `https://${domain}/`,
        },
        signal: AbortSignal.timeout(6000),
      });
      if (cr.ok) {
        const cj = await cr.json();
        collections = cj.collections?.length || collections;
        if (products === 0 && collections > 0) {
          const handle = cj.collections?.find(c => c.handle && c.handle !== 'frontpage')?.handle;
          if (handle) {
            const pr = await fetch(`https://${domain}/collections/${handle}/products.json?limit=10`, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36' },
              signal: AbortSignal.timeout(5000),
            });
            if (pr.ok) { const pj = await pr.json(); products = (pj.products?.length || 0) * collections; }
          }
        }
      }
    } catch {}
  }

  // Fallback produits WC/PS depuis liens HTML
  if (products === 0 && cms !== 'shopify') {
    products = (html.match(/href="[^"]*\/(product|produit|article|item)[^"]*"/gi) || []).length;
  }

  let domain_age_years = 0;
  try {
    const ar = await fetch(`https://web.archive.org/cdx/search/cdx?url=${domain}&output=json&limit=1&fl=timestamp&from=20050101&to=20240101&filter=statuscode:200`, { signal: AbortSignal.timeout(5000) });
    if (ar.ok) {
      const aj = await ar.json();
      if (aj?.[1]?.[0]) {
        const year = parseInt(aj[1][0].slice(0, 4));
        domain_age_years = Math.max(0, new Date().getFullYear() - year);
      }
    }
  } catch {}

  return { online: true, http_status: status, cms, collections, products, domain_age_years };
}

function estimateTraffic(cms, collections, domain_age_years, products) {
  let base = 500;
  if (domain_age_years >= 5) base *= 10;
  else if (domain_age_years >= 3) base *= 5;
  else if (domain_age_years >= 1) base *= 2;
  if (cms === 'shopify') base *= 1.5;
  if (collections >= 50) base *= 3;
  else if (collections >= 20) base *= 2;
  else if (collections >= 10) base *= 1.5;
  if (products >= 200) base *= 2;
  return Math.round(base);
}

// ── Main discover pipeline ───────────────────────────────────────────────────
async function discover(niches_req, limit, ali_min_pct, auto_save, api_token, env) {
  const results = [];
  const seen = new Set();

  for (const niche_id of niches_req) {
    const niche = NICHES[niche_id];
    if (!niche) continue;

    const perNiche = Math.ceil(limit / niches_req.length);
    let domains = [];

    // Priorité 1 : OpenAI web search (utilise la clé OpenAI du vault)
    if (env.OPENAI_KEY) {
      const ai_domains = await openaiSearch(niche_id, niche, env.OPENAI_KEY, perNiche * 2);
      for (const d of ai_domains) { if (!seen.has(d)) { seen.add(d); domains.push(d); } }
    }

    // Fallback : dorks classiques via Google CSE / SerpAPI
    if (domains.length < perNiche) {
      for (const dork of niche.dorks) {
        const found = await searchDomains(dork, env, 10);
        for (const d of found) { if (!seen.has(d)) { seen.add(d); domains.push(d); } }
        await delay(350);
        if (domains.length >= perNiche * 3) break;
      }
    }

    for (const domain of domains.slice(0, perNiche)) {
      const site = await detectSite(domain);
      await delay(150);

      if (!site.online) continue;
      if (CMS_BAD.includes(site.cms)) continue;
      if (!CMS_OK.includes(site.cms) && site.cms !== 'unknown') continue;
      if (site.collections < 1 && site.products < 3) continue;

      const ali = await checkAliexpress(niche.ali_kw, env.GOOGLE_CSE_KEY, env.GOOGLE_CSE_CX);
      await delay(250);

      if (ali.pct < ali_min_pct) continue;

      const traffic = estimateTraffic(site.cms, site.collections, site.domain_age_years, site.products);
      const score   = scoresite(ali.pct, niche.cpc, traffic, site.cms, site.collections, site.domain_age_years);
      const comment = `AliExpress ${ali.pct}% (${ali.found}/${ali.total} kw) | CPC:${niche.cpc}€ | ${site.cms} | ${niche.ali_kw.slice(0,2).join(', ')}`;

      const boutique = {
        id: uid(), domain,
        type: site.cms, niche: niche_id,
        traffic, traffic_monthly: traffic, cpc: niche.cpc, score,
        collections: site.collections, products: site.products,
        importStatus: score >= 7.5 ? 'cloner' : score >= 6 ? 'qualified' : 'watch',
        comment,
        aliexpress_pct: ali.pct,
        aliexpress_detail: { found: ali.found, total: ali.total, keywords_checked: niche.ali_kw.slice(0,4) },
        aliexpress_checked_at: Date.now(),
        domain_age_years: site.domain_age_years, online: true, http_status: site.http_status,
        footprint: false, blueprint: null, sites: [], jobs: [], images: [],
        keywords: niche.ali_kw.slice(0, 3).map(k => ({ keyword: k, volume: 500, cpc: niche.cpc })),
        createdAt: Date.now(), updatedAt: Date.now(),
      };

      results.push(boutique);

      if (auto_save && api_token) {
        try {
          await fetch(`${BUILD_API}/boutiques`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${api_token}` },
            body: JSON.stringify(boutique),
          });
        } catch {}
      }
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const [,, action] = url.pathname.split('/');

    if (action === 'health') {
      return ok({
        status: 'up', niches: Object.keys(NICHES), version: '5.0',
        openai: !!env.OPENAI_KEY,
        google_cse: !!(env.GOOGLE_CSE_KEY && env.GOOGLE_CSE_CX),
        serp_api: !!env.SERP_API_KEY,
        total_dorks: Object.values(NICHES).reduce((s,n) => s + n.dorks.length, 0),
      });
    }

    if (action === 'niches') {
      return ok({ niches: Object.entries(NICHES).map(([id, n]) => ({ id, cpc: n.cpc, dorks: n.dorks.length, keywords: n.ali_kw.length })) });
    }

    if (action === 'discover' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch {}

      const has_openai = !!env.OPENAI_KEY;
      const has_google = !!(env.GOOGLE_CSE_KEY && env.GOOGLE_CSE_CX);
      const has_serp   = !!env.SERP_API_KEY;
      if (!has_openai && !has_google && !has_serp) {
        return fail('OPENAI_KEY requis — configure le secret dans le worker CF (clé déjà dans le vault V35)', 400);
      }

      const niches_req = body.niches?.length ? body.niches.filter(n => NICHES[n]) : Object.keys(NICHES);
      const limit       = Math.min(body.limit || 20, 50);
      const ali_min_pct = body.ali_min_pct ?? 60;
      const auto_save   = body.auto_save ?? false;
      const api_token   = env.API_TOKEN || body.api_token || '';

      const sites = await discover(niches_req, limit, ali_min_pct, auto_save, api_token, env);

      return ok({ found: sites.length, niches_scanned: niches_req, ali_threshold: ali_min_pct, auto_saved: auto_save, sites });
    }

    if (action === 'debug' && request.method === 'GET') {
      const dork = url.searchParams.get('q') || '"powered by shopify" "bijoux" site:.fr';
      const serp = await serpSearch(dork, env.SERP_API_KEY, 5);
      const goog = await googleSearch(dork, env.GOOGLE_CSE_KEY, env.GOOGLE_CSE_CX, 5);
      const testDomain = serp[0] || goog[0] || null;
      const site = testDomain ? await detectSite(testDomain) : null;
      return ok({ dork, serp_domains: serp, google_domains: goog, test_domain: testDomain, site });
    }

    if (action === 'qualify' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch {}
      const { domain, niche } = body;
      if (!domain) return fail('domain required');

      const gkey = env.GOOGLE_CSE_KEY || body.google_key || '';
      const gcx  = env.GOOGLE_CSE_CX  || body.google_cx  || '';
      const niche_cfg = NICHES[niche] || NICHES.mode;
      const [site, ali] = await Promise.all([
        detectSite(domain),
        checkAliexpress(niche_cfg.ali_kw, gkey, gcx),
      ]);
      const traffic = estimateTraffic(site.cms, site.collections, site.domain_age_years, site.products);
      const score   = scoresite(ali.pct, niche_cfg.cpc, traffic, site.cms, site.collections, site.domain_age_years);

      return ok({ domain, niche, score, ali_pct: ali.pct, ...site, traffic });
    }

    // ── POST /api/qualify-batch ───────────────────────────────────────────────
    if (action === 'qualify-batch' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch {}
      const { domains = [], niche = 'mode', min_score = 0 } = body;
      if (!domains.length) return fail('domains[] required');
      const batch = domains.slice(0, 30); // max 30 par appel (CPU limit CF)

      const gkey = env.GOOGLE_CSE_KEY || '';
      const gcx  = env.GOOGLE_CSE_CX  || '';
      const niche_cfg = NICHES[niche] || NICHES.mode;

      const ali = await checkAliexpress(niche_cfg.ali_kw, gkey, gcx);

      const results = [];
      for (const rawDomain of batch) {
        const domain = rawDomain.replace(/^https?:\/\/(www\.)?/, '').split('/')[0].toLowerCase().trim();
        if (!domain || BLACKLIST.test(domain)) continue;
        const site = await detectSite(domain);
        await delay(100);
        if (!site.online) { results.push({ domain, ok: false, reason: 'offline' }); continue; }
        if (CMS_BAD.includes(site.cms)) { results.push({ domain, ok: false, reason: 'cms_bad' }); continue; }
        const traffic = estimateTraffic(site.cms, site.collections, site.domain_age_years, site.products);
        const score   = scoresite(ali.pct, niche_cfg.cpc, traffic, site.cms, site.collections, site.domain_age_years);
        if (score < min_score) { results.push({ domain, ok: false, score, reason: 'score_low' }); continue; }

        const boutique = {
          id: uid(), domain,
          type: site.cms || 'unknown', niche,
          traffic, traffic_monthly: traffic, cpc: niche_cfg.cpc, score,
          collections: site.collections, products: site.products,
          importStatus: score >= 7.5 ? 'cloner' : score >= 6 ? 'qualified' : 'watch',
          comment: `AliExpress ${ali.pct}% | CPC:${niche_cfg.cpc}€ | ${site.cms} | batch import`,
          aliexpress_pct: ali.pct,
          aliexpress_checked_at: Date.now(),
          domain_age_years: site.domain_age_years, online: true, http_status: site.http_status,
          footprint: false, blueprint: null, sites: [], jobs: [], images: [],
          keywords: niche_cfg.ali_kw.slice(0,3).map(k => ({ keyword: k, volume: 500, cpc: niche_cfg.cpc })),
          createdAt: Date.now(), updatedAt: Date.now(),
        };
        results.push({ domain, ok: true, score, cms: site.cms, collections: site.collections, importStatus: boutique.importStatus, boutique });
      }

      return ok({ total: batch.length, qualified: results.filter(r => r.ok).length, results });
    }

    return fail('Not found', 404);
  },
};
