/**
 * Sentinelle v2 — Moniteur de santé des workers CF en temps réel
 * Cron: toutes les 5 min · Alerte KV après 3 échecs consécutifs
 * GET /report  → état de santé de tous les workers
 * GET /health  → 200 si tout OK, 503 si critique DOWN
 * GET /alerts  → alertes actives
 */

const WORKERS = {
  'site-server':   'https://v35-site-server.ernestpedanou.workers.dev/',
  'site-factory':  'https://v35-site-factory.ernestpedanou.workers.dev/',
  'orchestrator':  'https://v35-orchestrator.ernestpedanou.workers.dev/runs',
  'content-ai':    'https://v35-content-ai.ernestpedanou.workers.dev/',
  'admin':         'https://v35-admin.ernestpedanou.workers.dev/',
  'backup':        'https://v35-backup.ernestpedanou.workers.dev/status',
  'sequenceur':    'https://v35-sequenceur.ernestpedanou.workers.dev/',
};

// Workers critiques → alerte si DOWN (les autres = warning seulement)
const CRITICAL = new Set(['site-server','orchestrator','admin']);

const CORS = {'Access-Control-Allow-Origin':'same-origin','Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
const resp = (d,s=200) => new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json',...CORS}});

export default {
  async scheduled(event, env) { await runChecks(env); },
  async fetch(request, env) {
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
    const path=new URL(request.url).pathname;
    if(path==='/report')return resp(await getReport(env));
    if(path==='/health')return resp(...await getHealth(env));
    if(path==='/alerts')return resp(await getAlerts(env));
    return resp({status:'sentinelle',cron:'*/5 * * * *',workers:Object.keys(WORKERS)});
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
  return {ts: new Date().toISOString(), active_alerts: alerts.length, alerts};
}
