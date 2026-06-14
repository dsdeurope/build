// V35 Price Manager
// POST /product  — update price on one product page + its parent collection card
// POST /batch    — multiple products at once
// POST /global   — % discount or markup on all prices across an entire shop
// POST /restore  — restore original prices from snapshot
// GET  /audit    — list all prices found across a shop
// GET  /history  — price change history for a shop

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};
const ok  = (d,s=200) => new Response(JSON.stringify({ok:true,...d}),{status:s,headers:{'Content-Type':'application/json',...CORS}});
const err = (m,s=400) => new Response(JSON.stringify({ok:false,error:m}),{status:s,headers:{'Content-Type':'application/json',...CORS}});

// ── R2 helpers ────────────────────────────────────────────────────────────
async function r2read(env, key) {
  const obj = await env.R2.get(key);
  if (!obj) return null;
  return new Response(obj.body).text();
}

async function r2write(env, key, html) {
  await env.R2.put(key, html, {httpMetadata:{contentType:'text/html;charset=UTF-8'}});
}

// List all R2 keys for a shop slug (HTML pages only)
async function listShopKeys(env, slug) {
  const prefix = `${slug}/`;
  const keys = [];
  let cursor;
  do {
    const res = await env.R2.list({prefix, cursor, limit:1000});
    for (const obj of res.objects) {
      // Only HTML pages, skip .xml, .txt, .json
      if (!obj.key.match(/\.(xml|txt|json)$/)) keys.push(obj.key);
    }
    cursor = res.truncated ? res.cursor : null;
  } while (cursor);
  return keys;
}

// ── Price parsing ─────────────────────────────────────────────────────────
// Extract all prices from an HTML page
function extractPrices(html, key) {
  const prices = [];
  // pdp-price-now → product page current price
  const pdpNow = html.match(/<span class="pdp-price-now">€([\d.]+)<\/span>/);
  if (pdpNow) prices.push({type:'pdp-now', price:parseFloat(pdpNow[1])});
  // pdp-price-orig → product page original (strikethrough)
  const pdpOrig = html.match(/<span class="pdp-price-orig">€([\d.]+)<\/span>/);
  if (pdpOrig) prices.push({type:'pdp-orig', price:parseFloat(pdpOrig[1])});
  // pc-pr → product card (collection page)
  const pcPrices = [...html.matchAll(/<p class="pc-pr">€([\d.]+)/g)];
  pcPrices.forEach(m => prices.push({type:'card', price:parseFloat(m[1])}));
  // schema price
  const schema = html.match(/"price":"([\d.]+)"/);
  if (schema) prices.push({type:'schema', price:parseFloat(schema[1])});
  // add-to-cart button
  const cartBtn = html.match(/— €([\d.]+)<\/span><\/button>/);
  if (cartBtn) prices.push({type:'cart-btn', price:parseFloat(cartBtn[1])});
  return {key, prices};
}

// ── Price mutation helpers ────────────────────────────────────────────────

// Apply new price to a product page (PDP)
function applyProductPrice(html, newPrice, origPrice, badge) {
  const np = parseFloat(newPrice).toFixed(2);
  const op = origPrice ? parseFloat(origPrice).toFixed(2) : null;
  let h = html;

  // 1. pdp-price-now
  h = h.replace(/<span class="pdp-price-now">€[\d.]+<\/span>/, `<span class="pdp-price-now">€${np}</span>`);

  // 2. pdp-price-orig — set or remove
  if (op) {
    if (h.includes('pdp-price-orig')) {
      h = h.replace(/<span class="pdp-price-orig">€[\d.]+<\/span>/, `<span class="pdp-price-orig">€${op}</span>`);
    } else {
      // inject orig after price-now
      h = h.replace(
        /(<span class="pdp-price-now">€[\d.]+<\/span>)/,
        `$1<span class="pdp-price-orig">€${op}</span>`
      );
    }
  } else {
    // remove orig if no origPrice given
    h = h.replace(/<span class="pdp-price-orig">€[\d.]+<\/span>/, '');
  }

  // 3. pdp-price-save — recalculate if both prices known
  if (op) {
    const save = (parseFloat(op) - parseFloat(np)).toFixed(2);
    if (h.includes('pdp-price-save')) {
      h = h.replace(/<span class="pdp-price-save">.*?<\/span>/, `<span class="pdp-price-save">−€${save}</span>`);
    } else {
      h = h.replace(
        /(<span class="pdp-price-orig">€[\d.]+<\/span>)/,
        `$1<span class="pdp-price-save">−€${save}</span>`
      );
    }
  } else {
    h = h.replace(/<span class="pdp-price-save">.*?<\/span>/, '');
  }

  // 4. Add to Cart button price
  h = h.replace(/(— €)[\d.]+(<\/span><\/button>)/, `$1${np}$2`);

  // 5. Badge (SALE, PROMO, etc.)
  if (badge) {
    if (h.includes('pc-badge')) {
      h = h.replace(/<span class="pc-badge">[^<]*<\/span>/, `<span class="pc-badge">${badge}</span>`);
    }
    // pdp badge / social proof
  } else if (op) {
    // auto-add SALE if discount
    if (!h.includes('pc-badge')) {
      h = h.replace(/<\/span>(<div class="pc-bd">)/, `</span><span class="pc-badge">SALE</span>$1`);
    }
  }

  // 6. Schema.org price
  h = h.replace(/"price":"[\d.]+"/, `"price":"${np}"`);

  return h;
}

// Apply new price to a product card inside a collection/home page
function applyCardPrice(html, productName, newPrice, origPrice, badge) {
  // Find the card by product name
  const slug = productName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
  // Pattern: within a pcard link href containing the slug
  const cardPattern = new RegExp(
    `(<a class="pcard"[^>]*href="[^"]*${slug}[^"]*"[^>]*>)([\\s\\S]*?)(<\/a>)`,
    'g'
  );
  const np = parseFloat(newPrice).toFixed(2);
  const op = origPrice ? parseFloat(origPrice).toFixed(2) : null;

  return html.replace(cardPattern, (match, open, inner, close) => {
    let newInner = inner;
    // Update pc-pr price
    newInner = newInner.replace(/>€[\d.]+(<span class="pc-orig"|<\/p>)/, `>€${np}$1`);
    // Update or add pc-orig
    if (op) {
      if (newInner.includes('pc-orig')) {
        newInner = newInner.replace(/<span class="pc-orig">€[\d.]+<\/span>/, `<span class="pc-orig">€${op}</span>`);
      } else {
        newInner = newInner.replace(`>€${np}</p>`, `>€${np}<span class="pc-orig">€${op}</span></p>`);
      }
    }
    // Badge
    if (badge) {
      newInner = newInner.replace(/<span class="pc-badge">[^<]*<\/span>/, `<span class="pc-badge">${badge}</span>`);
    }
    return open + newInner + close;
  });
}

// Global: apply % change to all prices in an HTML page
// action: 'discount' | 'markup' | 'set'
// Does NOT touch pc-orig (strikethrough) or schema-computed values
function applyGlobalPriceChange(html, action, percent, minPrice, maxPrice, addBadge) {
  const transform = (priceStr) => {
    const p = parseFloat(priceStr);
    let np;
    if (action === 'discount') np = p * (1 - percent / 100);
    else if (action === 'markup')  np = p * (1 + percent / 100);
    else return priceStr; // 'set' handled per-product
    if (minPrice && np < minPrice) np = minPrice;
    if (maxPrice && np > maxPrice) np = maxPrice;
    return np.toFixed(2);
  };

  let h = html;

  // 1. PDP current price
  h = h.replace(/(<span class="pdp-price-now">€)([\d.]+)(<\/span>)/, (m, pre, price, post) => {
    const orig = price;
    const np = transform(price);
    // set orig as strikethrough if discounting and no orig yet
    if (action === 'discount' && !h.includes('pdp-price-orig')) {
      return `${pre}${np}${post}<span class="pdp-price-orig">€${orig}</span><span class="pdp-price-save">−€${(parseFloat(orig)-parseFloat(np)).toFixed(2)}</span>`;
    }
    return `${pre}${np}${post}`;
  });

  // 2. Add to cart button price
  h = h.replace(/(— €)([\d.]+)(<\/span><\/button>)/, (m, pre, price, post) => `${pre}${transform(price)}${post}`);

  // 3. Product card prices (pc-pr, not pc-orig)
  h = h.replace(/(<p class="pc-pr">€)([\d.]+)/, (m, pre, price) => `${pre}${transform(price)}`);

  // 4. Schema.org
  h = h.replace(/"price":"([\d.]+)"/, (m, price) => `"price":"${transform(price)}"`);

  // 5. Checkout totals (rough replacement)
  h = h.replace(/(<span id="payTxt">(?:Pay securely|Payer sécurisé) — €)([\d.]+)(<\/span>)/, (m,pre,price,post) => {
    // Don't change checkout totals from global — they're composite
    return m;
  });

  return h;
}

// ── Snapshot (before/after) ───────────────────────────────────────────────
async function saveSnapshot(env, slug, label) {
  const keys = await listShopKeys(env, slug);
  const snapshot = {slug, label, createdAt: new Date().toISOString(), pages:{}};
  await Promise.all(keys.slice(0, 50).map(async key => {
    const html = await r2read(env, key);
    if (html) {
      const pi = extractPrices(html, key);
      snapshot.pages[key] = pi.prices;
    }
  }));
  const snapKey = `price:snapshot:${slug}:${label}`;
  // Store compact (prices only, not full HTML)
  await env.KV.put(snapKey, JSON.stringify(snapshot), {expirationTtl: 86400 * 90}).catch(()=>{});
  return {snapKey, pages: Object.keys(snapshot.pages).length};
}

async function logChange(env, slug, entry) {
  const histKey = `price:history:${slug}`;
  const existing = await env.KV.get(histKey).catch(()=>null);
  const history = existing ? JSON.parse(existing) : [];
  history.unshift({...entry, ts: new Date().toISOString()});
  // Keep last 100 entries
  await env.KV.put(histKey, JSON.stringify(history.slice(0,100)), {expirationTtl: 86400*365}).catch(()=>{});
}

// ── Main handler ──────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, {status:204, headers:CORS});

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/,'');

    // ── GET /audit?slug=xxx ───────────────────────────────────────────────
    if (request.method === 'GET' && path === '/audit') {
      const slug = url.searchParams.get('slug');
      if (!slug) return err('slug param required');
      const keys = await listShopKeys(env, slug);
      const results = await Promise.all(keys.map(async key => {
        const html = await r2read(env, key);
        return html ? extractPrices(html, key) : {key, prices:[]};
      }));
      const priceMap = {};
      results.forEach(r => {
        if (r.prices.length) priceMap[r.key] = r.prices;
      });
      const allPrices = results.flatMap(r => r.prices.map(p => p.price)).filter(Boolean);
      const stats = allPrices.length ? {
        min: Math.min(...allPrices).toFixed(2),
        max: Math.max(...allPrices).toFixed(2),
        avg: (allPrices.reduce((a,b)=>a+b,0)/allPrices.length).toFixed(2),
        count: allPrices.length,
      } : null;
      return ok({slug, pages: Object.keys(priceMap).length, stats, prices: priceMap});
    }

    // ── GET /history?slug=xxx ─────────────────────────────────────────────
    if (request.method === 'GET' && path === '/history') {
      const slug = url.searchParams.get('slug');
      if (!slug) return err('slug param required');
      const raw = await env.KV.get(`price:history:${slug}`).catch(()=>null);
      return ok({slug, history: raw ? JSON.parse(raw) : []});
    }

    if (request.method !== 'POST') return err('POST or GET only', 405);
    let body = {};
    try { body = await request.json(); } catch { return err('Invalid JSON'); }

    // ── POST /product ─────────────────────────────────────────────────────
    // { slug, product_path, new_price, orig_price?, badge?, update_cards:bool }
    if (path === '/product') {
      const {slug, product_path, new_price, orig_price, badge, update_cards=true} = body;
      if (!slug || !product_path || !new_price) return err('slug, product_path, new_price required');

      // Derive product name from path for card matching
      const pathParts = product_path.replace(/\/+$/,'').split('/');
      const productSlug = pathParts[pathParts.length - 1];

      const r2Key = `${slug}${product_path.endsWith('/')?product_path:product_path+'/'}`;
      const html = await r2read(env, r2Key);
      if (!html) return err(`Product page not found: ${r2Key}`);

      const updated = applyProductPrice(html, new_price, orig_price, badge);
      await r2write(env, r2Key, updated);

      const affected = [r2Key];

      // Update product cards on parent collection pages
      if (update_cards) {
        // The collection is 2 levels up from the product: /slug/collections/col/product/ → /slug/collections/col/
        const collectionKey = r2Key.split('/').slice(0,-2).join('/') + '/';
        const collHtml = await r2read(env, collectionKey);
        if (collHtml) {
          // Extract product title from the updated page
          const titleMatch = updated.match(/<h1[^>]*>([^<]+)<\/h1>/);
          const productName = titleMatch ? titleMatch[1] : productSlug;
          const updatedColl = applyCardPrice(collHtml, productName, new_price, orig_price, badge);
          await r2write(env, collectionKey, updatedColl);
          affected.push(collectionKey);
        }
      }

      await logChange(env, slug, {
        action:'product', product_path, new_price, orig_price, badge, pages_updated: affected.length
      });

      return ok({slug, product_path, new_price, orig_price, badge, pages_updated: affected});
    }

    // ── POST /batch ───────────────────────────────────────────────────────
    // { slug, updates:[{product_path, new_price, orig_price?, badge?}] }
    if (path === '/batch') {
      const {slug, updates=[]} = body;
      if (!slug || !updates.length) return err('slug and updates[] required');

      const results = await Promise.allSettled(updates.map(async upd => {
        const {product_path, new_price, orig_price, badge} = upd;
        const r2Key = `${slug}${product_path.endsWith('/')?product_path:product_path+'/'}`;
        const html = await r2read(env, r2Key);
        if (!html) return {product_path, status:'not_found'};
        const updated = applyProductPrice(html, new_price, orig_price, badge);
        await r2write(env, r2Key, updated);

        // Also update collection card
        const collectionKey = r2Key.split('/').slice(0,-2).join('/') + '/';
        const collHtml = await r2read(env, collectionKey);
        if (collHtml) {
          const titleMatch = updated.match(/<h1[^>]*>([^<]+)<\/h1>/);
          const productName = titleMatch?.[1] || product_path.split('/').at(-2)||'';
          await r2write(env, collectionKey, applyCardPrice(collHtml, productName, new_price, orig_price, badge));
        }

        return {product_path, new_price, orig_price, status:'updated'};
      }));

      const updated = results.filter(r => r.status==='fulfilled' && r.value?.status==='updated').map(r=>r.value);
      const errors  = results.filter(r => r.status==='rejected' || r.value?.status==='not_found').map(r=>r.reason?.message||r.value);

      await logChange(env, slug, {action:'batch', count:updated.length, errors:errors.length});
      return ok({slug, updated, errors, total: updates.length});
    }

    // ── POST /global ──────────────────────────────────────────────────────
    // { slug, action:'discount'|'markup', percent:10, min_price?, max_price?, badge?, collections?:[] }
    if (path === '/global') {
      const {slug, action, percent, min_price, max_price, badge, collections, snapshot=true} = body;
      if (!slug || !action || !percent) return err('slug, action, percent required');
      if (!['discount','markup'].includes(action)) return err('action must be discount or markup');
      if (percent <= 0 || percent > 90) return err('percent must be 1–90');

      // Snapshot before applying changes
      let snapInfo = null;
      if (snapshot) {
        snapInfo = await saveSnapshot(env, slug, `before-${action}-${percent}pct`).catch(e => ({error:e.message}));
      }

      const allKeys = await listShopKeys(env, slug);
      // Filter by collections if specified
      const keys = collections?.length
        ? allKeys.filter(k => collections.some(c => k.includes(`/${c}/`)) || !k.includes('/collections/'))
        : allKeys;

      // Skip checkout, legal pages
      const toProcess = keys.filter(k => !k.match(/\/(checkout|cgv|mentions-legales|confidentialite|sitemap|robots)\//));

      let updated = 0, skipped = 0;
      await Promise.all(toProcess.map(async key => {
        const html = await r2read(env, key);
        if (!html) { skipped++; return; }
        const changed = applyGlobalPriceChange(html, action, percent, min_price, max_price, badge);
        if (changed !== html) {
          await r2write(env, key, changed);
          updated++;
        } else {
          skipped++;
        }
      }));

      await logChange(env, slug, {
        action:'global', priceAction:action, percent, collections, pages_updated: updated, snapshot: snapInfo?.snapKey
      });

      return ok({slug, action, percent, pages_updated:updated, pages_skipped:skipped, snapshot:snapInfo});
    }

    // ── POST /restore ─────────────────────────────────────────────────────
    // { slug, snapshot_key } → restore price snapshot
    if (path === '/restore') {
      const {slug, snapshot_key} = body;
      if (!slug || !snapshot_key) return err('slug and snapshot_key required');
      const snap = await env.KV.get(snapshot_key).catch(()=>null);
      if (!snap) return err('Snapshot not found — may have expired (90-day TTL)');
      const snapshot = JSON.parse(snap);
      // Snapshot only stores prices, not full HTML — we can't restore full HTML
      // Instead, output what the prices were so the user can re-apply
      return ok({
        slug, snapshot_key,
        note: 'Snapshot stores price audit only. To restore: run /batch with these prices.',
        original_prices: snapshot.pages,
        created_at: snapshot.createdAt,
      });
    }

    return err('Unknown endpoint. Use /product, /batch, /global, /audit, /history, /restore', 404);
  }
};
