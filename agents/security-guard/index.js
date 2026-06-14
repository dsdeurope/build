// V35 Security Guard — WAF + Sandbox + IP management + PBN isolation
//
// POST /sandbox/enable   → isolate a site {slug, reason}
// POST /sandbox/disable  → restore site {slug}
// POST /sandbox/audit    → security audit of a site {slug}
// GET  /sandbox/list     → all sandboxed sites
// GET  /sandbox/log?slug → access log during sandbox
// POST /ip/block         → {ip, reason, duration_h?}
// POST /ip/unblock       → {ip}
// GET  /ip/list          → all blocked IPs
// POST /ip/analyze       → analyze suspicious IPs for a slug
// POST /alert/test       → test alert system
// GET  /health           → system health check
// GET  /threats          → recent threat summary

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};
const ok  = (d,s=200) => new Response(JSON.stringify({ok:true,...d}),{status:s,headers:{'Content-Type':'application/json',...CORS}});
const err = (m,s=400) => new Response(JSON.stringify({ok:false,error:m}),{status:s,headers:{'Content-Type':'application/json',...CORS}});

// ── Auth check ────────────────────────────────────────────────────────────
function checkAuth(request, env) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace('Bearer ','');
  // Use API_TOKEN from wrangler secrets or env
  return !env.API_TOKEN || token === env.API_TOKEN;
}

// ── Sandbox management ────────────────────────────────────────────────────
async function enableSandbox(env, slug, reason, triggeredBy='manual') {
  const state = {
    active: true, slug, reason, triggeredBy,
    enabledAt: new Date().toISOString(),
    accessLog: [],
  };
  await env.KV.put(`sandbox:${slug}`, JSON.stringify(state), {expirationTtl: 86400*30});
  // Add to sandbox index
  const raw = await env.KV.get('sandbox:index').catch(()=>null);
  const idx = raw ? JSON.parse(raw) : [];
  const existing = idx.findIndex(x=>x.slug===slug);
  const entry = {slug, reason, triggeredBy, enabledAt: state.enabledAt, active:true};
  if (existing>=0) idx[existing]=entry; else idx.unshift(entry);
  await env.KV.put('sandbox:index', JSON.stringify(idx.slice(0,100)), {expirationTtl:86400*90});
  return state;
}

async function disableSandbox(env, slug, restoredBy='manual') {
  const raw = await env.KV.get(`sandbox:${slug}`).catch(()=>null);
  if (!raw) return {was_active:false};
  const state = JSON.parse(raw);
  state.active = false;
  state.restoredAt = new Date().toISOString();
  state.restoredBy = restoredBy;
  // Keep history for 7 days after restore
  await env.KV.put(`sandbox:${slug}`, JSON.stringify(state), {expirationTtl:86400*7});
  // Update index
  const idxRaw = await env.KV.get('sandbox:index').catch(()=>null);
  if (idxRaw) {
    const idx = JSON.parse(idxRaw);
    const e = idx.find(x=>x.slug===slug);
    if (e) { e.active=false; e.restoredAt=state.restoredAt; }
    await env.KV.put('sandbox:index', JSON.stringify(idx), {expirationTtl:86400*90});
  }
  return state;
}

// ── Security audit of a site ──────────────────────────────────────────────
async function auditSite(env, slug) {
  const report = {
    slug,
    auditedAt: new Date().toISOString(),
    checks: [],
    score: 0,
    issues: [],
    warnings: [],
  };

  const addCheck = (name, passed, severity='info', detail='') => {
    report.checks.push({name, passed, severity, detail});
    if (!passed) {
      if (severity==='critical'||severity==='high') report.issues.push({name,detail});
      else report.warnings.push({name,detail});
    }
  };

  // 1. Check homepage exists
  const homeHtml = env.R2 ? await env.R2.get(`${slug}/`).then(o=>o?new Response(o.body).text():null).catch(()=>null) : null;
  addCheck('homepage-exists', !!homeHtml, 'critical', homeHtml?'OK':'Homepage missing from R2');

  if (homeHtml) {
    // 2. No personal email exposed (check for gmail, hotmail, etc.)
    const personalEmailRe = /@(gmail|hotmail|yahoo|outlook|live|icloud)\./i;
    addCheck('no-personal-email', !personalEmailRe.test(homeHtml), 'high',
      personalEmailRe.test(homeHtml) ? 'Personal email found in HTML — replace with domain email' : 'OK');

    // 3. No phone number exposed in a way that could identify owner
    const phoneRe = /\+33[0-9\s\-\.]{8,}|\b0[67][0-9\s\-\.]{8,}/;
    addCheck('no-personal-phone', !phoneRe.test(homeHtml), 'high',
      phoneRe.test(homeHtml) ? 'Personal phone number found in HTML' : 'OK');

    // 4. Canonical tag present
    const hasCanonical = homeHtml.includes('rel="canonical"');
    addCheck('canonical-tag', hasCanonical, 'medium', hasCanonical?'OK':'Missing canonical tag');

    // 5. Meta robots not set to noindex (unless intentional)
    const hasNoindex = /name="robots"[^>]*noindex/i.test(homeHtml);
    addCheck('not-noindexed', !hasNoindex, 'high', hasNoindex?'Homepage has noindex!':'OK');

    // 6. No shared analytics IDs visible
    const analyticsRe = /(UA-\d{5,}-\d+|G-[A-Z0-9]{8,}|GTM-[A-Z0-9]{5,})/;
    addCheck('no-hardcoded-analytics', !analyticsRe.test(homeHtml), 'medium',
      analyticsRe.test(homeHtml) ? `Analytics ID found: ${homeHtml.match(analyticsRe)?.[1]} — remove or use domain-specific` : 'OK');

    // 7. No CF Workers URL exposed (would link all sites to same worker)
    const cfWorkerRe = /ernestpedanou\.workers\.dev|\.workers\.dev/;
    addCheck('no-worker-url-exposed', !cfWorkerRe.test(homeHtml), 'critical',
      cfWorkerRe.test(homeHtml) ? 'Worker URL found in HTML — replace with custom domain' : 'OK');

    // 8. No common CMS fingerprint
    const cmsRe = /(wp-content|wp-includes|shopify\.com\/s\/files|cdn\.shopify)/i;
    addCheck('no-cms-fingerprint', !cmsRe.test(homeHtml), 'medium',
      cmsRe.test(homeHtml) ? 'CMS fingerprint detected' : 'OK');

    // 9. Schema.org domain matches slug
    const domainInSchema = homeHtml.includes(`"url":"https://${slug}`) || homeHtml.includes(`"url": "https://${slug}`);
    addCheck('schema-domain-match', domainInSchema, 'low', domainInSchema?'OK':'Schema.org URL may not match domain');

    // 10. GDPR mentions present (legal compliance)
    const hasGdpr = homeHtml.includes('confidentialite') || homeHtml.includes('privacy') || homeHtml.includes('RGPD') || homeHtml.includes('GDPR');
    addCheck('gdpr-link-present', hasGdpr, 'medium', hasGdpr?'OK':'No GDPR/privacy link found');

    // 11. No wp-admin or admin paths linked
    const adminRe = /href="[^"]*\/(wp-admin|admin|administrator|backend|manager)/i;
    addCheck('no-admin-links', !adminRe.test(homeHtml), 'high', adminRe.test(homeHtml)?'Admin link found in HTML':'OK');

    // 12. No plaintext passwords or tokens in HTML
    const secretRe = /(sk-[a-zA-Z0-9]{20,}|cfut_[a-zA-Z0-9]{20,}|api[_-]?key[^a-z]*[:=][^"'\s]{10,})/i;
    addCheck('no-secrets-in-html', !secretRe.test(homeHtml), 'critical',
      secretRe.test(homeHtml) ? '⚠️ CREDENTIAL FOUND IN HTML — immediate action required' : 'OK');
  }

  // Check robots.txt
  const robotsTxt = env.R2 ? await env.R2.get(`${slug}/robots.txt`).then(o=>o?new Response(o.body).text():null).catch(()=>null) : null;
  addCheck('robots-txt-exists', !!robotsTxt, 'medium', robotsTxt?'OK':'robots.txt missing');
  if (robotsTxt) {
    addCheck('robots-blocks-checkout', robotsTxt.includes('/checkout'), 'low', 'OK');
    addCheck('robots-blocks-api', robotsTxt.includes('/api'), 'low', 'OK');
  }

  // Rate limit check — has the site been getting hammered?
  const dayHitsRaw = await env.KV.get(`site-hits:${slug}:day`).catch(()=>null);
  const dayHits = parseInt(dayHitsRaw||'0');
  addCheck('normal-traffic', dayHits < 5000, 'info', dayHits < 5000 ? `${dayHits} requests today` : `High traffic: ${dayHits} requests today`);

  const passed = report.checks.filter(c=>c.passed).length;
  report.score = Math.round((passed/report.checks.length)*100);
  report.summary = report.score>=90?'SAFE':report.score>=70?'WARNING':report.score>=50?'RISK':'CRITICAL';

  // Store audit report
  await env.KV.put(`audit:${slug}:latest`, JSON.stringify(report), {expirationTtl:86400*30}).catch(()=>{});

  // Auto-sandbox if critical issues found
  if (report.issues.filter(i=>i.severity==='critical').length > 0 || report.summary==='CRITICAL') {
    await enableSandbox(env, slug, `Auto-sandboxed: critical audit issues — ${report.issues.map(i=>i.name).join(', ')}`, 'auto-audit');
    report.auto_sandboxed = true;
  }

  return report;
}

// ── IP management ─────────────────────────────────────────────────────────
async function blockIP(env, ip, reason, duration_h=24) {
  const entry = {ip, reason, blockedAt:new Date().toISOString(), expires:new Date(Date.now()+duration_h*3600000).toISOString()};
  await env.KV.put(`block:ip:${ip}`, JSON.stringify(entry), {expirationTtl:duration_h*3600});
  // Add to IP block index
  const raw = await env.KV.get('block:ip:index').catch(()=>null);
  const idx = raw ? JSON.parse(raw) : [];
  idx.unshift({...entry, active:true});
  await env.KV.put('block:ip:index', JSON.stringify(idx.slice(0,500)), {expirationTtl:86400*90});
  return entry;
}

async function unblockIP(env, ip) {
  await env.KV.delete(`block:ip:${ip}`).catch(()=>{});
  const raw = await env.KV.get('block:ip:index').catch(()=>null);
  if (raw) {
    const idx = JSON.parse(raw);
    const e = idx.find(x=>x.ip===ip);
    if (e) { e.active=false; e.unblockedAt=new Date().toISOString(); }
    await env.KV.put('block:ip:index', JSON.stringify(idx), {expirationTtl:86400*90});
  }
}

async function analyzeIPs(env, slug) {
  // Scan KV for rate-limit keys with high counts
  const suspicious = [];
  // Access logs during sandbox periods
  const sandboxRaw = await env.KV.get(`sandbox:${slug}`).catch(()=>null);
  if (sandboxRaw) {
    const state = JSON.parse(sandboxRaw);
    if (state.accessLog?.length) {
      const ipCount = {};
      state.accessLog.forEach(l => { ipCount[l.ip]=(ipCount[l.ip]||0)+1; });
      Object.entries(ipCount).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([ip,count])=>{
        suspicious.push({ip, requests:count, flag:'sandbox-access'});
      });
    }
  }
  return {slug, suspicious, recommendation: suspicious.length ? 'Block top IPs via POST /ip/block' : 'No suspicious IPs detected'};
}

// ── Threat summary ────────────────────────────────────────────────────────
async function getThreatSummary(env) {
  const [sandboxRaw, blockRaw] = await Promise.all([
    env.KV.get('sandbox:index').catch(()=>null),
    env.KV.get('block:ip:index').catch(()=>null),
  ]);
  const sandboxed = sandboxRaw ? JSON.parse(sandboxRaw).filter(s=>s.active) : [];
  const blocked = blockRaw ? JSON.parse(blockRaw).filter(b=>b.active) : [];
  return {
    sandboxed_sites: sandboxed.length,
    blocked_ips: blocked.length,
    sandboxed: sandboxed,
    recent_blocks: blocked.slice(0,10),
    summary: sandboxed.length===0&&blocked.length===0 ? 'CLEAN' : sandboxed.length>0 ? 'ALERT' : 'WATCH',
  };
}

// ── Main handler ──────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:CORS});

    if (!checkAuth(request, env)) {
      return new Response(JSON.stringify({ok:false,error:'Unauthorized'}),
        {status:401,headers:{'WWW-Authenticate':'Bearer realm="v35"','Content-Type':'application/json'}});
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/,'');

    let body = {};
    if (request.method==='POST') { try { body=await request.json(); } catch {} }

    // ── GET /health ───────────────────────────────────────────────────────
    if (request.method==='GET' && path==='/health') {
      const threats = await getThreatSummary(env);
      return ok({status:'operational', ...threats, ts:new Date().toISOString()});
    }

    // ── GET /threats ──────────────────────────────────────────────────────
    if (request.method==='GET' && path==='/threats') {
      return ok(await getThreatSummary(env));
    }

    // ── POST /sandbox/enable ──────────────────────────────────────────────
    if (path==='/sandbox/enable') {
      const {slug, reason='Manual isolation'} = body;
      if (!slug) return err('slug required');
      const state = await enableSandbox(env, slug, reason, 'manual');
      return ok({slug, sandboxed:true, reason, enabledAt:state.enabledAt,
        message:`Site ${slug} is now isolated. It returns 503 to all visitors.`});
    }

    // ── POST /sandbox/disable ─────────────────────────────────────────────
    if (path==='/sandbox/disable') {
      const {slug} = body;
      if (!slug) return err('slug required');
      const state = await disableSandbox(env, slug, 'manual');
      return ok({slug, sandboxed:false, restoredAt:state.restoredAt,
        message:`Site ${slug} is now live again.`});
    }

    // ── POST /sandbox/audit ───────────────────────────────────────────────
    if (path==='/sandbox/audit') {
      const {slug} = body;
      if (!slug) return err('slug required');
      const report = await auditSite(env, slug);
      return ok({audit: report});
    }

    // ── GET /sandbox/list ─────────────────────────────────────────────────
    if (request.method==='GET' && path==='/sandbox/list') {
      const raw = await env.KV.get('sandbox:index').catch(()=>null);
      const all = raw ? JSON.parse(raw) : [];
      return ok({total:all.length, active:all.filter(s=>s.active).length, sites:all});
    }

    // ── GET /sandbox/log ─────────────────────────────────────────────────
    if (request.method==='GET' && path==='/sandbox/log') {
      const slug = url.searchParams.get('slug');
      if (!slug) return err('slug param required');
      // List access keys during sandbox
      const raw = await env.KV.get(`sandbox:${slug}`).catch(()=>null);
      const state = raw ? JSON.parse(raw) : null;
      return ok({slug, state, log: state?.accessLog||[]});
    }

    // ── POST /sandbox/audit-all ───────────────────────────────────────────
    if (path==='/sandbox/audit-all') {
      const {slugs=[]} = body;
      if (!slugs.length) return err('slugs[] required');
      const reports = await Promise.all(slugs.slice(0,10).map(slug => auditSite(env, slug)));
      const critical = reports.filter(r=>r.summary==='CRITICAL'||r.auto_sandboxed);
      return ok({audited:reports.length, critical:critical.length, reports: reports.map(r=>({slug:r.slug,score:r.score,summary:r.summary,issues:r.issues.length,auto_sandboxed:r.auto_sandboxed}))});
    }

    // ── POST /ip/block ────────────────────────────────────────────────────
    if (path==='/ip/block') {
      const {ip, reason='Manual block', duration_h=24} = body;
      if (!ip) return err('ip required');
      if (!/^[\d.a-f:]+$/.test(ip)) return err('Invalid IP format');
      const entry = await blockIP(env, ip, reason, duration_h);
      return ok({blocked:true, ...entry});
    }

    // ── POST /ip/unblock ──────────────────────────────────────────────────
    if (path==='/ip/unblock') {
      const {ip} = body;
      if (!ip) return err('ip required');
      await unblockIP(env, ip);
      return ok({ip, unblocked:true});
    }

    // ── GET /ip/list ──────────────────────────────────────────────────────
    if (request.method==='GET' && path==='/ip/list') {
      const raw = await env.KV.get('block:ip:index').catch(()=>null);
      const all = raw ? JSON.parse(raw) : [];
      const active = all.filter(x=>x.active);
      return ok({total:all.length, active:active.length, ips:all.slice(0,100)});
    }

    // ── POST /ip/analyze ─────────────────────────────────────────────────
    if (path==='/ip/analyze') {
      const {slug} = body;
      if (!slug) return err('slug required');
      return ok(await analyzeIPs(env, slug));
    }

    // ── GET /audit/history?slug=x ─────────────────────────────────────────
    if (request.method==='GET' && path==='/audit/history') {
      const slug = url.searchParams.get('slug');
      if (!slug) return err('slug param required');
      const raw = await env.KV.get(`audit:${slug}:latest`).catch(()=>null);
      return ok({slug, latest_audit: raw ? JSON.parse(raw) : null});
    }

    return err('Not found. Endpoints: /sandbox/enable|disable|audit|list|log|audit-all, /ip/block|unblock|list|analyze, /health, /threats, /audit/history', 404);
  }
};
