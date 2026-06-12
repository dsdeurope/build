/**
 * Agent: Sentinelle
 * Surveillance sécurité — détection fuite IP, ban, anomalies.
 */

import { getRecentErrors, logInfo } from '../../lib/logger.js';

const THREAT_THRESHOLDS = {
  errorSpike: 10,       // erreurs/heure avant alerte
  banSignals: ['403', '429', '451', 'blocked', 'captcha', 'cloudflare'],
  ipLeakSignals: ['x-real-ip', 'x-forwarded-for', 'cf-connecting-ip'],
};

export default {
  async scheduled(event, env) {
    await runSentinelle(env);
  },

  async fetch(request, env) {
    const report = await runSentinelle(env);
    return Response.json(report);
  },
};

async function runSentinelle(env) {
  const workers = ['radar', 'backlink-hunter', 'domain-health'];
  const report = { ts: new Date().toISOString(), threats: [], actions: [] };

  for (const worker of workers) {
    const errors = await getRecentErrors(env, worker, 50);
    const banDetected = errors.some(e =>
      THREAT_THRESHOLDS.banSignals.some(s => JSON.stringify(e).toLowerCase().includes(s))
    );
    const errorSpike = errors.filter(e => {
      const age = Date.now() - new Date(e.ts).getTime();
      return age < 3600000;
    }).length > THREAT_THRESHOLDS.errorSpike;

    if (banDetected) {
      report.threats.push({ worker, type: 'ban-detected' });
      await triggerProxyRotation(env, worker);
      report.actions.push({ worker, action: 'proxy-rotated' });
    }

    if (errorSpike) {
      report.threats.push({ worker, type: 'error-spike' });
      await pauseWorker(env, worker);
      report.actions.push({ worker, action: 'worker-paused' });
    }
  }

  await logInfo(env, 'sentinelle', 'scan-complete', report);
  await env.KV.put('sentinelle:last-report', JSON.stringify(report));

  // Persist to SECURITY.md equivalent in KV
  if (report.threats.length) {
    const secLog = `[${report.ts}] Threats: ${JSON.stringify(report.threats)} | Actions: ${JSON.stringify(report.actions)}\n`;
    const existing = (await env.KV.get('security-log')) || '';
    await env.KV.put('security-log', existing + secLog);
  }

  return report;
}

async function triggerProxyRotation(env, worker) {
  await env.KV.put(`config:${worker}:force-proxy-rotate`, '1', { expirationTtl: 3600 });
}

async function pauseWorker(env, worker) {
  await env.KV.put(`config:${worker}:paused`, '1', { expirationTtl: 1800 }); // pause 30min
  await env.LOGS.put(`alert:pause:${worker}:${Date.now()}`, JSON.stringify({
    type: 'auto-pause', worker, ts: new Date().toISOString(),
  }));
}
