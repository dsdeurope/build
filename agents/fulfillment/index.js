// V35 Fulfillment Tracker — PHP/HTML sites + Shopify optionnel
// POST /orders              — créer commande (depuis PHP site ou manuel)
// POST /webhook/orders      — Shopify orders/create webhook (HMAC optionnel)
// GET  /orders              — list ?status=pending|ordered|shipped|done&page=1
// GET  /orders/:id          — order detail
// POST /orders/:id/status   — { status, notes?, tracking? }
// POST /orders/:id/resolve  — re-resolve AliExpress URLs
// DELETE /orders/:id        — archive
// GET  /stats               — counts by status
// POST /orders/test         — injecter commande de test
// GET  /health

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Shopify-Hmac-Sha256,X-Shopify-Shop-Domain',
  'Content-Type': 'application/json',
};

const SUPPLIER = 'https://v35-supplier-resolver.ernestpedanou.workers.dev';

const ok    = d       => Response.json({ ok: true,  ...d },      { headers: CORS });
const fail  = (m, s=400) => Response.json({ ok: false, error: m }, { status: s, headers: CORS });

// ── HMAC Shopify verification ─────────────────────────────────────────────────
async function verifyShopifyHmac(body, hmacHeader, secret) {
  if (!secret || !hmacHeader) return false;
  const key  = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const sig  = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const b64  = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return b64 === hmacHeader;
}

// ── AliExpress resolution for a product title ─────────────────────────────────
async function resolveAli(title) {
  try {
    const r = await fetch(`${SUPPLIER}/resolve/product`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
      signal: AbortSignal.timeout(10000),
    });
    const d = await r.json();
    return { url: d.aliexpress_url || null, found: d.found || false };
  } catch {
    return { url: `https://fr.aliexpress.com/wholesale?SearchText=${encodeURIComponent(title)}`, found: false };
  }
}

// ── KV helpers ────────────────────────────────────────────────────────────────
const INDEX_KEY = 'fulfillment:index';
const ORDER_KEY = id => `fulfillment:order:${id}`;

async function getIndex(kv) {
  const raw = await kv.get(INDEX_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function saveIndex(kv, index) {
  await kv.put(INDEX_KEY, JSON.stringify(index), { expirationTtl: 60 * 60 * 24 * 90 }); // 90 days
}

async function getOrder(kv, id) {
  const raw = await kv.get(ORDER_KEY(id));
  return raw ? JSON.parse(raw) : null;
}

async function saveOrder(kv, order) {
  await kv.put(ORDER_KEY(order.id), JSON.stringify(order), { expirationTtl: 60 * 60 * 24 * 90 });
}

// ── Order builder from Shopify payload ───────────────────────────────────────
async function buildOrder(shopifyOrder, shop) {
  const lineItems = (shopifyOrder.line_items || []).map(li => ({
    id:         String(li.id),
    product_id: String(li.product_id || ''),
    variant_id: String(li.variant_id || ''),
    title:      li.title || '',
    variant:    li.variant_title || '',
    quantity:   li.quantity || 1,
    price:      parseFloat(li.price || 0),
    sku:        li.sku || '',
    ali_url:    null,
    ali_found:  false,
    ali_resolved_at: null,
  }));

  // Resolve AliExpress URLs in parallel (max 10 items)
  const toResolve = lineItems.slice(0, 10);
  const resolved  = await Promise.all(toResolve.map(li => resolveAli(li.title)));
  toResolve.forEach((li, i) => {
    li.ali_url         = resolved[i].url;
    li.ali_found       = resolved[i].found;
    li.ali_resolved_at = Date.now();
  });

  const shipping = shopifyOrder.shipping_address || shopifyOrder.billing_address || {};

  return {
    id:           String(shopifyOrder.id || shopifyOrder.order_number || Date.now()),
    order_number: shopifyOrder.order_number || shopifyOrder.name || '—',
    shop:         shop || 'unknown',
    status:       'pending',
    created_at:   shopifyOrder.created_at || new Date().toISOString(),
    received_at:  new Date().toISOString(),

    customer: {
      name:    `${shopifyOrder.customer?.first_name || ''} ${shopifyOrder.customer?.last_name || ''}`.trim() || shopifyOrder.email || 'Inconnu',
      email:   shopifyOrder.email || '',
      country: shipping.country_code || shipping.country || '—',
      city:    shipping.city || '—',
    },

    shipping_address: shipping.address1 ? {
      name:     shipping.name || '',
      address1: shipping.address1 || '',
      address2: shipping.address2 || '',
      city:     shipping.city || '',
      zip:      shipping.zip || '',
      country:  shipping.country || '',
      phone:    shipping.phone || '',
    } : null,

    total_price:    parseFloat(shopifyOrder.total_price || 0),
    currency:       shopifyOrder.currency || 'EUR',
    payment_status: shopifyOrder.financial_status || 'pending',
    line_items:     lineItems,
    notes:          shopifyOrder.note || '',
    tags:           shopifyOrder.tags || '',
    fulfillment_notes: '',
  };
}

// ── FETCH HANDLER ─────────────────────────────────────────────────────────────
function authOk(req, env) {
  const h = req.headers.get('Authorization') || '';
  const t = new URL(req.url).searchParams.get('token') || '';
  return !env.API_TOKEN || h === 'Bearer ' + env.API_TOKEN || t === env.API_TOKEN;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url  = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '');
    const segs = path.split('/').filter(Boolean);

    // GET /health — public
    if (path === '/health') {
      const index = await getIndex(env.KV);
      return ok({ service: 'v35-fulfillment', orders: index.length });
    }

    // /webhook/orders — auth via Shopify HMAC (handled inside)
    if (path !== '/webhook/orders' && !authOk(request, env)) return fail('Unauthorized', 401);

    // GET /stats
    if (path === '/stats') {
      const index = await getIndex(env.KV);
      const counts = { pending: 0, ordered: 0, shipped: 0, done: 0, total: index.length };
      index.forEach(o => { if (counts[o.status] !== undefined) counts[o.status]++; });
      return ok(counts);
    }

    // POST /orders — generic order creation (from PHP site or manual UI)
    if (path === '/orders' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return fail('Invalid JSON'); }
      // Normalize generic payload → internal format
      const items = (body.line_items || body.items || []).map((li, idx) => ({
        id:         String(li.id || idx + 1),
        product_id: String(li.product_id || ''),
        variant_id: String(li.variant_id || ''),
        title:      li.title || li.name || '',
        variant:    li.variant || li.variant_title || '',
        quantity:   li.quantity || 1,
        price:      parseFloat(li.price || 0),
        sku:        li.sku || '',
        ali_url:    li.ali_url || null,
        ali_found:  !!li.ali_url,
        ali_resolved_at: li.ali_url ? Date.now() : null,
      }));

      // Resolve unresolved items
      const toResolve = items.filter(li => !li.ali_url);
      if (toResolve.length) {
        const resolved = await Promise.all(toResolve.map(li => resolveAli(li.title)));
        toResolve.forEach((li, i) => {
          li.ali_url = resolved[i].url;
          li.ali_found = resolved[i].found;
          li.ali_resolved_at = Date.now();
        });
      }

      const orderId = String(body.id || body.order_id || Date.now());
      const order = {
        id:           orderId,
        order_number: body.order_number || body.ref || `#${orderId.slice(-6)}`,
        shop:         body.shop || body.domain || 'custom',
        status:       'pending',
        created_at:   body.created_at || new Date().toISOString(),
        received_at:  new Date().toISOString(),
        customer: {
          name:    body.customer?.name || `${body.customer?.first_name||''} ${body.customer?.last_name||''}`.trim() || body.email || 'Inconnu',
          email:   body.customer?.email || body.email || '',
          country: body.customer?.country || body.shipping?.country || '—',
          city:    body.customer?.city    || body.shipping?.city    || '—',
          phone:   body.customer?.phone   || body.shipping?.phone   || '',
        },
        shipping_address: body.shipping || body.shipping_address || null,
        total_price:    parseFloat(body.total || body.total_price || items.reduce((s,i)=>s+i.price*i.quantity,0)),
        currency:       body.currency || 'EUR',
        payment_status: body.payment_status || body.financial_status || 'pending',
        line_items:     items,
        notes:          body.notes || body.note || '',
        tags:           body.tags || '',
        fulfillment_notes: '',
      };

      await saveOrder(env.KV, order);
      const index = await getIndex(env.KV);
      index.unshift({ id: order.id, order_number: order.order_number, shop: order.shop, status: order.status, customer: order.customer.name, total: order.total_price, currency: order.currency, received_at: order.received_at });
      if (index.length > 500) index.length = 500;
      await saveIndex(env.KV, index);

      return ok({ created: true, order_id: order.id, ali_resolved: items.filter(l => l.ali_found).length });
    }

    // POST /webhook/orders — Shopify orders/create
    if (path === '/webhook/orders' && request.method === 'POST') {
      const body   = await request.text();
      const hmac   = request.headers.get('X-Shopify-Hmac-Sha256') || '';
      const shop   = request.headers.get('X-Shopify-Shop-Domain') || 'unknown';
      const secret = env.SHOPIFY_WEBHOOK_SECRET;

      if (secret) {
        const valid = await verifyShopifyHmac(body, hmac, secret);
        if (!valid) return fail('Invalid HMAC signature', 401);
      }

      let payload;
      try { payload = JSON.parse(body); } catch { return fail('Invalid JSON'); }

      const order = await buildOrder(payload, shop);

      // Save order + update index
      await saveOrder(env.KV, order);
      const index = await getIndex(env.KV);
      index.unshift({ id: order.id, order_number: order.order_number, shop: order.shop, status: order.status, customer: order.customer.name, total: order.total_price, currency: order.currency, received_at: order.received_at });
      if (index.length > 500) index.length = 500; // keep last 500
      await saveIndex(env.KV, index);

      return ok({ received: true, order_id: order.id, ali_resolved: order.line_items.filter(l => l.ali_found).length });
    }

    // GET /orders
    if (path === '/orders' && request.method === 'GET') {
      const status = url.searchParams.get('status') || '';
      const page   = parseInt(url.searchParams.get('page') || '1');
      const per    = parseInt(url.searchParams.get('per') || '25');
      const shop   = url.searchParams.get('shop') || '';

      let index = await getIndex(env.KV);
      if (status) index = index.filter(o => o.status === status);
      if (shop)   index = index.filter(o => o.shop?.includes(shop));

      const total = index.length;
      const pages = Math.ceil(total / per) || 1;
      const slice = index.slice((page - 1) * per, page * per);

      return ok({ total, page, pages, list: slice });
    }

    // GET /orders/:id
    if (segs[0] === 'orders' && segs[1] && !segs[2] && request.method === 'GET') {
      const order = await getOrder(env.KV, segs[1]);
      if (!order) return fail('Order not found', 404);
      return ok({ order });
    }

    // POST /orders/:id/status
    if (segs[0] === 'orders' && segs[2] === 'status' && request.method === 'POST') {
      const order = await getOrder(env.KV, segs[1]);
      if (!order) return fail('Order not found', 404);
      let body; try { body = await request.json(); } catch { return fail('Invalid JSON'); }
      const valid = ['pending', 'ordered', 'shipped', 'done', 'cancelled'];
      if (!valid.includes(body.status)) return fail('status invalide');

      order.status = body.status;
      if (body.notes !== undefined) order.fulfillment_notes = body.notes;
      if (body.tracking) order.tracking = body.tracking;
      order.updated_at = new Date().toISOString();
      await saveOrder(env.KV, order);

      // Update index entry
      const index = await getIndex(env.KV);
      const entry = index.find(o => o.id === segs[1]);
      if (entry) { entry.status = order.status; await saveIndex(env.KV, index); }

      return ok({ updated: true, status: order.status });
    }

    // POST /orders/:id/resolve — re-resolve AliExpress URLs
    if (segs[0] === 'orders' && segs[2] === 'resolve' && request.method === 'POST') {
      const order = await getOrder(env.KV, segs[1]);
      if (!order) return fail('Order not found', 404);

      const resolved = await Promise.all(order.line_items.map(li => resolveAli(li.title)));
      order.line_items.forEach((li, i) => {
        li.ali_url         = resolved[i].url;
        li.ali_found       = resolved[i].found;
        li.ali_resolved_at = Date.now();
      });
      order.updated_at = new Date().toISOString();
      await saveOrder(env.KV, order);

      return ok({ resolved: resolved.filter(r => r.found).length, total: resolved.length });
    }

    // DELETE /orders/:id
    if (segs[0] === 'orders' && segs[1] && !segs[2] && request.method === 'DELETE') {
      await env.KV.delete(ORDER_KEY(segs[1]));
      const index = await getIndex(env.KV);
      const filtered = index.filter(o => o.id !== segs[1]);
      await saveIndex(env.KV, filtered);
      return ok({ deleted: true });
    }

    // POST /orders/test — inject fake order (dev/test)
    if (path === '/orders/test' && request.method === 'POST') {
      const fake = {
        id: Date.now(),
        order_number: Math.floor(Math.random() * 9000 + 1000),
        created_at: new Date().toISOString(),
        email: 'client@test.fr',
        financial_status: 'paid',
        total_price: '34.90',
        currency: 'EUR',
        customer: { first_name: 'Marie', last_name: 'Dupont' },
        shipping_address: { name: 'Marie Dupont', address1: '12 rue des Lilas', city: 'Lyon', zip: '69001', country: 'France', country_code: 'FR' },
        line_items: [
          { id: 1, product_id: 'p1', title: 'Robe fleurie bohème été femme', variant_title: 'Taille M / Rose', quantity: 1, price: '29.90', sku: 'ROBE-M-ROSE' },
          { id: 2, product_id: 'p2', title: 'Collier pendentif lune argent femme', variant_title: 'Default', quantity: 1, price: '14.90', sku: 'COL-LUNE' },
        ],
        note: 'Cadeau — ne pas mettre le prix svp',
      };
      let body; try { body = await request.json(); } catch { body = {}; }
      const order = await buildOrder({ ...fake, ...body }, 'test-store.myshopify.com');
      await saveOrder(env.KV, order);
      const index = await getIndex(env.KV);
      index.unshift({ id: order.id, order_number: order.order_number, shop: order.shop, status: order.status, customer: order.customer.name, total: order.total_price, currency: order.currency, received_at: order.received_at });
      await saveIndex(env.KV, index);
      return ok({ order });
    }

    return fail('Not found', 404);
  },
};
