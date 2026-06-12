/**
 * Agent: Optimiseur
 * Ajustement dynamique — rate limiting, proxies, paramètres workers.
 */

import { getErrorRate, logInfo } from '../../lib/logger.js';

const DEFAULT_CONFIG = {
  rateLimit: { requestsPerMinute: 20, delayMs: 3000 },
  retryMax: 3,
  timeoutMs: 10000,
};

export default {
  async scheduled(event, env) {
    await optimize(env);
  },
  async fetch(request, env) {
    const result = await optimize(env);
    return Response.json(result);
  },
};

async function optimize(env) {
  const workers = ['radar', 'backlink-hunter', 'domain-health'];
  const adjustments = [];

  for (const worker of workers) {
    const errorRate = await getErrorRate(env, worker, 3600000);
    const current = await getWorkerConfig(env, worker);
    const next = { ...current };

    if (errorRate > 20) {
      // Trop d'erreurs → ralentir
      next.rateLimit.requestsPerMinute = Math.max(5, current.rateLimit.requestsPerMinute - 5);
      next.rateLimit.delayMs = Math.min(10000, current.rateLimit.delayMs + 1000);
      adjustments.push({ worker, action: 'throttle-down', errorRate });
    } else if (errorRate < 3) {
      // Peu d'erreurs → accélérer doucement
      next.rateLimit.requestsPerMinute = Math.min(60, current.rateLimit.requestsPerMinute + 2);
      next.rateLimit.delayMs = Math.max(1000, current.rateLimit.delayMs - 500);
      adjustments.push({ worker, action: 'throttle-up', errorRate });
    }

    await env.KV.put(`config:${worker}`, JSON.stringify(next));
  }

  const report = { ts: new Date().toISOString(), adjustments };
  await logInfo(env, 'optimiseur', 'cycle-complete', report);
  await env.KV.put('optimiseur:last-report', JSON.stringify(report));
  return report;
}

async function getWorkerConfig(env, worker) {
  const raw = await env.KV.get(`config:${worker}`);
  return raw ? JSON.parse(raw) : { ...DEFAULT_CONFIG };
}
