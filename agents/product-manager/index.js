// V35 Product Manager — CRUD for product pages in R2
// POST /add      → add a product page (renders via factory + optionally AI-enhances)
// POST /update   → update existing product (price, description, variants)
// POST /delete   → remove product from R2 + update collection
// POST /bulk-add → import multiple products at once
// POST /ai-enhance → run content-ai /product-full on a product
// GET  /list?slug=x&collection=/collections/rings → list products
// GET  /get?slug=x&path=/collections/rings/ring-signature/ → get product meta

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};
const ok  = (d,s=200) => new Response(JSON.stringify({ok:true,...d}),{status:s,headers:{'Content-Type':'application/json',...CORS}});
const err = (m,s=400) => new Response(JSON.stringify({ok:false,error:m}),{status:s,headers:{'Content-Type':'application/json',...CORS}});

// ── Helpers ───────────────────────────────────────────────────────────────
const slugify = s => s.toLowerCase().replace(/[àáâä]/g,'a').replace(/[éèêë]/g,'e').replace(/[îï]/g,'i').replace(/[ôö]/g,'o').replace(/[ùûü]/g,'u').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

async function r2read(env, key) {
  const obj = await env.R2.get(key);
  if (!obj) return null;
  return new Response(obj.body).text();
}
async function r2write(env, key, html) {
  await env.R2.put(key, html, {httpMetadata:{contentType:'text/html;charset=UTF-8'}});
}

// Call factory /render to get product HTML
async function renderProduct(env, product, collection, niche, domain, lang) {
  const r = await fetch(`${env.FACTORY_URL}/render`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({type:'product', product, collection, niche, domain, lang}),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`Factory render failed: ${r.status}`);
  return r.text();
}

// Call content-ai /product-full to get AI content
async function aiProductFull(env, product, niche, lang, brandName) {
  const r = await fetch(`${env.CONTENT_AI_URL}/api/product-full`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({product, niche, lang, brandName}),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`content-ai product-full failed: ${r.status}`);
  const d = await r.json();
  return d.product_content;
}

// Inject AI content into rendered product HTML
function injectAIContent(html, ai) {
  let h = html;

  // Meta title
  if (ai.meta_title) h = h.replace(/<title>[^<]*<\/title>/, `<title>${esc(ai.meta_title)}</title>`);
  // Meta description
  if (ai.meta_description) h = h.replace(/name="description" content="[^"]*"/, `name="description" content="${esc(ai.meta_description)}"`);
  // H1
  if (ai.h1) h = h.replace(/<h1[^>]*>[^<]*<\/h1>/, `<h1>${esc(ai.h1)}</h1>`);
  // Short description (inject below rating or price row)
  if (ai.description_short) {
    const descBlock = `<p class="pdp-ai-desc" style="font-size:.88rem;color:#555;line-height:1.85;margin-bottom:1rem">${esc(ai.description_short)}</p>`;
    h = h.replace('class="pdp-price-row"', `placeholder-desc-inject class="pdp-price-row"`);
    h = h.replace('placeholder-desc-inject class="pdp-price-row"', `${descBlock}<div class="pdp-price-row"`).replace('<div class="pdp-price-row"', '<div class="pdp-price-row"');
  }
  // Bullet points — replace existing pdp-bullets
  if (ai.bullet_points?.length) {
    const bullets = ai.bullet_points.map(b => `<li><span class="pdp-check">✓</span>${esc(b)}</li>`).join('');
    h = h.replace(/<ul class="pdp-bullets">[\s\S]*?<\/ul>/, `<ul class="pdp-bullets">${bullets}</ul>`);
  }
  // FAQ tab — inject into tab-content for faq tab (t3)
  if (ai.faq?.length) {
    const faqHtml = ai.faq.map(f => `<div class="faq-item"><p class="faq-q">${esc(f.q)}</p><p class="faq-a">${esc(f.a)}</p></div>`).join('');
    h = h.replace(/<div id="t3" class="tab-content[^"]*">[\s\S]*?<\/div>(?=\s*<div id="t)/, `<div id="t3" class="tab-content"><div class="art-faq"><h2>FAQ</h2>${faqHtml}</div></div>`);
  }
  // Schema.org: inject richer product schema
  if (ai.description_short) {
    h = h.replace(/"description":"[^"]*"/, `"description":${JSON.stringify(ai.description_short)}`);
  }

  return h;
}

// Inject a product card into a collection HTML page
function injectCardIntoCollection(collHtml, product, productPath, lang) {
  const e = lang === 'en';
  const price = product.price || '0';
  const orig = product.orig || null;
  const badge = product.badge || '';
  const name = product.title;
  const em = product.emoji || '🛍️';

  const cardInner = `<div class="pc-img"><div class="pci">${em}</div>${badge?`<span class="pc-badge">${esc(badge)}</span>`:''}</div><div class="pc-bd"><p class="pc-nm">${esc(name)}</p><p class="pc-pr">€${price}${orig?`<span class="pc-orig">€${orig}</span>`:''}</p><button class="pc-btn" onclick="event.stopPropagation();location.href='/checkout/'">${e?'Add to Cart':'Ajouter'}</button></div>`;
  const card = `<a class="pcard" href="${productPath}" style="display:block;color:inherit">${cardInner}</a>`;

  // Insert before closing pg4 div
  if (collHtml.includes('</div></div></div>') && collHtml.includes('class="pg4"')) {
    return collHtml.replace(/<\/div>(\s*<\/div>\s*<section class="nl"|<\/div>\s*<footer)/, `${card}</div>$1`);
  }
  return collHtml;
}

// Remove product card from collection page
function removeCardFromCollection(collHtml, productPath) {
  // Remove the <a class="pcard" href="{productPath}"...>...</a>
  const pattern = new RegExp(`<a class="pcard"[^>]*href="${productPath.replace(/\//g,'\\/')}"[\\s\\S]*?<\\/a>`, 'g');
  return collHtml.replace(pattern, '');
}

// Update KV product index for a shop
async function updateProductIndex(env, slug, productPath, meta, remove=false) {
  const indexKey = `products:${slug}`;
  const raw = await env.KV.get(indexKey).catch(()=>null);
  const index = raw ? JSON.parse(raw) : {};
  if (remove) {
    delete index[productPath];
  } else {
    index[productPath] = {...meta, updatedAt: new Date().toISOString()};
  }
  await env.KV.put(indexKey, JSON.stringify(index), {expirationTtl: 86400*365}).catch(()=>{});
  return index;
}

// ── Main handler ──────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:CORS});

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/,'');

    // ── GET /list ─────────────────────────────────────────────────────────
    if (request.method === 'GET' && path === '/list') {
      const slug = url.searchParams.get('slug');
      const collection = url.searchParams.get('collection'); // optional filter
      if (!slug) return err('slug param required');
      const raw = await env.KV.get(`products:${slug}`).catch(()=>null);
      const index = raw ? JSON.parse(raw) : {};
      const filtered = collection
        ? Object.fromEntries(Object.entries(index).filter(([k]) => k.startsWith(collection)))
        : index;
      return ok({slug, collection, count: Object.keys(filtered).length, products: filtered});
    }

    // ── GET /get ──────────────────────────────────────────────────────────
    if (request.method === 'GET' && path === '/get') {
      const slug = url.searchParams.get('slug');
      const productPath = url.searchParams.get('path');
      if (!slug || !productPath) return err('slug and path params required');
      const r2Key = `${slug}${productPath}`;
      const html = await r2read(env, r2Key);
      if (!html) return err(`Product not found: ${r2Key}`, 404);
      // Extract basic meta from HTML
      const titleMatch = html.match(/<title>([^<]*)<\/title>/);
      const descMatch = html.match(/name="description" content="([^"]*)"/);
      const priceMatch = html.match(/<span class="pdp-price-now">€([\d.]+)<\/span>/);
      return ok({slug, path: productPath, title: titleMatch?.[1], description: descMatch?.[1], price: priceMatch?.[1]});
    }

    if (request.method !== 'POST') return err('POST or GET only', 405);
    let body = {};
    try { body = await request.json(); } catch { return err('Invalid JSON'); }

    // ── POST /add ─────────────────────────────────────────────────────────
    // { slug, domain, niche, lang, collection:{title,path}, product:{title,price,orig?,badge?,bullet_points?,description?,variants?,faq?}, ai_enhance:bool }
    if (path === '/add') {
      const {slug, domain, niche, lang='fr', collection, product, ai_enhance=false} = body;
      if (!slug||!domain||!collection||!product?.title||!product?.price) {
        return err('slug, domain, collection, product.title, product.price required');
      }
      const productSlug = product.slug || slugify(product.title);
      const productPath = `${collection.path}/${productSlug}/`;
      const r2Key = `${slug}${productPath}`;

      // 1. Optionally AI-enhance product content
      let aiContent = null;
      if (ai_enhance) {
        try {
          const brandName = domain.replace(/\.(fr|com|net|eu|io)$/,'').replace(/[-_]/g,' ');
          aiContent = await aiProductFull(env, product, niche, lang, brandName);
          // Merge AI content into product
          if (aiContent.bullet_points?.length) product.bullet_points = aiContent.bullet_points;
          if (aiContent.description_short) product.description = aiContent.description_short;
        } catch(e) { /* AI failed, continue with manual content */ }
      }

      // 2. Render HTML via factory
      let html;
      try {
        html = await renderProduct(env, product, collection, niche, domain, lang);
      } catch(e) {
        return err(`Render failed: ${e.message}`, 500);
      }

      // 3. Inject AI content if available
      if (aiContent) html = injectAIContent(html, aiContent);

      // 4. Store in R2
      await r2write(env, r2Key, html);

      // 5. Update collection page (add card)
      const collKey = `${slug}${collection.path}/`;
      const collHtml = await r2read(env, collKey);
      if (collHtml) {
        const updatedColl = injectCardIntoCollection(collHtml, {...product, emoji: product.emoji || '🛍️'}, productPath, lang);
        await r2write(env, collKey, updatedColl);
      }

      // 6. Update product index
      await updateProductIndex(env, slug, productPath, {
        title: product.title, price: product.price, orig: product.orig,
        badge: product.badge, collection: collection.path, lang, ai_enhanced: !!aiContent,
      });

      return ok({
        slug, product_path: productPath, url: `https://v35-site-server.ernestpedanou.workers.dev/${slug}${productPath}`,
        ai_enhanced: !!aiContent, collection_updated: !!collHtml,
      });
    }

    // ── POST /update ──────────────────────────────────────────────────────
    // { slug, product_path, updates:{title?,price?,orig?,badge?,description?,bullet_points?,variants?,faq?} }
    if (path === '/update') {
      const {slug, product_path, updates={}, ai_re_enhance=false} = body;
      if (!slug || !product_path) return err('slug and product_path required');

      const r2Key = `${slug}${product_path.endsWith('/')?product_path:product_path+'/'}`;
      let html = await r2read(env, r2Key);
      if (!html) return err(`Product not found: ${r2Key}`, 404);

      // Apply text-based updates
      if (updates.title) {
        html = html.replace(/<h1[^>]*>[^<]*<\/h1>/, `<h1>${esc(updates.title)}</h1>`);
        html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(updates.title)}</title>`);
      }
      if (updates.price) {
        html = html.replace(/<span class="pdp-price-now">€[\d.]+<\/span>/, `<span class="pdp-price-now">€${parseFloat(updates.price).toFixed(2)}</span>`);
        html = html.replace(/(— €)[\d.]+(<\/span><\/button>)/, `$1${parseFloat(updates.price).toFixed(2)}$2`);
        html = html.replace(/"price":"[\d.]+"/, `"price":"${parseFloat(updates.price).toFixed(2)}"`);
      }
      if (updates.orig) {
        if (html.includes('pdp-price-orig')) {
          html = html.replace(/<span class="pdp-price-orig">€[\d.]+<\/span>/, `<span class="pdp-price-orig">€${parseFloat(updates.orig).toFixed(2)}</span>`);
        }
      }
      if (updates.badge) {
        html = html.replace(/<span class="pc-badge">[^<]*<\/span>/, `<span class="pc-badge">${esc(updates.badge)}</span>`);
      }
      if (updates.description) {
        const p = `<p class="pdp-ai-desc"[^>]*>[^<]*<\/p>`;
        const replacement = `<p class="pdp-ai-desc" style="font-size:.88rem;color:#555;line-height:1.85;margin-bottom:1rem">${esc(updates.description)}</p>`;
        html = html.includes('pdp-ai-desc') ? html.replace(new RegExp(p), replacement) : html;
      }
      if (updates.bullet_points?.length) {
        const bullets = updates.bullet_points.map(b => `<li><span class="pdp-check">✓</span>${esc(b)}</li>`).join('');
        html = html.replace(/<ul class="pdp-bullets">[\s\S]*?<\/ul>/, `<ul class="pdp-bullets">${bullets}</ul>`);
      }

      // AI re-enhance if requested
      if (ai_re_enhance && body.niche && body.lang) {
        try {
          const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
          const priceMatch = html.match(/<span class="pdp-price-now">€([\d.]+)<\/span>/);
          const product = {title: titleMatch?.[1]||'', price: priceMatch?.[1]||'', ...updates};
          const ai = await aiProductFull(env, product, body.niche, body.lang, body.brand||'');
          html = injectAIContent(html, ai);
        } catch(e) { /* continue */ }
      }

      await r2write(env, r2Key, html);

      // Update collection card if price changed
      if (updates.price || updates.badge || updates.orig) {
        const parts = r2Key.replace(/\/+$/,'').split('/');
        const collKey = parts.slice(0,-1).join('/') + '/';
        const collHtml = await r2read(env, collKey);
        if (collHtml) {
          // Update card price in collection
          let coll = collHtml;
          const prodHref = `/${r2Key.split('/').slice(1).join('/')}`;
          const cardRe = new RegExp(`(<a class="pcard"[^>]*href="${prodHref.replace(/\//g,'\\/')}"[^>]*>[\\s\\S]*?)(€[\\d.]+)([\\s\\S]*?<\\/a>)`);
          if (updates.price) coll = coll.replace(cardRe, (m,pre,price,post) => `${pre}€${parseFloat(updates.price).toFixed(2)}${post}`);
          await r2write(env, collKey, coll);
        }
      }

      // Update index
      const raw = await env.KV.get(`products:${slug}`).catch(()=>null);
      const index = raw ? JSON.parse(raw) : {};
      const normPath = product_path.endsWith('/')?product_path:product_path+'/';
      if (index[normPath]) Object.assign(index[normPath], updates, {updatedAt: new Date().toISOString()});
      await env.KV.put(`products:${slug}`, JSON.stringify(index), {expirationTtl:86400*365}).catch(()=>{});

      return ok({slug, product_path, updated: Object.keys(updates)});
    }

    // ── POST /delete ──────────────────────────────────────────────────────
    // { slug, product_path, collection_path }
    if (path === '/delete') {
      const {slug, product_path, collection_path} = body;
      if (!slug || !product_path) return err('slug and product_path required');

      const r2Key = `${slug}${product_path.endsWith('/')?product_path:product_path+'/'}`;
      await env.R2.delete(r2Key).catch(()=>{});

      // Remove card from collection
      if (collection_path) {
        const collKey = `${slug}${collection_path.endsWith('/')?collection_path:collection_path+'/'}`;
        const collHtml = await r2read(env, collKey);
        if (collHtml) {
          const cleanPath = product_path.endsWith('/')?product_path:product_path+'/';
          const updated = removeCardFromCollection(collHtml, cleanPath);
          await r2write(env, collKey, updated);
        }
      }

      await updateProductIndex(env, slug, product_path.endsWith('/')?product_path:product_path+'/', {}, true);
      return ok({slug, product_path, deleted: true});
    }

    // ── POST /bulk-add ────────────────────────────────────────────────────
    // { slug, domain, niche, lang, collection:{title,path}, products:[{title,price,...}], ai_enhance:bool }
    if (path === '/bulk-add') {
      const {slug, domain, niche, lang='fr', collection, products=[], ai_enhance=false} = body;
      if (!slug||!domain||!collection||!products.length) return err('slug, domain, collection, products[] required');
      if (products.length > 20) return err('Max 20 products per bulk request');

      const results = [];
      for (const product of products) {
        if (!product.title || !product.price) { results.push({title:product.title||'?', status:'skipped', reason:'missing title or price'}); continue; }
        try {
          const productSlug = product.slug || slugify(product.title);
          const productPath = `${collection.path}/${productSlug}/`;
          const r2Key = `${slug}${productPath}`;

          let html = await renderProduct(env, product, collection, niche, domain, lang);
          if (ai_enhance) {
            try {
              const ai = await aiProductFull(env, product, niche, lang, domain.replace(/\..+$/,''));
              html = injectAIContent(html, ai);
              if (ai.bullet_points?.length) product.bullet_points = ai.bullet_points;
            } catch {}
          }
          await r2write(env, r2Key, html);
          await updateProductIndex(env, slug, productPath, {title:product.title, price:product.price, collection:collection.path, lang});
          results.push({title:product.title, product_path:productPath, status:'added'});
        } catch(e) {
          results.push({title:product.title, status:'error', reason:e.message});
        }
      }

      // Rebuild collection page with all new cards
      const collKey = `${slug}${collection.path}/`;
      let collHtml = await r2read(env, collKey);
      if (collHtml) {
        for (const r of results.filter(r=>r.status==='added')) {
          const prod = products.find(p=>r.title===p.title);
          if (prod) collHtml = injectCardIntoCollection(collHtml, {...prod, emoji:prod.emoji||'🛍️'}, r.product_path, lang);
        }
        await r2write(env, collKey, collHtml);
      }

      const added = results.filter(r=>r.status==='added').length;
      const errors = results.filter(r=>r.status==='error').length;
      return ok({slug, collection:collection.path, added, errors, results});
    }

    // ── POST /ai-enhance ─────────────────────────────────────────────────
    // { slug, product_path, niche, lang, brand? }
    // Runs /product-full and injects into existing page
    if (path === '/ai-enhance') {
      const {slug, product_path, niche, lang='fr', brand=''} = body;
      if (!slug||!product_path||!niche) return err('slug, product_path, niche required');

      const r2Key = `${slug}${product_path.endsWith('/')?product_path:product_path+'/'}`;
      const html = await r2read(env, r2Key);
      if (!html) return err(`Product not found: ${r2Key}`, 404);

      // Extract product title + price from page
      const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
      const priceMatch = html.match(/<span class="pdp-price-now">€([\d.]+)<\/span>/);
      const product = {title: titleMatch?.[1]||'', price: priceMatch?.[1]||''};

      const ai = await aiProductFull(env, product, niche, lang, brand);
      const enhanced = injectAIContent(html, ai);
      await r2write(env, r2Key, enhanced);

      // Update index
      await updateProductIndex(env, slug, product_path.endsWith('/')?product_path:product_path+'/', {ai_enhanced:true, ai_at:new Date().toISOString()});
      return ok({slug, product_path, ai_enhanced:true, content_keys: Object.keys(ai).filter(k=>ai[k])});
    }

    return err('Unknown endpoint. Use /add, /update, /delete, /bulk-add, /ai-enhance, /list, /get', 404);
  }
};
