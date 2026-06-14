// V35 Footprint Scanner — anti-PBN-detection + hreflang injection
//
// POST /scan        → detect footprints on a site {slug, domain}
// POST /fix         → auto-fix detected footprints {slug, domain, lang, extra_langs:[]}
// POST /hreflang    → inject/update hreflang tags {slug, domain, langs:[], default_lang}
// POST /robots      → generate hardened robots.txt {slug, domain}
// POST /scan-all    → scan multiple sites {sites:[{slug,domain}]}
// POST /diversify   → randomize detectable shared patterns across sites
// GET  /report?slug → latest scan report

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
async function r2write(env, key, html, ct='text/html;charset=UTF-8') {
  await env.R2.put(key, html, {httpMetadata:{contentType:ct}});
}

// ── Footprint definitions ─────────────────────────────────────────────────
// What Google's anti-PBN algo looks for
const FOOTPRINTS = [
  {
    id: 'worker-url',
    desc: 'Workers.dev URL exposed in HTML — links all sites to same infrastructure',
    severity: 'critical',
    detect: html => /workers\.dev|\.pages\.dev/i.test(html),
    fix: (html, ctx) => html.replace(/https?:\/\/[a-z0-9-]+\.(workers|pages)\.dev\/[^\s"'>]*/gi, `https://${ctx.domain}/`),
  },
  {
    id: 'shared-account-id',
    desc: 'Cloudflare Account ID exposed',
    severity: 'critical',
    detect: html => /fe4415f3f3f3b64f651166d1a7ffe1a0/i.test(html),
    fix: html => html.replace(/fe4415f3f3f3b64f651166d1a7ffe1a0/gi, ''),
  },
  {
    id: 'personal-email',
    desc: 'Personal email (gmail/hotmail/yahoo) in HTML',
    severity: 'high',
    detect: html => /@(gmail|hotmail|yahoo|outlook|live|icloud|proton)\./i.test(html),
    fix: (html, ctx) => html.replace(/[a-z0-9._%+-]+@(gmail|hotmail|yahoo|outlook|live|icloud|proton)\.[a-z]{2,}/gi, `contact@${ctx.domain}`),
  },
  {
    id: 'meta-generator',
    desc: 'Meta generator tag reveals CMS/platform',
    severity: 'medium',
    detect: html => /<meta[^>]+name="generator"/i.test(html),
    fix: html => html.replace(/<meta[^>]+name="generator"[^>]*>/gi, ''),
  },
  {
    id: 'shared-analytics',
    desc: 'Hardcoded analytics ID (GA/GTM) — same ID across sites is a strong footprint',
    severity: 'high',
    detect: html => /(UA-\d{5,}-\d|G-[A-Z0-9]{8,}|GTM-[A-Z0-9]{5,})/i.test(html),
    fix: html => html, // Can't auto-fix — user must use domain-specific IDs or remove
  },
  {
    id: 'whois-personal',
    desc: 'Personal name potentially in address/contact block',
    severity: 'medium',
    detect: html => /\b(SARL|SAS|EURL|auto.entrepreneur|siret|siren)\b/i.test(html),
    fix: html => html, // Manual review needed
  },
  {
    id: 'cross-site-links',
    desc: 'Links to sibling sites (PBN network visible via href)',
    severity: 'high',
    detect: (html, ctx) => {
      // Find all external links
      const links = [...html.matchAll(/href="https?:\/\/([^"\/]+)/gi)].map(m=>m[1]);
      const external = links.filter(l => l !== ctx.domain && !l.includes('schema.org') && !l.includes('w3.org'));
      return external.length > 0 && ctx.siblings ? external.some(l => ctx.siblings.includes(l)) : false;
    },
    fix: html => html, // Manual review — remove cross-links manually
  },
  {
    id: 'missing-canonical',
    desc: 'No canonical tag — Google may merge duplicate content across sites',
    severity: 'medium',
    detect: html => !html.includes('rel="canonical"'),
    fix: (html, ctx) => {
      // Extract path from og:url or use /
      const ogUrl = html.match(/property="og:url" content="([^"]+)"/)?.[1] || `https://${ctx.domain}/`;
      const canonical = `<link rel="canonical" href="${ogUrl}">`;
      return html.includes('rel="canonical"') ? html : html.replace('</head>', `${canonical}</head>`);
    },
  },
  {
    id: 'missing-hreflang',
    desc: 'No hreflang tags — required for multi-language/multi-country sites',
    severity: 'medium',
    detect: html => !html.includes('hreflang'),
    fix: html => html, // Handled by /hreflang endpoint
  },
  {
    id: 'x-robots-missing',
    desc: 'No robots meta on checkout/legal pages — search engines may index internal pages',
    severity: 'low',
    detect: (html, ctx) => ctx.path && /\/(checkout|cgv|mentions-legales|confidentialite)\//.test(ctx.path) && !html.includes('name="robots"'),
    fix: html => html.replace('<head>', '<head><meta name="robots" content="noindex, nofollow">'),
  },
  {
    id: 'identical-schema',
    desc: 'Schema.org URL does not use custom domain (uses slug instead)',
    severity: 'medium',
    detect: (html, ctx) => ctx.domain && html.includes('"url":"https://') && !html.includes(`"url":"https://${ctx.domain}`),
    fix: (html, ctx) => html.replace(/"url":"https:\/\/[^"\/]+\//g, `"url":"https://${ctx.domain}/`),
  },
  {
    id: 'server-header-leak',
    desc: 'Server/X-Powered-By headers reveal platform (handled in site-server, but check here)',
    severity: 'info',
    detect: html => false, // HTTP header check — can't test from HTML
    fix: html => html,
  },
  {
    id: 'noindex-home',
    desc: 'Homepage is set to noindex — critical SEO issue',
    severity: 'critical',
    detect: html => html.startsWith('<!DOCTYPE') && /<meta[^>]*name="robots"[^>]*noindex/i.test(html.slice(0, 2000)),
    fix: html => html.replace(/<meta[^>]*name="robots"[^>]*noindex[^>]*>/gi, '<meta name="robots" content="index, follow">'),
  },
];

// ── Hreflang generation ───────────────────────────────────────────────────
const HREFLANG_MAP = {
  fr:'fr-FR', de:'de-DE', es:'es-ES', it:'it-IT', en:'en-GB',
  nl:'nl-NL', pt:'pt-PT', pl:'pl-PL', ru:'ru-RU', cs:'cs-CZ',
  hu:'hu-HU', ro:'ro-RO', da:'da-DK', fi:'fi-FI', sv:'sv-SE',
  nb:'nb-NO', el:'el-GR', tr:'tr-TR', ar:'ar', zh:'zh-CN',
};

// Subdomain-based hreflang: fr.domain.com, de.domain.com, www.domain.com
function generateHreflang(domain, path, langs, defaultLang='fr') {
  const tags = langs.map(lang => {
    const sub = lang === defaultLang ? 'www' : lang;
    const hreflangCode = HREFLANG_MAP[lang] || lang;
    return `<link rel="alternate" hreflang="${hreflangCode}" href="https://${sub}.${domain}${path}">`;
  });
  // x-default points to default lang
  const defaultSub = defaultLang === defaultLang ? 'www' : defaultLang;
  tags.push(`<link rel="alternate" hreflang="x-default" href="https://${defaultSub}.${domain}${path}">`);
  return tags.join('\n');
}

// Inject hreflang into an HTML page
function injectHreflang(html, domain, path, langs, defaultLang) {
  // Remove existing hreflang tags
  const cleaned = html.replace(/<link[^>]*hreflang[^>]*>/gi, '').replace(/\n\n\n/g, '\n\n');
  // Generate new tags
  const tags = generateHreflang(domain, path, langs, defaultLang);
  return cleaned.replace('</head>', `${tags}\n</head>`);
}

// ── Robots.txt hardening ──────────────────────────────────────────────────
function generateRobots(domain, langs=[], sitemapSlugs=[]) {
  const defaultLang = langs[0] || 'fr';
  const sitemaps = [
    `https://www.${domain}/sitemap.xml`,
    ...langs.filter(l=>l!==defaultLang).map(l=>`https://${l}.${domain}/sitemap.xml`),
    ...sitemapSlugs.map(s=>`https://www.${domain}/${s}/sitemap.xml`),
  ];
  return `User-agent: *
Allow: /
Disallow: /checkout/
Disallow: /cart/
Disallow: /search?
Disallow: /api/
Disallow: /admin/
Disallow: /_/
Disallow: /*?sort=*
Disallow: /*?filter=*
Disallow: /*?ref=*
Disallow: /*?utm_*
Disallow: /*&*

# Delay crawlers (respect bandwidth)
Crawl-delay: 2

# Sitemaps
${sitemaps.map(s=>`Sitemap: ${s}`).join('\n')}`;
}

// ── Scan a site ───────────────────────────────────────────────────────────
async function scanSite(env, slug, domain, langs=[]) {
  const report = {
    slug, domain, scannedAt: new Date().toISOString(),
    pages_scanned: 0, issues: [], warnings: [], passes: [],
    score: 100, // starts at 100, deduct per issue
  };

  // Get key pages to scan
  const pathsToScan = ['/', '/collections/', '/blog/'];
  const ctx = {domain, slug, siblings: []};

  for (const path of pathsToScan) {
    const html = await r2read(env, `${slug}${path}`);
    if (!html) continue;
    report.pages_scanned++;
    const pageCtx = {...ctx, path};

    for (const fp of FOOTPRINTS) {
      try {
        const detected = fp.detect(html, pageCtx);
        if (detected) {
          const issue = {id:fp.id, desc:fp.desc, severity:fp.severity, page:path, auto_fixable: fp.fix !== (h=>h)};
          if (fp.severity==='critical'||fp.severity==='high') {
            report.issues.push(issue);
            report.score -= fp.severity==='critical' ? 25 : 10;
          } else {
            report.warnings.push(issue);
            report.score -= fp.severity==='medium' ? 5 : 2;
          }
        } else if (fp.id !== 'server-header-leak') {
          report.passes.push({id:fp.id, page:path});
        }
      } catch {}
    }

    // Hreflang check
    if (langs.length > 1 && !html.includes('hreflang')) {
      report.warnings.push({id:'missing-hreflang', desc:'No hreflang tags found', severity:'medium', page:path, auto_fixable:true});
      report.score -= 5;
    }
  }

  report.score = Math.max(0, report.score);
  report.status = report.score>=80?'SAFE':report.score>=60?'WATCH':report.score>=40?'RISK':'CRITICAL';
  report.auto_fixable_count = [...report.issues,...report.warnings].filter(i=>i.auto_fixable).length;

  await env.KV.put(`fp:report:${slug}`, JSON.stringify(report), {expirationTtl:86400*30}).catch(()=>{});
  return report;
}

// ── Fix footprints ────────────────────────────────────────────────────────
async function fixSite(env, slug, domain, lang='fr', langs=[]) {
  const paths = ['/'];
  // Also get all collection paths from R2
  try {
    const list = await env.R2.list({prefix:`${slug}/collections/`, limit:100});
    list.objects.filter(o=>o.key.endsWith('/')).forEach(o => paths.push('/'+o.key.replace(`${slug}`,'').replace(/^\/+/,'').replace(/\/*$/,'/')));
  } catch {}
  paths.push('/collections/', '/blog/', '/checkout/', '/cgv/', '/mentions-legales/', '/confidentialite/');

  const ctx = {domain, slug};
  const fixed = [];
  const skipped = [];

  for (const path of paths) {
    const html = await r2read(env, `${slug}${path}`);
    if (!html) continue;
    let updated = html;
    const appliedFixes = [];

    for (const fp of FOOTPRINTS) {
      try {
        if (fp.detect(updated, {...ctx, path})) {
          const before = updated;
          updated = fp.fix(updated, {...ctx, path});
          if (updated !== before) appliedFixes.push(fp.id);
        }
      } catch {}
    }

    // Inject hreflang if langs provided and page is HTML
    if (langs.length > 1 && !updated.includes('hreflang')) {
      updated = injectHreflang(updated, domain, path, langs, lang);
      appliedFixes.push('hreflang-injected');
    }

    // Ensure canonical uses custom domain
    if (!updated.includes(`canonical" href="https://${domain}`)) {
      const ogUrl = updated.match(/property="og:url" content="([^"]+)"/)?.[1];
      if (ogUrl) {
        const canonicalUrl = ogUrl.replace(/^https?:\/\/[^\/]+/, `https://${domain === domain ? 'www.'+domain : domain}`);
        updated = updated.replace(/<link[^>]*rel="canonical"[^>]*>/gi, '');
        updated = updated.replace('</head>', `<link rel="canonical" href="${canonicalUrl}">\n</head>`);
        appliedFixes.push('canonical-updated');
      }
    }

    // Fix schema.org domain references
    if (domain && !updated.includes(`"url":"https://www.${domain}`)) {
      const urlPattern = /"url":"https:\/\/[^"\/]+(\/[^"]*)"/g;
      updated = updated.replace(urlPattern, (m, path) => `"url":"https://www.${domain}${path}"`);
      appliedFixes.push('schema-domain-fixed');
    }

    if (appliedFixes.length) {
      await r2write(env, `${slug}${path}`, updated);
      fixed.push({path, fixes:appliedFixes});
    } else {
      skipped.push(path);
    }
  }

  // Update robots.txt
  const robots = generateRobots(domain, langs);
  await r2write(env, `${slug}/robots.txt`, robots, 'text/plain');
  fixed.push({path:'/robots.txt', fixes:['hardened-robots-generated']});

  return {slug, domain, fixed_pages:fixed.length, skipped_pages:skipped.length, fixed, skipped};
}

// ── Hreflang bulk injection ───────────────────────────────────────────────
async function injectHreflangAll(env, slug, domain, langs, defaultLang='fr') {
  const updated = [];
  // List all HTML pages
  const list = await env.R2.list({prefix:`${slug}/`, limit:500}).catch(()=>({objects:[]}));
  const htmlKeys = list.objects.filter(o => !o.key.match(/\.(xml|txt|json)$/) && o.key !== `${slug}/`);
  // Include homepage
  const allKeys = [`${slug}/`, ...htmlKeys.map(o=>o.key)];

  for (const key of allKeys) {
    const html = await r2read(env, key);
    if (!html || !html.includes('<!DOCTYPE')) continue;
    const path = '/'+key.replace(`${slug}`, '').replace(/^\/+/,'');
    const normalPath = path.endsWith('/')?path:path+'/';
    const withHreflang = injectHreflang(html, domain, normalPath, langs, defaultLang);
    await r2write(env, key, withHreflang);
    updated.push(normalPath);
  }
  return {slug, domain, langs, pages_updated:updated.length, pages:updated};
}

// ── Diversify patterns across multiple sites ──────────────────────────────
// Adds subtle HTML variations to make sites look independent
async function diversifySite(env, slug, domain) {
  const homeHtml = await r2read(env, `${slug}/`);
  if (!homeHtml) return {slug, status:'no-homepage'};

  let html = homeHtml;
  const changes = [];

  // 1. Vary the cache-control meta hint
  const cacheHints = ['no-transform', 'must-revalidate', ''];
  const hint = cacheHints[Math.abs(slug.charCodeAt(0)) % cacheHints.length];
  if (hint && !html.includes('http-equiv="Cache-Control"')) {
    html = html.replace('</head>', `<meta http-equiv="Cache-Control" content="${hint}">\n</head>`);
    changes.push('cache-hint-varied');
  }

  // 2. Add unique page load timing comment (varies per domain)
  const domainHash = domain.split('').reduce((h,c)=>((h<<5)-h)+c.charCodeAt(0)|0,0).toString(36).replace('-','');
  if (!html.includes('domain-signature')) {
    html = html.replace('</body>', `<!-- domain-signature:${domainHash} --></body>`);
    changes.push('domain-signature-added');
  }

  // 3. Vary the last-modified date slightly (add 1-3 days based on domain hash)
  // Schema.org datePublished
  const dayOffset = Math.abs(domain.charCodeAt(0)) % 5;
  const variedDate = new Date(Date.now() - dayOffset * 86400000).toISOString().slice(0,10);
  html = html.replace(/"datePublished":"[\d-]+"/, `"datePublished":"${variedDate}"`);
  changes.push('schema-date-varied');

  // 4. Ensure OG locale is set correctly (not shared default)
  if (!html.includes('og:locale')) {
    html = html.replace('</head>', `<meta property="og:locale" content="fr_FR">\n</head>`);
    changes.push('og-locale-added');
  }

  if (changes.length) await r2write(env, `${slug}/`, html);
  return {slug, domain, changes};
}

// ── Main handler ──────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:CORS});

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/,'');

    let body = {};
    if (request.method==='POST') { try { body=await request.json(); } catch {} }

    // ── GET /report ───────────────────────────────────────────────────────
    if (request.method==='GET' && path==='/report') {
      const slug = url.searchParams.get('slug');
      if (!slug) return err('slug param required');
      const raw = await env.KV.get(`fp:report:${slug}`).catch(()=>null);
      return ok({slug, report: raw ? JSON.parse(raw) : null});
    }

    if (request.method !== 'POST') return err('POST or GET only', 405);

    // ── POST /scan ────────────────────────────────────────────────────────
    if (path==='/scan') {
      const {slug, domain, langs=[]} = body;
      if (!slug||!domain) return err('slug and domain required');
      const report = await scanSite(env, slug, domain, langs);
      return ok({report});
    }

    // ── POST /fix ─────────────────────────────────────────────────────────
    if (path==='/fix') {
      const {slug, domain, lang='fr', langs=[]} = body;
      if (!slug||!domain) return err('slug and domain required');
      const result = await fixSite(env, slug, domain, lang, langs);
      return ok(result);
    }

    // ── POST /hreflang ────────────────────────────────────────────────────
    // { slug, domain, langs:['fr','en','de',...], default_lang:'fr' }
    if (path==='/hreflang') {
      const {slug, domain, langs=[], default_lang='fr'} = body;
      if (!slug||!domain||!langs.length) return err('slug, domain, langs[] required');
      if (langs.length > 20) return err('Max 20 languages');
      const result = await injectHreflangAll(env, slug, domain, langs, default_lang);
      return ok(result);
    }

    // ── POST /robots ──────────────────────────────────────────────────────
    if (path==='/robots') {
      const {slug, domain, langs=[], sitemap_slugs=[]} = body;
      if (!slug||!domain) return err('slug and domain required');
      const robots = generateRobots(domain, langs, sitemap_slugs);
      await r2write(env, `${slug}/robots.txt`, robots, 'text/plain');
      return ok({slug, domain, robots, updated:true});
    }

    // ── POST /scan-all ────────────────────────────────────────────────────
    if (path==='/scan-all') {
      const {sites=[]} = body; // [{slug, domain, langs:[]}]
      if (!sites.length) return err('sites[] required');
      if (sites.length > 20) return err('Max 20 sites per batch');
      const reports = await Promise.all(sites.map(s => scanSite(env, s.slug, s.domain, s.langs||[])));
      const summary = {
        total: reports.length,
        safe: reports.filter(r=>r.status==='SAFE').length,
        watch: reports.filter(r=>r.status==='WATCH').length,
        risk: reports.filter(r=>r.status==='RISK').length,
        critical: reports.filter(r=>r.status==='CRITICAL').length,
      };
      return ok({summary, reports: reports.map(r=>({slug:r.slug,domain:r.domain,score:r.score,status:r.status,issues:r.issues.length,warnings:r.warnings.length}))});
    }

    // ── POST /diversify ───────────────────────────────────────────────────
    if (path==='/diversify') {
      const {sites=[]} = body; // [{slug, domain}]
      if (!sites.length) return err('sites[] required');
      const results = await Promise.all(sites.map(s => diversifySite(env, s.slug, s.domain)));
      return ok({diversified:results.length, results});
    }

    // ── POST /full-protect ────────────────────────────────────────────────
    // Complete protection pass: scan + fix + hreflang + robots + diversify
    if (path==='/full-protect') {
      const {slug, domain, lang='fr', langs=['fr'], default_lang='fr'} = body;
      if (!slug||!domain) return err('slug and domain required');

      const [scanResult, fixResult, hreflangResult, diversifyResult] = await Promise.all([
        scanSite(env, slug, domain, langs),
        fixSite(env, slug, domain, lang, langs),
        injectHreflangAll(env, slug, domain, langs, default_lang),
        diversifySite(env, slug, domain),
      ]);
      // Robots last (after fix may have updated pages)
      const robots = generateRobots(domain, langs);
      await r2write(env, `${slug}/robots.txt`, robots, 'text/plain');

      return ok({
        slug, domain,
        scan: {score:scanResult.score, status:scanResult.status, issues:scanResult.issues.length},
        fix: {pages_fixed:fixResult.fixed_pages},
        hreflang: {pages_updated:hreflangResult.pages_updated},
        diversify: {changes:diversifyResult.changes?.length||0},
        robots: 'updated',
        summary: `Protection complete — score was ${scanResult.score}/100 (${scanResult.status})`,
      });
    }

    return err('Endpoints: /scan, /fix, /hreflang, /robots, /scan-all, /diversify, /full-protect, GET /report', 404);
  }
};
