// V35 Gemini Proxy — CF Worker
// Clés stockées en secrets, jamais exposées au browser
// Rotation automatique entre N projets GCP (chacun = 1500 req/jour gratuit)
// IP Cloudflare = jamais suspendu par Google

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Auth',
};

// Modèles supportés
const MODELS = {
  'gemini-2.5-flash':       'gemini-2.5-flash',
  'gemini-2.5-pro':         'gemini-2.5-pro',
  'gemini-2.0-flash':       'gemini-2.0-flash',
  'gemini-1.5-pro':         'gemini-1.5-pro',
  'gemini-1.5-flash':       'gemini-1.5-flash',
};

// Lecture des clés depuis les secrets CF
// Format: GEMINI_KEYS = "key1,key2,key3,..." (une par projet GCP)
function getKeys(env) {
  const raw = env.GEMINI_KEYS || '';
  return raw.split(',').map(k => k.trim()).filter(Boolean);
}

// Sélection de clé : round-robin via KV ou index depuis l'heure
async function pickKey(keys, env) {
  if (keys.length === 1) return { key: keys[0], index: 0 };
  // Rotation par tranche horaire (pas de KV requis)
  const slot = Math.floor(Date.now() / (60 * 1000)) % keys.length;
  return { key: keys[slot], index: slot };
}

// Appel Gemini direct
async function callGemini(key, model, prompt, opts = {}) {
  const modelId = MODELS[model] || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${key}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature:     opts.temperature     ?? 0.4,
      maxOutputTokens: opts.maxTokens       ?? 4096,
      topP:            opts.topP            ?? 0.95,
    },
  };

  if (opts.systemPrompt) {
    body.systemInstruction = { parts: [{ text: opts.systemPrompt }] };
  }

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(55000),
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: { message: r.statusText } }));
    throw new Error(`[${r.status}] ${err.error?.message || r.statusText}`);
  }

  const d = await r.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST') return new Response('POST only', { status: 405, headers: CORS });

    function ok(data)  { return Response.json({ ok: true,  ...data }, { headers: CORS }); }
    function fail(msg, s=400) { return Response.json({ ok: false, error: msg }, { status: s, headers: CORS }); }

    // Auth optionnelle via header X-Auth
    const secret = env.AUTH_SECRET;
    if (secret) {
      const auth = request.headers.get('X-Auth') || '';
      if (auth !== secret) return fail('Unauthorized', 401);
    }

    let body;
    try { body = await request.json(); } catch { return fail('Invalid JSON'); }

    const { prompt, model = 'gemini-2.5-flash', temperature, maxTokens, systemPrompt } = body;
    if (!prompt) return fail('prompt required');

    const keys = getKeys(env);
    if (!keys.length) return fail('No GEMINI_KEYS configured', 500);

    // Rotation avec retry sur 429/403
    let lastErr;
    const tried = new Set();

    for (let attempt = 0; attempt < keys.length; attempt++) {
      // Choisir une clé pas encore essayée
      let keyIndex = (Math.floor(Date.now() / 60000) + attempt) % keys.length;
      while (tried.has(keyIndex) && tried.size < keys.length) {
        keyIndex = (keyIndex + 1) % keys.length;
      }
      tried.add(keyIndex);
      const key = keys[keyIndex];

      try {
        const text = await callGemini(key, model, prompt, { temperature, maxTokens, systemPrompt });
        return ok({ text, model, key_index: keyIndex, keys_total: keys.length });
      } catch(e) {
        lastErr = e;
        const fatal = /403|suspended|denied|permission/i.test(e.message);
        const quota = /429|quota|RESOURCE_EXHAUSTED/i.test(e.message);

        if (fatal || quota) continue; // essayer clé suivante
        break; // erreur non-récupérable (bad request, etc.)
      }
    }

    return fail(lastErr?.message || 'All keys failed', 503);
  },
};
