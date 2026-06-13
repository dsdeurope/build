// V35 Supplier Resolver — fallback chain: AliExpress → CJDropshipping → DHgate → 1688.com
// Résout le fournisseur optimal pour chaque boutique/niche même quand AliExpress échoue

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Content-Type': 'application/json',
};

const BUILD_API = 'https://v35-build-api.ernestpedanou.workers.dev';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36';

// ── Niche dictionary FR + CN keywords ────────────────────────────────────────
const NICHE_KW = {
  bijoux: {
    fr: ['bague dorée femme', 'collier pendentif femme', 'bracelet argent femme', 'boucle oreille fantaisie', 'bijoux fantaisie tendance'],
    cn: ['项链女', '戒指女', '手链银', '耳环时尚', '饰品批发'],
  },
  beaute: {
    fr: ['sérum visage antiâge', 'crème hydratante visage', 'huile visage naturelle', 'masque soin peau', 'cosmétique soin naturel'],
    cn: ['护肤品精华', '面霜保湿', '美容仪器', '化妆品批发', '面膜补水'],
  },
  mode: {
    fr: ['robe femme tendance', 'pull oversize femme', 'veste femme casual', 'jupe midi femme', 'ensemble tenue femme'],
    cn: ['女装连衣裙', '上衣女', '外套女', '半身裙', '女士服装批发'],
  },
  maison: {
    fr: ['décoration maison', 'coussin déco salon', 'bougie parfumée', 'vase décoratif', 'tableau mural'],
    cn: ['家居装饰', '抱枕', '香薰蜡烛', '花瓶', '装饰画'],
  },
  sport: {
    fr: ['legging sport femme', 'brassière sport', 'sac sport', 'équipement fitness', 'accessoire yoga'],
    cn: ['运动裤女', '运动文胸', '健身包', '健身器材', '瑜伽用品'],
  },
  enfant: {
    fr: ['jouet enfant éveil', 'vêtement bébé', 'accessoire poussette', 'jouet éducatif', 'peluche enfant'],
    cn: ['儿童玩具', '婴儿服装', '童装批发', '益智玩具', '毛绒玩具'],
  },
};

// ── Platform chain config ─────────────────────────────────────────────────────
const PLATFORMS = [
  {
    id: 'aliexpress',
    name: 'AliExpress',
    site: 'aliexpress.com',
    lang: 'fr',
    minScore: 30,
    urlTemplate: kw => `https://fr.aliexpress.com/wholesale?SearchText=${encodeURIComponent(kw)}`,
  },
  {
    id: 'cjdropshipping',
    name: 'CJDropshipping',
    site: 'cjdropshipping.com',
    lang: 'fr',
    minScore: 20,
    urlTemplate: kw => `https://cjdropshipping.com/list.html?keyword=${encodeURIComponent(kw)}`,
  },
  {
    id: 'dhgate',
    name: 'DHgate',
    site: 'dhgate.com',
    lang: 'fr',
    minScore: 20,
    urlTemplate: kw => `https://www.dhgate.com/wholesale/search.do?act=search&searchkey=${encodeURIComponent(kw)}`,
  },
  {
    id: '1688',
    name: '1688 (Wholesale CN)',
    site: '1688.com',
    lang: 'cn',
    minScore: 10,
    urlTemplate: kw => `https://s.1688.com/selloffer/offerlist.htm?keywords=${encodeURIComponent(kw)}`,
  },
];

// ── DDG search proxy ──────────────────────────────────────────────────────────
async function ddgSearch(keyword, site) {
  const q = `site:${site} ${keyword}`;
  try {
    const r = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,*/*',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { count: 0, url: null };
    const text = await r.text();
    const siteRe = new RegExp(site.replace('.', '\\.').replace('-', '\\-'), 'gi');
    const count = (text.match(siteRe) || []).length;
    // Extract first result URL from DDG lite HTML
    const urlRe = new RegExp(`(https?://(?:www\\.)?(?:[a-z0-9-]+\\.)?${site.replace('.', '\\.')}[^"'\\s<>]{3,100})`, 'i');
    const urlMatch = text.match(urlRe);
    return { count, url: urlMatch?.[1] || null };
  } catch {
    return { count: 0, url: null };
  }
}

// ── CJDropshipping product API (free, no auth required for search) ────────────
async function cjSearch(keyword) {
  try {
    const r = await fetch(
      `https://developers.cjdropshipping.com/api2.0/v1/product/list?productNameEn=${encodeURIComponent(keyword)}&pageNum=1&pageSize=5`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) return { count: 0, url: null };
    const j = await r.json();
    const items = j?.data?.list || [];
    return {
      count: items.length * 8,
      url: items[0]?.productUrl || `https://cjdropshipping.com/list.html?keyword=${encodeURIComponent(keyword)}`,
    };
  } catch {
    return { count: 0, url: null };
  }
}

// ── Score a platform for a set of keywords ────────────────────────────────────
async function scorePlatform(platform, keywords) {
  let totalCount = 0;
  let bestUrl = null;

  const kws = keywords.slice(0, 3); // max 3 to stay fast

  for (const kw of kws) {
    let result;
    if (platform.id === 'cjdropshipping') {
      // Try CJ API first, fallback to DDG
      result = await cjSearch(kw);
      if (result.count === 0) result = await ddgSearch(kw, platform.site);
    } else {
      result = await ddgSearch(kw, platform.site);
    }
    totalCount += result.count;
    if (!bestUrl && result.url) bestUrl = result.url;
  }

  // Normalize: found = 99-100%, not found = 0%
  const pct = totalCount > 0 ? (totalCount >= 10 ? 100 : 99) : 0;
  return {
    platform: platform.id,
    name: platform.name,
    pct,
    count: totalCount,
    url: bestUrl || platform.urlTemplate(kws[0]),
  };
}

// ── Main resolver ─────────────────────────────────────────────────────────────
async function resolveSupplier(domain, niche, customKeywords) {
  const nicheData = NICHE_KW[niche] || NICHE_KW['mode'];
  const chain = [];

  for (const platform of PLATFORMS) {
    const keywords = platform.lang === 'cn'
      ? nicheData.cn
      : (customKeywords?.length ? customKeywords : nicheData.fr);

    const result = await scorePlatform(platform, keywords);
    chain.push(result);

    // Stop if good match found (saves quota)
    if (result.pct >= platform.minScore) break;
  }

  const best = chain.reduce((a, b) => b.pct > a.pct ? b : a, { pct: 0, platform: null });

  return {
    domain,
    niche,
    resolved: best.pct > 0,
    supplier: best.platform,
    supplier_name: best.name,
    supplier_url: best.url,
    supplier_pct: best.pct,
    chain,
    resolved_at: Date.now(),
  };
}

// ── Push result back to build-api ─────────────────────────────────────────────
async function updateBoutique(boutiqueId, result, apiToken) {
  try {
    await fetch(`${BUILD_API}/api/boutiques/${boutiqueId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        aliexpress_pct: result.supplier_pct,
        aliexpress_supplier_url: result.supplier_url,
        aliexpress_detail: JSON.stringify({ supplier: result.supplier, chain: result.chain }),
        aliexpress_checked_at: result.resolved_at,
      }),
    });
  } catch { /* non-blocking */ }
}

// ── Cron: auto-resolve all boutiques with pct < 30 ───────────────────────────
async function cronResolve(env) {
  const secret = env.CRON_SECRET || env.SEED_SECRET;
  // Fetch boutiques list
  const r = await fetch(`${BUILD_API}/api/boutiques?limit=50`, {
    headers: { 'Authorization': `Bearer ${env.API_TOKEN}` },
  });
  if (!r.ok) return { error: 'fetch_failed', status: r.status };

  const { list: boutiques = [] } = await r.json();

  // Filter: not resolved or pct < 30 and not checked in last 24h
  const now = Date.now();
  const targets = boutiques.filter(b =>
    (!b.aliexpress_pct || b.aliexpress_pct < 30) &&
    (!b.aliexpress_checked_at || now - b.aliexpress_checked_at > 24 * 3600 * 1000)
  ).slice(0, 10); // max 10 per cron run to stay within CF CPU limits

  const results = [];
  for (const b of targets) {
    const keywords = b.keywords ? b.keywords.split(',').map(k => k.trim()).filter(Boolean) : [];
    const resolved = await resolveSupplier(b.domain, b.niche || 'mode', keywords);
    await updateBoutique(b.id, resolved, env.API_TOKEN);
    results.push({ domain: b.domain, supplier: resolved.supplier, pct: resolved.supplier_pct });
  }

  return { processed: results.length, results };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '');

    function ok(data)      { return Response.json({ ok: true, ...data }, { headers: CORS }); }
    function fail(msg, s=400) { return Response.json({ ok: false, error: msg }, { status: s, headers: CORS }); }

    // ── POST /resolve ─────────────────────────────────────────────────────────
    if (path === '/resolve' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return fail('Invalid JSON'); }

      const { domain, niche, keywords = [], boutique_id } = body;
      if (!domain) return fail('domain required');
      if (!niche)  return fail('niche required');

      const result = await resolveSupplier(domain, niche, keywords);

      // Auto-push to build-api if boutique_id provided
      if (boutique_id && env.API_TOKEN) {
        await updateBoutique(boutique_id, result, env.API_TOKEN);
      }

      return ok(result);
    }

    // ── POST /resolve/bulk ────────────────────────────────────────────────────
    if (path === '/resolve/bulk' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return fail('Invalid JSON'); }

      const items = body.items || [];
      if (!Array.isArray(items) || items.length === 0) return fail('items[] required');
      if (items.length > 20) return fail('max 20 items per bulk');

      const results = [];
      for (const item of items) {
        const r = await resolveSupplier(item.domain, item.niche || 'mode', item.keywords || []);
        if (item.boutique_id && env.API_TOKEN) await updateBoutique(item.boutique_id, r, env.API_TOKEN);
        results.push(r);
      }

      return ok({ count: results.length, results });
    }

    // ── GET /resolve/:domain ──────────────────────────────────────────────────
    if (path.startsWith('/resolve/') && request.method === 'GET') {
      const domain = path.slice('/resolve/'.length);
      if (!domain) return fail('domain required');

      // Fetch boutique from build-api to get niche + keywords
      const r = await fetch(`${BUILD_API}/api/boutiques?domain=${encodeURIComponent(domain)}`, {
        headers: { 'Authorization': `Bearer ${env.API_TOKEN || ''}` },
      });
      if (!r.ok) return fail('boutique not found', 404);

      const { list: boutiques = [] } = await r.json();
      const b = boutiques.find(x => x.domain === domain);
      if (!b) return fail('boutique not found', 404);

      const keywords = b.keywords ? b.keywords.split(',').map(k => k.trim()).filter(Boolean) : [];
      const result = await resolveSupplier(domain, b.niche || 'mode', keywords);
      await updateBoutique(b.id, result, env.API_TOKEN);

      return ok(result);
    }

    // ── POST /cron/resolve ────────────────────────────────────────────────────
    if (path === '/cron/resolve' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const secret = body.secret || url.searchParams.get('secret');
      if (secret !== (env.CRON_SECRET || env.SEED_SECRET)) return fail('Unauthorized', 401);

      const result = await cronResolve(env);
      return ok(result);
    }

    // ── GET /health ───────────────────────────────────────────────────────────
    if (path === '/health') {
      return ok({
        service: 'supplier-resolver',
        version: 'v35',
        platforms: PLATFORMS.map(p => p.id),
        niches: Object.keys(NICHE_KW),
      });
    }

    return fail('Not found', 404);
  },
};
