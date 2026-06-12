import { mainCss } from './templates/css.js';
import { htaccess, robotsTxt, mainJs } from './templates/assets.js';
import {
  configPhp, headerPhp, footerPhp,
  indexPhp, collectionsIndexPhp, collectionPhp,
  blogIndexPhp, articlePhp, sitemapPhp,
  mentionsLegalesPhp, configJson,
} from './templates/php.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const NICHES = {
  lingerie:     { h: 330, s: 60 }, luminaires: { h:  45, s: 70 },
  sport:        { h: 130, s: 65 }, bijoux:     { h:  42, s: 80 },
  deco:         { h: 200, s: 45 }, mode:       { h: 270, s: 50 },
  enfants:      { h: 190, s: 70 }, jardin:     { h: 100, s: 60 },
  cuisine:      { h:  20, s: 75 }, beaute:     { h: 340, s: 55 },
  electronique: { h: 210, s: 65 }, livres:     { h:  35, s: 50 },
  animaux:      { h:  80, s: 55 }, sante:      { h: 160, s: 55 },
  auto:         { h: 215, s: 60 }, maison:     { h: 195, s: 40 },
  voyage:       { h: 230, s: 65 }, gastronomie:{ h:  15, s: 80 },
};

function hsl2hex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function buildPalette(niche) {
  const n = NICHES[niche.toLowerCase().trim()] || { h: 220, s: 55 };
  const { h, s } = n;
  const ha = (h + 140) % 360;
  return {
    primary:       hsl2hex(h,  s,     42),
    primary_dark:  hsl2hex(h,  s,     28),
    primary_light: hsl2hex(h,  s - 10, 90),
    secondary:     hsl2hex(h,  s - 15, 55),
    accent:        hsl2hex(ha, 70,    50),
    surface:       hsl2hex(h,  15,    97),
    bg:            hsl2hex(h,  8,     99),
    text:          hsl2hex(h,  10,    12),
    text_muted:    hsl2hex(h,  8,     50),
    border:        hsl2hex(h,  15,    88),
    gradient_from: hsl2hex(h,  s,     38),
    gradient_to:   hsl2hex(h,  s - 5, 22),
    hero_text:     '#ffffff',
  };
}

function brand(domain) {
  return domain.replace(/^www\./, '').split('.')[0]
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function buildFiles(bp, domain, brandName, niche, p) {
  const files = {};

  // CSS
  files['assets/css/main.css'] = mainCss(p);

  // JS
  files['assets/js/main.js'] = mainJs;

  // .htaccess
  files['.htaccess'] = htaccess;

  // robots.txt
  files['robots.txt'] = robotsTxt(domain);

  // PHP includes
  files['includes/config.php'] = configPhp(domain, brandName, niche, p);
  files['includes/header.php'] = headerPhp(brandName, p);
  files['includes/footer.php'] = footerPhp(brandName, domain);

  // Pages
  files['index.php'] = indexPhp(domain, brandName, niche);
  files['collections/index.php'] = collectionsIndexPhp();
  files['collections/collection.php'] = collectionPhp();
  files['blog/index.php'] = blogIndexPhp();
  files['blog/article.php'] = articlePhp();
  files['sitemap.php'] = sitemapPhp(domain);
  files['mentions-legales.php'] = mentionsLegalesPhp(domain, brandName);

  // Data
  const collections = (bp.collections || []).map(c => ({
    handle: c.handle,
    title: c.title,
    description: c.description || '',
    count: c.productsCount || c.count || 0,
    emoji: c.emoji || '🛍',
    image: c.image || '',
    tag: c.tag || '',
  }));

  // Inject collections into config
  const cfg = JSON.parse(configJson(domain, brandName, niche));
  cfg.collections = collections;
  files['data/config.json'] = JSON.stringify(cfg, null, 2);
  files['data/collections.json'] = JSON.stringify(collections, null, 2);

  // Empty posts array
  files['data/posts.json'] = JSON.stringify([], null, 2);

  // Per-collection product placeholder files
  for (const col of collections) {
    files[`data/products/${col.handle}.json`] = JSON.stringify([], null, 2);
  }

  // Empty dirs placeholders (.gitkeep style)
  files['cache/.htaccess'] = 'Deny from all\n';

  return files;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST') return new Response('POST required', { status: 405, headers: CORS });

    let body;
    try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS }); }

    const { blueprint: bp, domain, niche = 'generique' } = body;
    if (!bp || !domain) return Response.json({ error: 'blueprint + domain required' }, { status: 400, headers: CORS });

    const brandName = brand(domain);
    const palette = buildPalette(niche);
    const files = buildFiles(bp, domain, brandName, niche, palette);

    const summary = {
      domain,
      brand: brandName,
      niche,
      palette: { primary: palette.primary, accent: palette.accent },
      file_count: Object.keys(files).length,
      files,
    };

    return Response.json(summary, { headers: CORS });
  }
};
