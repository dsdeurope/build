/**
 * Sentinelle v2 — Moniteur de santé des workers CF en temps réel
 * Cron: toutes les 5 min · Alerte KV après 3 échecs consécutifs
 * GET /report  → état de santé de tous les workers
 * GET /health  → 200 si tout OK, 503 si critique DOWN
 * GET /alerts  → alertes actives
 */

const WORKERS = {
  'site-server':        'https://v35-site-server.ernestpedanou.workers.dev/',
  'site-factory':       'https://v35-site-factory.ernestpedanou.workers.dev/',
  'orchestrator':       'https://v35-orchestrator.ernestpedanou.workers.dev/runs',
  'content-ai':         'https://v35-content-ai.ernestpedanou.workers.dev/',
  'admin':              'https://v35-admin.ernestpedanou.workers.dev/',
  'backup':             'https://v35-backup.ernestpedanou.workers.dev/status',
  'sequenceur':         'https://v35-sequenceur.ernestpedanou.workers.dev/',
  'clone-intel':        'https://v35-clone-intel.ernestpedanou.workers.dev/health',
  'fulfillment':        'https://v35-fulfillment.ernestpedanou.workers.dev/health',
  'image-processor':    'https://v35-image-processor.ernestpedanou.workers.dev/health',
  'scrape-orchestrator':'https://v35-scrape-orchestrator.ernestpedanou.workers.dev/health',
  'site-discover':      'https://v35-site-discover.ernestpedanou.workers.dev/api/health',
  'analytics':          'https://v35-analytics.ernestpedanou.workers.dev/health',
};

// Workers critiques → alerte si DOWN (les autres = warning seulement)
const CRITICAL = new Set(['site-server','orchestrator','admin']);

const CORS = {'Access-Control-Allow-Origin':'same-origin','Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
const resp = (d,s=200) => new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json',...CORS}});

export default {
  async scheduled(event, env) {
    await runChecks(env);
    // Domain expiry check once per day (throttle via KV timestamp)
    const lastDom = await env.KV.get('sentinelle:domains-last-check').catch(()=>null);
    if(!lastDom || Date.now()-new Date(lastDom).getTime() > 82800000) {
      await runDomainChecks(env);
      await env.KV.put('sentinelle:domains-last-check', new Date().toISOString(), {expirationTtl:90000});
    }
  },
  async fetch(request, env) {
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
    const path=new URL(request.url).pathname;
    const m=request.method;
    if(path==='/report')return resp(await getReport(env));
    if(path==='/health')return resp(...await getHealth(env));
    if(path==='/alerts')return resp(await getAlerts(env));
    if(path==='/domains'&&m==='GET')return resp(await getDomains(env));
    if(path==='/domains'&&m==='POST'){
      const{domain}=await request.json().catch(()=>({}));
      if(!domain)return resp({error:'domain requis'},400);
      await addDomain(env,domain);
      return resp({ok:true,domain});
    }
    if(path==='/domains/check'&&m==='POST')return resp(await runDomainChecks(env));
    return resp({status:'sentinelle',crons:['*/5 * * * *','0 8 * * *'],workers:Object.keys(WORKERS)});
  },
};

async function checkWorker(name, url) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      method:'GET',
      signal: AbortSignal.timeout(8000),
      headers:{'User-Agent':'Sentinelle/2.0 (health-check)'},
    });
    const latency = Date.now() - t0;
    // 200/401/404/405 = worker UP (auth or not found = still running)
    const up = r.status < 500;
    return {name, up, status: r.status, latency, ts: new Date().toISOString()};
  } catch(e) {
    return {name, up: false, status: 0, latency: Date.now()-t0, error: e.message, ts: new Date().toISOString()};
  }
}

async function runChecks(env) {
  const results = await Promise.all(
    Object.entries(WORKERS).map(([name, url]) => checkWorker(name, url))
  );

  for (const r of results) {
    const key = `health:${r.name}`;
    const prev = await env.KV.get(key).then(v => v?JSON.parse(v):{failures:0}).catch(()=>({failures:0}));
    const failures = r.up ? 0 : prev.failures + 1;
    const health = {...r, failures, critical: CRITICAL.has(r.name)};
    await env.KV.put(key, JSON.stringify(health), {expirationTtl: 3600});

    // Alerte après 3 échecs consécutifs
    if (!r.up && failures >= 3) {
      await env.KV.put(`alert:down:${r.name}`, JSON.stringify({
        worker: r.name, type:'down', failures, ts: new Date().toISOString(),
        critical: CRITICAL.has(r.name),
      }), {expirationTtl: 1800}); // auto-clear après 30min
    } else if (r.up) {
      await env.KV.delete(`alert:down:${r.name}`).catch(()=>{});
    }
  }

  // Rapport global
  const report = {ts: new Date().toISOString(), results};
  await env.KV.put('sentinelle:last-report', JSON.stringify(report), {expirationTtl: 3600});

  // Log si anomalie
  const anomalies = results.filter(r => !r.up);
  if (anomalies.length) {
    const log = (await env.KV.get('security-log') || '') +
      `[${new Date().toISOString()}] DOWN: ${anomalies.map(r=>r.name).join(',')}\n`;
    await env.KV.put('security-log', log.slice(-50000)); // garde ~50KB max
  }

  return report;
}

async function getReport(env) {
  const workers = Object.keys(WORKERS);
  const healths = await Promise.all(
    workers.map(n => env.KV.get(`health:${n}`).then(v => v?JSON.parse(v):{name:n,up:null,status:'unknown'}).catch(()=>({name:n,up:null})))
  );
  const last = await env.KV.get('sentinelle:last-report').then(v=>v?JSON.parse(v):{}).catch(()=>({}));
  return {
    ts: new Date().toISOString(),
    last_check: last.ts||null,
    workers: healths,
    summary: {
      total: workers.length,
      up: healths.filter(h=>h.up===true).length,
      down: healths.filter(h=>h.up===false).length,
      unknown: healths.filter(h=>h.up===null).length,
    }
  };
}

async function getHealth(env) {
  const report = await getReport(env);
  const criticalDown = report.workers.filter(h=>!h.up&&CRITICAL.has(h.name));
  if (criticalDown.length) return [{status:'degraded', critical_down: criticalDown.map(h=>h.name)}, 503];
  return [{status:'ok', ...report.summary}, 200];
}

async function getAlerts(env) {
  const keys = Object.keys(WORKERS).map(n=>`alert:down:${n}`);
  const alerts = (await Promise.all(
    keys.map(k => env.KV.get(k).then(v=>v?JSON.parse(v):null).catch(()=>null))
  )).filter(Boolean);
  // Also include domain expiry alerts
  const domList = await env.KV.get('monitor:domains').then(v=>v?JSON.parse(v):[]).catch(()=>[]);
  const dAlerts = (await Promise.all(
    domList.map(d=>env.KV.get('alert:expiry:'+d).then(v=>v?JSON.parse(v):null).catch(()=>null))
  )).filter(Boolean);
  return {ts: new Date().toISOString(), active_alerts: alerts.length+dAlerts.length, alerts:[...alerts,...dAlerts]};
}

// ── Domain Expiry via RDAP (gratuit, sans clé) ────────────────────────────
async function addDomain(env, domain) {
  const list = await env.KV.get('monitor:domains').then(v=>v?JSON.parse(v):[]).catch(()=>[]);
  if(!list.includes(domain)) {
    list.push(domain);
    await env.KV.put('monitor:domains', JSON.stringify(list));
  }
}

async function checkDomainExpiry(domain) {
  try {
    const r = await fetch('https://rdap.org/domain/'+encodeURIComponent(domain), {
      signal: AbortSignal.timeout(10000),
      headers: {'Accept':'application/json','User-Agent':'Sentinelle/2.0'},
    });
    if(!r.ok) return {domain, error:'RDAP '+r.status, checked: new Date().toISOString()};
    const data = await r.json();
    const expEvent = (data.events||[]).find(e=>e.eventAction==='expiration');
    if(!expEvent) return {domain, error:'no expiration event', checked: new Date().toISOString()};
    const expiry = new Date(expEvent.eventDate);
    const daysLeft = Math.ceil((expiry - Date.now()) / 86400000);
    return {domain, expiry: expiry.toISOString(), daysLeft, status: daysLeft<7?'CRITICAL':daysLeft<30?'WARNING':'OK', checked: new Date().toISOString()};
  } catch(e) {
    return {domain, error: e.message, checked: new Date().toISOString()};
  }
}

async function runDomainChecks(env) {
  const list = await env.KV.get('monitor:domains').then(v=>v?JSON.parse(v):[]).catch(()=>[]);
  if(!list.length) return {checked:0, results:[]};
  const results = await Promise.all(list.map(d => checkDomainExpiry(d)));
  for(const r of results) {
    await env.KV.put('domain:expiry:'+r.domain, JSON.stringify(r), {expirationTtl: 86400*2});
    if(r.daysLeft !== undefined && r.daysLeft < 30) {
      await env.KV.put('alert:expiry:'+r.domain, JSON.stringify({
        type:'expiry', domain:r.domain, daysLeft:r.daysLeft, expiry:r.expiry,
        critical:r.daysLeft<7, ts:new Date().toISOString(),
      }), {expirationTtl: 86400});
    } else if(r.daysLeft >= 30) {
      await env.KV.delete('alert:expiry:'+r.domain).catch(()=>{});
    }
  }
  return {checked: results.length, ts: new Date().toISOString(), results};
}

async function getDomains(env) {
  const list = await env.KV.get('monitor:domains').then(v=>v?JSON.parse(v):[]).catch(()=>[]);
  const results = await Promise.all(
    list.map(d => env.KV.get('domain:expiry:'+d).then(v=>v?JSON.parse(v):{domain:d,status:'unknown'}).catch(()=>({domain:d,status:'unknown'})))
  );
  const expiring = results.filter(r=>r.daysLeft!==undefined && r.daysLeft<30);
  return {ts: new Date().toISOString(), total: list.length, expiring: expiring.length, domains: results};
}
