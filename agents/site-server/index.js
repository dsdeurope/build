// V35 Site Server — hardened
// Security layers: rate-limit · bot-filter · sandbox · security-headers · anti-clone · IP-block

const MIME = {
  '.html': 'text/html;charset=UTF-8',
  '.xml':  'application/xml',
  '.txt':  'text/plain',
  '.json': 'application/json',
};

// ── Security headers (applied to every HTML response) ─────────────────────
// Deliberately generic — no "Cloudflare Workers", no framework fingerprint
const SEC_HEADERS = {
  'X-Content-Type-Options':   'nosniff',
  'X-Frame-Options':          'SAMEORIGIN',
  'X-XSS-Protection':        '1; mode=block',
  'Referrer-Policy':          'strict-origin-when-cross-origin',
  'Permissions-Policy':       'camera=(), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy':  "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; frame-ancestors 'none'",
  'Cross-Origin-Opener-Policy':   'same-origin',
  'Cross-Origin-Resource-Policy': 'same-site',
};
// Headers to STRIP (fingerprint removal)
const STRIP_HEADERS = ['x-powered-by','server','cf-ray','cf-cache-status','x-site'];

// ── Known bad bots / scrapers / clone tools ───────────────────────────────
const BAD_BOTS = [
  'scrapy','httrack','wget','curl/','python-requests','go-http-client',
  'libwww-perl','java/','clonezilla','websitedownloader','winhttrack',
  'cyotek','surfoffline','webzip','teleport','copyscape','sitebulb',
  'semrushbot','ahrefsbot','mj12bot','dotbot','blexbot','majestic',
  'rogerbot','bytespider','gptbot','ccbot','petalbot','claudebot',
];

// ── Rate limiting (KV: 120 req/min per IP, 1000 req/day per IP) ──────────
async function checkRate(env, ip) {
  if (!env.KV) return false;
  const minKey = `rl:m:${ip}`;
  const dayKey = `rl:d:${ip}`;
  const [min, day] = await Promise.all([
    env.KV.get(minKey).catch(()=>'0'),
    env.KV.get(dayKey).catch(()=>'0'),
  ]);
  const m = parseInt(min||'0'), d = parseInt(day||'0');
  if (m > 120 || d > 1000) return true;
  await Promise.all([
    env.KV.put(minKey, String(m+1), {expirationTtl:60}).catch(()=>{}),
    env.KV.put(dayKey, String(d+1), {expirationTtl:86400}).catch(()=>{}),
  ]);
  return false;
}

// ── IP block check ────────────────────────────────────────────────────────
async function isBlockedIP(env, ip) {
  if (!env.KV || !ip) return false;
  const v = await env.KV.get(`block:ip:${ip}`).catch(()=>null);
  return !!v;
}

// ── Sandbox check ─────────────────────────────────────────────────────────
async function getSandboxState(env, slug) {
  if (!env.KV) return null;
  const v = await env.KV.get(`sandbox:${slug}`).catch(()=>null);
  return v ? JSON.parse(v) : null;
}

// ── Maintenance page ──────────────────────────────────────────────────────
function maintenancePage(slug, reason) {
  return new Response(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="robots" content="noindex,nofollow"><title>Maintenance</title><style>body{font-family:sans-serif;text-align:center;padding:5rem 2rem;background:#f9f9f7;color:#444}h1{font-size:2rem;color:#111;margin-bottom:1rem}p{color:#888;font-size:.95rem;max-width:440px;margin:0 auto}</style></head><body><h1>Site en maintenance</h1><p>Ce site sera de retour très prochainement. Nous nous excusons pour la gêne occasionnée.</p></body></html>`,
    {status:503, headers:{
      'Content-Type':'text/html;charset=UTF-8',
      'Retry-After':'3600',
      'Cache-Control':'no-store',
      'X-Robots-Tag':'noindex, nofollow',
    }}
  );
}

// ── 429 Too Many Requests ─────────────────────────────────────────────────
function tooManyRequests() {
  return new Response('Too Many Requests', {
    status:429,
    headers:{'Retry-After':'60','Content-Type':'text/plain','Cache-Control':'no-store'}
  });
}

// ── 403 Forbidden ─────────────────────────────────────────────────────────
function forbidden() {
  return new Response('Forbidden', {status:403, headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});
}

// ── Apply security headers to a Response ─────────────────────────────────
function applySecHeaders(response, isHtml=true) {
  const init = {status: response.status, headers: {}};
  response.headers.forEach((v,k) => {
    if (!STRIP_HEADERS.includes(k.toLowerCase())) init.headers[k] = v;
  });
  if (isHtml) Object.assign(init.headers, SEC_HEADERS);
  // Never cache sensitive error pages
  if (response.status >= 400) init.headers['Cache-Control'] = 'no-store';
  return new Response(response.body, init);
}

// ── Anti-clone watermark ──────────────────────────────────────────────────
function addWatermark(html, slug) {
  const hash = slug.split('').reduce((h,c)=>((h<<5)-h)+c.charCodeAt(0)|0,0).toString(36);
  const ts = Date.now().toString(36);
  const wm = `<!-- site:${hash} build:${ts} -->`;
  return html.replace('</head>', `${wm}</head>`);
}

// ── Rewrite absolute links to include slug prefix (workers.dev test mode) ──
// In production (custom domain), links like /checkout/ resolve correctly.
// In test mode (*.workers.dev/slug/...) they need to become /slug/checkout/
function rewriteLinks(html, sl) {
  // href="/..." → href="/{sl}/..."  (skip href="//..." protocol-relative and href="#")
  html = html.replace(/href="\/(?!\/)/g, 'href="/' + sl + '/');
  // action="/..." forms
  html = html.replace(/action="\/(?!\/)/g, 'action="/' + sl + '/');
  // JS: location.href='/...' in onclick and scripts
  html = html.replace(/location\.href='\/([^']*)'/g, "location.href='/" + sl + "/$1'");
  // JS: location.href="/..."
  html = html.replace(/location\.href="\/([^"]*)"/g, 'location.href="/' + sl + '/$1"');
  return html;
}

// ── 404 ───────────────────────────────────────────────────────────────────
function notFound(sl) {
  return new Response(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="robots" content="noindex"><title>404</title><style>body{font-family:sans-serif;text-align:center;padding:4rem;color:#555}h1{font-size:3rem;color:#e2e8f0}a{color:#3b82f6}</style></head><body><h1>404</h1><p>Page introuvable.</p><p><a href="/">← Accueil</a></p></body></html>`,
    {status:404, headers:{'Content-Type':'text/html;charset=UTF-8','Cache-Control':'no-store','X-Robots-Tag':'noindex'}}
  );
}

export default {
  async fetch(request, env, ctx) {
    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
    const ua = request.headers.get('user-agent') || '';
    const url = new URL(request.url);

    // ── 1. OPTIONS passthrough ────────────────────────────────────────────
    if (request.method === 'OPTIONS') return new Response(null, {status:204});

    // ── 2. Block known bad bots ───────────────────────────────────────────
    const uaLow = ua.toLowerCase();
    if (BAD_BOTS.some(b => uaLow.includes(b))) return forbidden();

    // ── 3. Block empty/suspicious UAs (only for HTML requests) ───────────
    if (!ua || ua.length < 5) return forbidden();

    // ── 4. IP block check ─────────────────────────────────────────────────
    if (await isBlockedIP(env, ip)) return forbidden();

    // ── 5. Rate limiting ──────────────────────────────────────────────────
    if (await checkRate(env, ip)) return tooManyRequests();

    // ── 6. Route parsing — workers.dev (slug in path) vs custom domain (KV) ──
    const isTestMode = url.hostname.endsWith('.workers.dev');
    let sl, normalPath;
    if (isTestMode) {
      const parts = url.pathname.replace(/^\//, '').split('/');
      sl = parts[0] || url.searchParams.get('site');
      if (!sl) return new Response('', {status:400});
      const p = '/' + parts.slice(1).join('/');
      normalPath = p.endsWith('/') ? p : (p.includes('.') ? p : p + '/');
    } else {
      sl = await env.KV.get('site:hostname:' + url.hostname).catch(()=>null);
      if (!sl) sl = await env.KV.get('site:hostname:' + url.hostname.replace(/^www\./,'')).catch(()=>null);
      if (!sl) return notFound('');
      const p = url.pathname;
      normalPath = p.endsWith('/') ? p : (p.includes('.') ? p : p + '/');
    }
    const testMode = isTestMode;

    // ── 7. Sandbox check ──────────────────────────────────────────────────
    const sandboxState = await getSandboxState(env, sl);
    if (sandboxState?.active) {
      await env.KV.put(`sandbox:${sl}:access:${Date.now()}`, JSON.stringify({ip, ua:ua.slice(0,120), ts:new Date().toISOString()}), {expirationTtl:86400*7}).catch(()=>{});
      return maintenancePage(sl, sandboxState.reason);
    }

    // Block access to internal/sensitive paths
    if (/^\/(api|admin|_|\.env|config|\.git)/i.test(normalPath)) return forbidden();

    const ext = normalPath.includes('.') ? '.' + normalPath.split('.').pop() : '.html';
    const ct = MIME[ext] || 'text/html;charset=UTF-8';
    const isHtml = ct.startsWith('text/html');
    const baseHeaders = {
      'Content-Type': ct,
      'Cache-Control': isHtml
        ? 'public,max-age=3600,stale-while-revalidate=86400'
        : 'public,max-age=86400,stale-while-revalidate=604800',
    };

    // ── 9. Serve from R2 ──────────────────────────────────────────────────
    const geoCountry = request.cf?.country || 'FR';

    if (env.R2) {
      const obj = await env.R2.get(`${sl}${normalPath}`);
      if (obj) {
        if (isHtml) {
          let text = await new Response(obj.body).text();
          text = addWatermark(text, sl);
          text = text.replace('<body', `<body data-geo="${geoCountry}"`);
          if (testMode) text = rewriteLinks(text, sl);
          const res = applySecHeaders(new Response(text, {headers: baseHeaders}), true);
          if (env.KV && ctx) {
            const today = new Date().toISOString().slice(0,10);
            ctx.waitUntil(env.KV.get(`analytics:${sl}:${today}`).then(v=>env.KV.put(`analytics:${sl}:${today}`,String(parseInt(v||'0')+1),{expirationTtl:86400*30})).catch(()=>{}));
          }
          return res;
        }
        return applySecHeaders(new Response(obj.body, {headers: baseHeaders}), false);
      }
    }

    // ── 10. KV fallback (legacy) ──────────────────────────────────────────
    const meta = await env.KV.get(`site:${sl}:__meta`).catch(()=>null);
    if (!meta) return notFound(sl);
    const content = await env.KV.get(`site:${sl}:${normalPath}`).catch(()=>null);
    if (!content) return notFound(sl);

    if (isHtml) {
      let text = addWatermark(content, sl);
      text = text.replace('<body', `<body data-geo="${geoCountry}"`);
      if (testMode) text = rewriteLinks(text, sl);
      return applySecHeaders(new Response(text, {headers: baseHeaders}), true);
    }
    return applySecHeaders(new Response(content, {headers: baseHeaders}), false);
  }
};
