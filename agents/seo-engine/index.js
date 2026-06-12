// V35 SEO Engine — sitemap, schema.org, hreflang, robots, canonical
// No secrets required — pure logic + KV

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};
function ok(d, ct='application/json') {
  return new Response(typeof d === 'string' ? d : JSON.stringify({ ok:true, ...d }), {
    headers: { ...CORS, 'Content-Type': ct }
  });
}
function err(msg, s=400) {
  return new Response(JSON.stringify({ ok:false, error:msg }), {
    status:s, headers:{ ...CORS, 'Content-Type':'application/json' }
  });
}

const LANGS = ['fr','de','es','it','en','nl','pt'];
const HREFLANG_MAP = { fr:'fr-FR', de:'de-DE', es:'es-ES', it:'it-IT', en:'en-GB', nl:'nl-NL', pt:'pt-PT' };

function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }

// Subdomain-based hreflang: de.boutique.fr, www.boutique.fr
function subdomainUrl(domain, lang, path, defaultLang='fr') {
  const sub = lang === defaultLang ? 'www' : lang;
  return `https://${sub}.${domain}${path}`;
}

function hreflangTags(baseUrl, path, langs, domain='') {
  if (domain) {
    // Subdomain mode
    return langs.map(l =>
      `<link rel="alternate" hreflang="${HREFLANG_MAP[l]||l}" href="${subdomainUrl(domain,l,path)}">`
    ).join('\n') + `\n<link rel="alternate" hreflang="x-default" href="${subdomainUrl(domain,langs[0],path)}">`;
  }
  // Path-prefix fallback (legacy)
  return langs.map(l =>
    `<link rel="alternate" hreflang="${HREFLANG_MAP[l]||l}" href="${baseUrl}/${l}${path}">`
  ).join('\n') + `\n<link rel="alternate" hreflang="x-default" href="${baseUrl}/${langs[0]}${path}">`;
}

// Product schema.org JSON-LD
function productSchema({ name, description, price, currency='EUR', image, domain, sku, collection }) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description,
    image: image ? [image] : undefined,
    sku: sku || slugify(name),
    brand: { '@type':'Brand', name: domain?.replace(/\.(fr|com|de|es|net)$/,'') || 'Boutique' },
    offers: {
      '@type': 'Offer',
      price: price || '0',
      priceCurrency: currency,
      availability: 'https://schema.org/InStock',
      url: `https://www.${domain}/produit/${slugify(name)}`,
    },
    ...(collection ? { category: collection } : {}),
  }, null, 2);
}

// Collection/Category schema
function collectionSchema({ name, description, domain, lang='fr', products=[] }) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    description,
    url: `https://${lang === 'fr' ? 'www' : lang}.${domain}/collection/${slugify(name)}`,
    ...(products.length ? {
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: products.slice(0,10).map((p,i) => ({
          '@type': 'ListItem', position: i+1,
          item: { '@type':'Product', name:p.name||p, url:`https://${lang === 'fr' ? 'www' : lang}.${domain}/produit/${slugify(p.name||p)}` }
        }))
      }
    } : {}),
  }, null, 2);
}

// Organization + WebSite schema for homepage
function orgSchema({ domain, name, niche, lang='fr' }) {
  const baseUrl = `https://${domain}`;
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${baseUrl}/#org`,
        name: name || domain.replace(/\.(fr|com|de|es)$/,''),
        url: baseUrl,
        sameAs: [],
      },
      {
        '@type': 'WebSite',
        '@id': `${baseUrl}/#website`,
        url: baseUrl,
        name: name || domain,
        inLanguage: HREFLANG_MAP[lang] || lang,
        publisher: { '@id': `${baseUrl}/#org` },
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type':'EntryPoint', urlTemplate:`https://${lang === 'fr' ? 'www' : lang}.${domain}/recherche?q={search_term_string}` },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'WebPage',
        '@id': `https://${lang === 'fr' ? 'www' : lang}.${domain}/#webpage`,
        url: `https://${lang === 'fr' ? 'www' : lang}.${domain}/`,
        name: `${name || domain} — ${niche}`,
        isPartOf: { '@id': `${baseUrl}/#website` },
        about: { '@id': `${baseUrl}/#org` },
        inLanguage: HREFLANG_MAP[lang] || lang,
      }
    ]
  }, null, 2);
}

// Generate sitemap.xml — subdomain architecture
// domain: boutique.fr → www.boutique.fr (FR), de.boutique.fr (DE), etc.
function getLangBase(domain, lang, defaultLang='fr') {
  const sub = lang === defaultLang ? 'www' : lang;
  return `https://${sub}.${domain}`;
}

function generateSitemap(domain, langs, collections, products=[]) {
  const urls = [];
  const now = new Date().toISOString().split('T')[0];

  langs.forEach(lang => {
    const base = getLangBase(domain, lang);
    urls.push({ loc:`${base}/`, priority:'1.0', freq:'weekly', lastmod:now, lang });
    collections.forEach(col => {
      urls.push({ loc:`${base}/collection/${slugify(col.name||col)}`, priority:'0.8', freq:'weekly', lastmod:now, lang, path:`/collection/${slugify(col.name||col)}` });
    });
    products.slice(0,1000).forEach(p => {
      urls.push({ loc:`${base}/produit/${slugify(p.name||p)}`, priority:'0.6', freq:'monthly', lastmod:now, lang, path:`/produit/${slugify(p.name||p)}` });
    });
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.priority}</priority>
    ${u.path ? langs.map(l=>`<xhtml:link rel="alternate" hreflang="${HREFLANG_MAP[l]||l}" href="${getLangBase(domain,l)}${u.path}" />`).join('\n    ') : ''}
  </url>`).join('\n')}
</urlset>`;
  return xml;
}

// robots.txt
function generateRobots(domain, langs) {
  return `User-agent: *
Allow: /

# Sitemaps
Sitemap: https://www.${domain}/sitemap.xml
${langs.map(l=>`Sitemap: https://${l}.${domain}/sitemap.xml`).join('\n')}

# Block admin/dev paths
Disallow: /admin/
Disallow: /api/
Disallow: /_/
Disallow: /checkout/
Disallow: /cart/
Disallow: /search?
Disallow: /*?sort=*
Disallow: /*?filter=*
Disallow: /*?page=*&*

# Crawl-delay (be gentle)
Crawl-delay: 1
`;
}

// HTML head SEO block (meta + hreflang + canonical)
function generateHead({ title, description, canonical, domain, path='/', langs, ogImage='' }) {
  const baseUrl = `https://${domain}`;
  return `<!-- SEO: generated by v35-seo-engine -->
<title>${title}</title>
<meta name="description" content="${description.replace(/"/g,'&quot;')}">
<link rel="canonical" href="${canonical||baseUrl+path}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description.replace(/"/g,'&quot;')}">
<meta property="og:url" content="${canonical||baseUrl+path}">
<meta property="og:type" content="website">
${ogImage?`<meta property="og:image" content="${ogImage}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description.replace(/"/g,'&quot;')}">
${langs ? hreflangTags(baseUrl, path, langs) : ''}`;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers:CORS });
    const url = new URL(request.url);
    const [,, resource] = url.pathname.split('/');
    let body = {};
    if (request.method === 'POST') { try { body = await request.json(); } catch {} }

    // ── /api/health ──────────────────────────────────────────────────────────
    if (resource === 'health') return ok({ status:'ok' });

    // ── /api/sitemap ─────────────────────────────────────────────────────────
    // body: { domain, langs[], collections[], products[] }
    if (resource === 'sitemap') {
      const { domain, langs=LANGS, collections=[], products=[] } = body;
      if (!domain) return err('domain required');
      const xml = generateSitemap(domain, langs, collections, products);
      return ok(xml, 'application/xml');
    }

    // ── /api/robots ──────────────────────────────────────────────────────────
    if (resource === 'robots') {
      const { domain, langs=LANGS } = body;
      if (!domain) return err('domain required');
      return ok(generateRobots(domain, langs), 'text/plain');
    }

    // ── /api/head ────────────────────────────────────────────────────────────
    // Returns SEO HTML head block
    if (resource === 'head') {
      const html = generateHead(body);
      return ok({ html });
    }

    // ── /api/schema/product ──────────────────────────────────────────────────
    if (resource === 'schema' && url.pathname.includes('product')) {
      return ok({ schema: productSchema(body) });
    }

    // ── /api/schema/collection ───────────────────────────────────────────────
    if (resource === 'schema' && url.pathname.includes('collection')) {
      return ok({ schema: collectionSchema(body) });
    }

    // ── /api/schema/org ──────────────────────────────────────────────────────
    if (resource === 'schema' && url.pathname.includes('org')) {
      return ok({ schema: orgSchema(body) });
    }

    // ── /api/full ────────────────────────────────────────────────────────────
    // Complete SEO package for a site
    // body: { domain, niche, langs[], collections[], products[], meta:{title,description} }
    if (resource === 'full') {
      const { domain, niche='mode', langs=LANGS.slice(0,3), collections=[], products=[], meta={} } = body;
      if (!domain) return err('domain required');
      const baseUrl = `https://${domain}`;
      const sitemap = generateSitemap(domain, langs, collections, products);
      const robots = generateRobots(baseUrl, langs);
      const orgSchemaJson = orgSchema({ domain, niche, lang:langs[0]||'fr' });

      // Head block per language
      const heads = {};
      langs.forEach(lang => {
        heads[lang] = generateHead({
          title: meta.title || `${niche.charAt(0).toUpperCase()+niche.slice(1)} — ${domain}`,
          description: meta.description || `Découvrez notre boutique ${niche}`,
          canonical: `${baseUrl}/${lang}/`,
          domain, path:`/${lang}/`, langs,
        });
      });

      // Hreflang map
      const hreflangMap = {};
      langs.forEach(l => { hreflangMap[l] = `${baseUrl}/${l}/`; });

      // Cache in KV
      if (env.KV) {
        await env.KV.put(`seo:${domain}`, JSON.stringify({ sitemap, robots, orgSchema:orgSchemaJson, heads, hreflangMap }), { expirationTtl:86400 });
      }

      return ok({ sitemap, robots, orgSchema:orgSchemaJson, heads, hreflangMap, domain, langs });
    }

    return err('Not found', 404);
  }
};
