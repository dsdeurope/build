// V35 Site Enhancer — AI-drives all future shops
// POST /enhance  → run full AI pipeline on a generated shop
// POST /rebuild  → regenerate + enhance in one call
// POST /blog-ai  → generate AI blog articles for a shop
// POST /cro-ai   → generate CRO blocks for a shop
// POST /status   → check enhancement status for a slug

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};
const ok  = (d,s=200) => new Response(JSON.stringify({ok:true,...d}),{status:s,headers:{'Content-Type':'application/json',...CORS}});
const err = (m,s=400) => new Response(JSON.stringify({ok:false,error:m}),{status:s,headers:{'Content-Type':'application/json',...CORS}});

// ── Helpers ──────────────────────────────────────────────────────────────
async function ai(env, resource, body) {
  const r = await fetch(`${env.CONTENT_AI_URL}/api/${resource}`, {
    method: 'POST',
    headers: {'Content-Type':'application/json', 'Authorization': `Bearer ${env.API_TOKEN||''}`},
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  if (!r.ok) throw new Error(`content-ai/${resource} → ${r.status}`);
  return r.json();
}

async function r2put(env, key, html, ct='text/html;charset=UTF-8') {
  await env.R2.put(key, html, {httpMetadata:{contentType:ct}});
}

async function r2get(env, key) {
  const obj = await env.R2.get(key);
  if (!obj) return null;
  return new Response(obj.body).text();
}

// Inject content into existing HTML at a marker or replace a section
function injectAfter(html, marker, injection) {
  const idx = html.indexOf(marker);
  if (idx === -1) return html + injection;
  return html.slice(0, idx + marker.length) + injection + html.slice(idx + marker.length);
}

function replaceSection(html, startTag, endTag, newContent) {
  const s = html.indexOf(startTag);
  const e = html.indexOf(endTag, s);
  if (s === -1 || e === -1) return html;
  return html.slice(0, s) + newContent + html.slice(e + endTag.length);
}

// ── Build AI-enhanced homepage content ───────────────────────────────────
async function enhanceHomepage(env, slug, domain, niche, lang, collections) {
  const key = `${slug}/`;
  const html = await r2get(env, key);
  if (!html) return {skip:true, reason:'home page not found in R2'};

  const [homeData, cro, blocks] = await Promise.allSettled([
    ai(env, 'homepage', {domain, niche, lang, collections}),
    ai(env, 'cro', {product:{title:niche}, page_type:'homepage', lang, niche}),
    ai(env, 'blocks', {type:'value_props', context:{niche,domain}, lang, niche}),
  ]);

  let enhanced = html;

  // Inject AI hero content if homepage data arrived
  if (homeData.status === 'fulfilled' && homeData.value?.results?.[lang]) {
    const h = homeData.value.results[lang];
    if (h.hero?.title) {
      enhanced = enhanced.replace(
        /<h1>[^<]*<\/h1>/,
        `<h1>${h.hero.title}</h1>`
      );
    }
    if (h.meta?.title) {
      enhanced = enhanced.replace(/<title>[^<]*<\/title>/, `<title>${h.meta.title}</title>`);
    }
    if (h.meta?.description) {
      enhanced = enhanced.replace(
        /name="description" content="[^"]*"/,
        `name="description" content="${h.meta.description.replace(/"/g,'&quot;')}"`
      );
    }
  }

  // Inject CRO urgency badge before the first .btn-w
  if (cro.status === 'fulfilled' && cro.value?.cro?.social_proof_line) {
    const badge = `<div class="hero-trust" style="margin-top:.5rem;font-size:.73rem">${cro.value.cro.social_proof_line}</div>`;
    enhanced = enhanced.replace('</section>', badge + '</section>');
  }

  await r2put(env, key, enhanced);
  return {enhanced:true, key};
}

// ── Build AI-enhanced collection page ────────────────────────────────────
async function enhanceCollection(env, slug, col, domain, niche, lang) {
  const key = `${slug}${col.path}/`;
  const html = await r2get(env, key);
  if (!html) return {skip:true, reason:`${key} not found`};

  const [introData, cro] = await Promise.allSettled([
    ai(env, 'collections-intro', {categories:[col.title], lang, country:lang==='fr'?'France':'United Kingdom'}),
    ai(env, 'cro', {product:{title:col.title}, page_type:'collection', lang, niche}),
  ]);

  let enhanced = html;

  // Inject collection intro text below the hero
  if (introData.status === 'fulfilled') {
    const intro = introData.value?.result?.[0] || introData.value?.result;
    const item = Array.isArray(intro) ? intro[0] : intro;
    if (item?.short_description) {
      const introBlock = `<div style="max-width:720px;margin:0 auto;padding:1.5rem 1.5rem 0;text-align:center"><p style="color:#666;font-size:.92rem;line-height:1.85">${item.short_description}</p></div>`;
      // inject after the filter bar
      enhanced = injectAfter(enhanced, 'class="cf-in">', introBlock);
    }
  }

  // Inject CRO urgency strip above product grid
  if (cro.status === 'fulfilled' && cro.value?.cro?.urgency_badge) {
    const strip = `<div style="text-align:center;padding:.5rem;background:var(--a);font-size:.78rem;color:var(--pd);font-weight:600;letter-spacing:.05em">${cro.value.cro.urgency_badge}</div>`;
    enhanced = injectAfter(enhanced, 'class="pg4"', strip);
  }

  await r2put(env, key, enhanced);
  return {enhanced:true, key};
}

// ── Generate AI blog articles ─────────────────────────────────────────────
async function enhanceBlog(env, slug, domain, niche, lang, collections) {
  const topics = {
    'Jewellery': [
      {slug:'mens-jewellery-guide', en:'Men\'s Jewellery: How to Build a Refined Look', fr:'Bijoux homme : comment construire un look soigné'},
      {slug:'jewellery-care-guide', en:'How to Care for Your Jewellery: The Complete Guide', fr:'Entretenir ses bijoux : le guide complet'},
      {slug:'gifting-jewellery-guide', en:'Jewellery as a Gift: How to Choose Without Making Mistakes', fr:'Bijou en cadeau : comment choisir sans se tromper'},
    ],
    'default': [
      {slug:'style-guide', en:'Complete Style Guide for '+niche, fr:'Guide style complet — '+niche},
      {slug:'buying-guide', en:'How to Choose the Best '+niche+' Products', fr:'Comment choisir les meilleurs produits '+niche},
    ],
  };
  const topicList = (topics[niche]||topics['default']).slice(0,2);
  const results = [];

  for (const t of topicList) {
    const title = lang === 'en' ? t.en : t.fr;
    try {
      const res = await ai(env, 'blog-pillar', {title, niche, lang, domain, collections});
      if (res?.html) {
        // Wrap in site layout using the blog listing as template
        const blogKey = `${slug}/blog/`;
        const blogHtml = await r2get(env, blogKey);
        if (blogHtml) {
          // Extract head + nav + footer from existing blog page
          const bodyStart = blogHtml.indexOf('<div class="blog-h">');
          const bodyEnd = blogHtml.lastIndexOf('<footer');
          if (bodyStart > 0 && bodyEnd > 0) {
            const head = blogHtml.slice(0, bodyStart);
            const foot = blogHtml.slice(bodyEnd);
            const articlePage = head +
              `<div class="bc"><div class="bc-i"><a href="/">Home</a> › <a href="/blog/">Journal</a> › ${title}</div></div>` +
              `<div class="art-w"><div class="art">${res.html}</div></div>` +
              foot;
            const artKey = `${slug}/blog/${t.slug}/`;
            await r2put(env, artKey, articlePage);
            results.push({slug:t.slug, title, enhanced:true});
          }
        }
      }
    } catch(e) {
      results.push({slug:t.slug, title, error:e.message});
    }
  }

  return results;
}

// ── Full enhancement pipeline ─────────────────────────────────────────────
async function fullEnhance(env, body) {
  const {slug, domain, niche, lang='en', collections=[], enhance_blog=true, enhance_home=true, enhance_collections=false} = body;
  if (!slug || !domain) throw new Error('slug and domain required');

  const log = [];

  if (enhance_home) {
    try {
      const r = await enhanceHomepage(env, slug, domain, niche, lang, collections);
      log.push({step:'homepage', ...r});
    } catch(e) { log.push({step:'homepage', error:e.message}); }
  }

  if (enhance_collections && collections.length) {
    const colResults = await Promise.allSettled(
      collections.slice(0,3).map(col => enhanceCollection(env, slug, col, domain, niche, lang))
    );
    colResults.forEach((r,i) => log.push({step:`collection:${collections[i]?.title}`, ...(r.status==='fulfilled'?r.value:{error:r.reason?.message})}));
  }

  if (enhance_blog) {
    try {
      const blogResults = await enhanceBlog(env, slug, domain, niche, lang, collections);
      log.push({step:'blog', articles:blogResults});
    } catch(e) { log.push({step:'blog', error:e.message}); }
  }

  // Store enhancement log in KV
  await env.KV.put(`enhance:${slug}:log`, JSON.stringify({
    slug, domain, niche, lang,
    enhancedAt: new Date().toISOString(),
    steps: log,
  }), {expirationTtl: 86400 * 30}).catch(()=>{});

  return {slug, domain, niche, lang, steps: log, url:`${env.SITE_SERVER_URL}/${slug}/`};
}

// ── Main handler ──────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, {status:204, headers:CORS});
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const slug = url.searchParams.get('slug');
      if (!slug) return err('slug param required');
      const log = await env.KV.get(`enhance:${slug}:log`).catch(()=>null);
      return ok({slug, enhanced: !!log, log: log ? JSON.parse(log) : null});
    }
    if (request.method !== 'POST') return err('POST or GET only', 405);
    let body = {};
    try { body = await request.json(); } catch { return err('Invalid JSON'); }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/,'');

    try {
      // POST /rebuild — factory + enhance in one call
      if (path === '/rebuild') {
        const {blueprint, niche, domain, lang='en', enhance_blog=true} = body;
        if (!blueprint || !domain) return err('blueprint + domain required');
        // 1. Regenerate via factory
        const factRes = await fetch(`${env.SITE_FACTORY_URL}/`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({blueprint, niche, domain, lang}),
          signal: AbortSignal.timeout(60000),
        });
        const factData = await factRes.json();
        if (!factData.success) return err(`Factory error: ${factData.error}`);
        // 2. Enhance
        const enhData = await fullEnhance(env, {
          slug: factData.slug,
          domain, niche, lang,
          collections: blueprint.allCollections||[],
          enhance_blog,
          enhance_home: true,
          enhance_collections: false,
        });
        return ok({factory: factData, enhance: enhData, url: factData.url});
      }

      // POST /enhance — enhance existing shop
      if (path === '/enhance') {
        const result = await fullEnhance(env, body);
        return ok(result);
      }

      // POST /blog-ai — generate AI blog articles only
      if (path === '/blog-ai') {
        const {slug, domain, niche, lang='en', collections=[]} = body;
        if (!slug || !domain) return err('slug + domain required');
        const results = await enhanceBlog(env, slug, domain, niche, lang, collections);
        return ok({slug, articles: results});
      }

      // POST /cro-ai — generate CRO blocks for a specific page
      if (path === '/cro-ai') {
        const {slug, path:pagePath='/', product={}, page_type='product', lang='en', niche='mode'} = body;
        if (!slug) return err('slug required');
        const html = await r2get(env, `${slug}${pagePath}`);
        if (!html) return err('Page not found in R2');
        const cro = await ai(env, 'cro', {product, page_type, lang, niche});
        return ok({slug, path:pagePath, cro: cro.cro});
      }

      return err('Unknown endpoint. Use /enhance, /rebuild, /blog-ai, /cro-ai', 404);
    } catch(e) {
      return err(e.message, 500);
    }
  }
};
