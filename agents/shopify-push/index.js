const SHOPIFY_API = '2024-01';
const RATE_DELAY_MS = 500; // 2 req/s
const RETRY_DELAY_MS = 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function shopifyPatch(shopDomain, token, path, body) {
  const url = `https://${shopDomain}/admin/api/${SHOPIFY_API}/${path}`;
  let res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (res.status === 429) {
    await delay(RETRY_DELAY_MS);
    res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }
  return res;
}

async function shopifyPost(shopDomain, token, path, body) {
  const url = `https://${shopDomain}/admin/api/${SHOPIFY_API}/${path}`;
  let res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (res.status === 429) {
    await delay(RETRY_DELAY_MS);
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }
  return res;
}

async function pushTitles(shopDomain, token, products) {
  const pushed = [];
  const errors = [];
  for (const p of products) {
    const res = await shopifyPatch(shopDomain, token, `products/${p.shopify_id}.json`, {
      product: { id: p.shopify_id, title: p.title_translated },
    });
    if (res.ok) {
      pushed.push(p.shopify_id);
    } else {
      const txt = await res.text();
      errors.push({ id: p.shopify_id, error: `${res.status}: ${txt}` });
    }
    await delay(RATE_DELAY_MS);
  }
  return { pushed: pushed.length, errors };
}

async function pushCollections(shopDomain, token, collections) {
  const pushed = [];
  const errors = [];
  for (const c of collections) {
    const body = { custom_collection: { id: c.shopify_id, title: c.title_translated } };
    if (c.body_html_translated !== undefined) {
      body.custom_collection.body_html = c.body_html_translated;
    }
    const res = await shopifyPatch(shopDomain, token, `custom_collections/${c.shopify_id}.json`, body);
    if (res.ok) {
      pushed.push(c.shopify_id);
    } else {
      const txt = await res.text();
      errors.push({ id: c.shopify_id, error: `${res.status}: ${txt}` });
    }
    await delay(RATE_DELAY_MS);
  }
  return { pushed: pushed.length, errors };
}

async function pushDescriptions(shopDomain, token, products) {
  const pushed = [];
  const errors = [];
  for (const p of products) {
    const res = await shopifyPatch(shopDomain, token, `products/${p.shopify_id}.json`, {
      product: { id: p.shopify_id, body_html: p.description_html },
    });
    if (res.ok) {
      pushed.push(p.shopify_id);
    } else {
      const txt = await res.text();
      errors.push({ id: p.shopify_id, error: `${res.status}: ${txt}` });
    }
    await delay(RATE_DELAY_MS);
  }
  return { pushed: pushed.length, errors };
}

async function pushMetafield(shopDomain, token, { resource_type, resource_id, namespace, key, value, type }) {
  const resourcePath = resource_type === 'shop'
    ? 'metafields.json'
    : `${resource_type}s/${resource_id}/metafields.json`;

  const res = await shopifyPost(shopDomain, token, resourcePath, {
    metafield: { namespace, key, value, type },
  });

  if (res.ok) {
    return { pushed: 1, errors: [] };
  }
  const txt = await res.text();
  return { pushed: 0, errors: [{ id: resource_id, error: `${res.status}: ${txt}` }] };
}

async function pushBatch(shopDomain, token, items) {
  let pushed = 0;
  const errors = [];

  for (const item of items) {
    try {
      let result;
      switch (item.type) {
        case 'title':
          result = await pushTitles(shopDomain, token, [item]);
          break;
        case 'collection':
          result = await pushCollections(shopDomain, token, [item]);
          break;
        case 'description':
          result = await pushDescriptions(shopDomain, token, [item]);
          break;
        case 'metafield':
          result = await pushMetafield(shopDomain, token, item);
          break;
        default:
          errors.push({ id: item.shopify_id ?? item.resource_id, error: `Unknown type: ${item.type}` });
          continue;
      }
      pushed += result.pushed;
      errors.push(...result.errors);
    } catch (e) {
      errors.push({ id: item.shopify_id ?? item.resource_id, error: e.message });
    }
    // Rate delay already applied inside individual push functions;
    // batch adds no extra delay to avoid doubling it.
  }

  return { ok: true, pushed, errors };
}

function extractToken(request, body) {
  const auth = request.headers.get('Authorization');
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return body?.access_token ?? null;
}

function validateBase(body) {
  if (!body?.shop_domain) return 'Missing shop_domain';
  return null;
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'GET' && path === '/health') {
      return json({ ok: true, version: '1.0' });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const token = extractToken(request, body);
    if (!token) return json({ error: 'Missing access token (Authorization header or access_token field)' }, 401);

    const baseErr = validateBase(body);
    if (baseErr) return json({ error: baseErr }, 400);

    const { shop_domain } = body;

    try {
      switch (path) {
        case '/push/titles': {
          if (!Array.isArray(body.products) || !body.products.length)
            return json({ error: 'Missing products array' }, 400);
          const result = await pushTitles(shop_domain, token, body.products);
          return json({ ok: true, ...result });
        }

        case '/push/collections': {
          if (!Array.isArray(body.collections) || !body.collections.length)
            return json({ error: 'Missing collections array' }, 400);
          const result = await pushCollections(shop_domain, token, body.collections);
          return json({ ok: true, ...result });
        }

        case '/push/descriptions': {
          if (!Array.isArray(body.products) || !body.products.length)
            return json({ error: 'Missing products array' }, 400);
          const result = await pushDescriptions(shop_domain, token, body.products);
          return json({ ok: true, ...result });
        }

        case '/push/metafields': {
          const { resource_type, resource_id, namespace, key, value, type } = body;
          if (!resource_type || !namespace || !key || value === undefined || !type)
            return json({ error: 'Missing required metafield fields' }, 400);
          if (!['product', 'collection', 'shop'].includes(resource_type))
            return json({ error: 'resource_type must be product, collection, or shop' }, 400);
          if (resource_type !== 'shop' && !resource_id)
            return json({ error: 'Missing resource_id' }, 400);
          const result = await pushMetafield(shop_domain, token, { resource_type, resource_id, namespace, key, value, type });
          return json({ ok: true, ...result });
        }

        case '/push/batch': {
          if (!Array.isArray(body.items) || !body.items.length)
            return json({ error: 'Missing items array' }, 400);
          const result = await pushBatch(shop_domain, token, body.items);
          return json(result);
        }

        default:
          return json({ error: 'Not found' }, 404);
      }
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};
