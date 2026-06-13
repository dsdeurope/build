/**
 * V35 Protocol — API Vault & Router
 * Multi-key Gemini (AIza + AQ types) + Qwen/OpenRouter
 * Rotation auto sur 429, retry configurable, routing par element_type
 */

const VAULT_LS_KEY = 'v35_vault_config';

const DEFAULT_CONFIG = {
  protocol: 'V35',
  version: '1.0',
  api_vault: {
    gemini: {
      keys: [],           // [{id, key, type, status, calls_count, last_error}]
      active_index: 0,
    },
    qwen:    { key: '', status: 'inactive', calls_count: 0 },
    groq:    { key: '', status: 'inactive', calls_count: 0 },    // gratuit, 14400 req/jour
    mistral: { key: '', status: 'inactive', calls_count: 0 },    // gratuit, natif FR
  },
  routing_rules: {
    gemini_targets:  ['homepage', 'titres_h1', 'collections', 'collection_intro', 'collection_longues', 'blog'],
    qwen_targets:    ['descriptions_produits'],
    // fallback_order: providers tentés en séquence si Gemini échoue
    fallback_order:  ['gemini', 'mistral', 'groq'],
  },
  error_handling: {
    max_retries: 3,
    retry_delay_seconds: 60,
    switch_on_429: true,
  },
  proxy_settings: {
    target_model:     'gemini-2.5-flash',
    mistral_model:    'mistral-large-latest',
    groq_model:       'llama-3.3-70b-versatile',
    translation_mode: 'anthropic_to_google_api',
  },
};

// ── Vault ────────────────────────────────────────────────────────────────────

export class V35Vault {
  constructor() { this.config = this._load(); }

  _load() {
    try {
      const s = localStorage.getItem(VAULT_LS_KEY);
      if (s) {
        const parsed = JSON.parse(s);
        // Deep merge: keep defaults for missing keys
        return this._deepMerge(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), parsed);
      }
    } catch(e) {}
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  _deepMerge(target, src) {
    for (const k of Object.keys(src)) {
      if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
        if (!target[k]) target[k] = {};
        this._deepMerge(target[k], src[k]);
      } else {
        target[k] = src[k];
      }
    }
    return target;
  }

  save() { localStorage.setItem(VAULT_LS_KEY, JSON.stringify(this.config)); }

  // Import from V35 JSON config (both schema variants)
  importConfig(json) {
    const c = typeof json === 'string' ? JSON.parse(json) : json;
    const vault = c.api_vault || {};

    // Gemini keys — support both schema variants
    const geminiSrc = vault.gemini || vault.google_gemini;
    if (geminiSrc?.keys?.length) {
      const existing = new Map(this.config.api_vault.gemini.keys.map(k => [k.key, k]));
      for (const k of geminiSrc.keys) {
        if (!existing.has(k.key)) {
          this.config.api_vault.gemini.keys.push({
            id: k.id || `key_${Date.now()}`,
            key: k.key,
            type: k.type || detectKeyType(k.key),
            status: k.status || 'active',
            calls_count: k.usage || k.calls_count || 0,
            last_error: null,
          });
        }
      }
    }

    // Qwen
    if (vault.qwen?.key) {
      this.config.api_vault.qwen.key = vault.qwen.key;
      this.config.api_vault.qwen.status = vault.qwen.status || 'active';
    }

    // Rules + error handling
    if (c.routing_rules) this.config.routing_rules = c.routing_rules;
    if (c.error_handling) this.config.error_handling = { ...this.config.error_handling, ...c.error_handling };
    if (c.proxy_settings?.target_model) this.config.proxy_settings.target_model = c.proxy_settings.target_model;

    this.save();
    return this.config.api_vault.gemini.keys.length;
  }

  addGeminiKey(key) {
    if (!key || this.config.api_vault.gemini.keys.find(k => k.key === key)) return false;
    this.config.api_vault.gemini.keys.push({
      id: `key_${Date.now()}`,
      key,
      type: detectKeyType(key),
      status: 'active',
      calls_count: 0,
      last_error: null,
    });
    this.save();
    return true;
  }

  removeGeminiKey(idx) {
    this.config.api_vault.gemini.keys.splice(idx, 1);
    if (this.config.api_vault.gemini.active_index >= this.config.api_vault.gemini.keys.length) {
      this.config.api_vault.gemini.active_index = 0;
    }
    this.save();
  }

  getActiveGeminiKey() {
    const all = this.config.api_vault.gemini.keys;
    const active = all.filter(k => k.status !== 'disabled');
    if (!active.length) return null;
    // active_index is an index into the full array; find next active key from that position
    const start = this.config.api_vault.gemini.active_index % Math.max(all.length, 1);
    for (let i = 0; i < all.length; i++) {
      const k = all[(start + i) % all.length];
      if (k.status !== 'disabled') return k;
    }
    return null;
  }

  rotateGemini(markError = null) {
    const all = this.config.api_vault.gemini.keys;
    const active = all.filter(k => k.status !== 'disabled');
    if (active.length <= 1) return false;
    if (markError) {
      const cur = this.getActiveGeminiKey();
      if (cur) cur.last_error = markError;
    }
    // Advance active_index to the next active key in the full array
    const cur = this.config.api_vault.gemini.active_index;
    for (let i = 1; i <= all.length; i++) {
      const next = (cur + i) % all.length;
      if (all[next].status !== 'disabled') {
        this.config.api_vault.gemini.active_index = next;
        this.save();
        return true;
      }
    }
    return false;
  }

  trackCall(provider) {
    if (provider === 'gemini') {
      const k = this.getActiveGeminiKey();
      if (k) k.calls_count = (k.calls_count || 0) + 1;
    } else if (provider === 'qwen') {
      this.config.api_vault.qwen.calls_count = (this.config.api_vault.qwen.calls_count || 0) + 1;
    }
    this.save();
  }

  route(elementType) {
    const r = this.config.routing_rules;
    if (r.qwen_targets?.includes(elementType)) return 'qwen';
    return 'gemini';
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

export class V35Router {
  constructor(vault, logFn) {
    this.vault = vault;
    this.log = logFn || (() => {});
  }

  async call(elementType, prompt, opts = {}) {
    const provider = this.vault.route(elementType);
    const cfg = this.vault.config.error_handling;
    let lastErr;

    for (let attempt = 0; attempt <= cfg.max_retries; attempt++) {
      try {
        const result = provider === 'qwen'
          ? await this._callQwen(prompt, opts)
          : await this._callGemini(prompt, opts);
        return result;
      } catch(e) {
        lastErr = e;
        const is429  = /429|quota|RESOURCE_EXHAUSTED|rate.?limit/i.test(e.message);
        const is403  = /403|suspended|denied|permission/i.test(e.message);

        this.log(`[${provider.toUpperCase()}] Tentative ${attempt+1}/${cfg.max_retries+1}: ${e.message}`, 'err');

        if (provider === 'gemini') {
          if (is429 && cfg.switch_on_429) {
            const rotated = this.vault.rotateGemini(e.message);
            this.log(`429 → rotation clé Gemini (${rotated ? 'ok' : 'épuisé'})`, 'warn');
          }
          // 403/suspendu ou plus de clés → fallback chain gratuit
          if (is403 || !this.vault.getActiveGeminiKey()) {
            return await this._callFallbackChain(prompt, opts);
          }
        }

        if (attempt < cfg.max_retries) {
          const delay = is429 ? cfg.retry_delay_seconds * 1000 : 2000;
          this.log(`Attente ${delay/1000}s avant retry…`, 'info');
          await sleep(delay);
        }
      }
    }
    throw lastErr;
  }

  async _callGemini(prompt, opts = {}) {
    const keyObj = this.vault.getActiveGeminiKey();
    if (!keyObj) throw new Error('Aucune clé Gemini active dans le vault');

    const model = opts.model || this.vault.config.proxy_settings?.target_model || 'gemini-2.0-flash';

    // Both AIza and AQ key types work with the standard REST endpoint
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keyObj.key}`;

    const body = buildGeminiBody(prompt, opts);
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: { message: r.statusText } }));
      throw new Error(`[${r.status}] ${err.error?.message || r.statusText}`);
    }

    this.vault.trackCall('gemini');
    const d = await r.json();
    return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  }

  // Fallback chain : Mistral → Groq (tous gratuits, haute qualité FR)
  async _callFallbackChain(prompt, opts = {}) {
    const order = this.vault.config.routing_rules.fallback_order || ['mistral', 'groq'];
    for (const p of order) {
      if (p === 'gemini') continue;
      if (p === 'mistral' && this.vault.config.api_vault.mistral?.key) {
        try {
          this.log('Fallback → Mistral Large (gratuit, natif FR)…', 'warn');
          return await this._callMistral(prompt, opts);
        } catch(e) { this.log(`Mistral: ${e.message}`, 'err'); }
      }
      if (p === 'groq' && this.vault.config.api_vault.groq?.key) {
        try {
          this.log('Fallback → Groq Llama-3.3-70B (gratuit)…', 'warn');
          return await this._callGroq(prompt, opts);
        } catch(e) { this.log(`Groq: ${e.message}`, 'err'); }
      }
    }
    throw new Error('Tous les providers gratuits échoués — ajoutez une clé Mistral ou Groq dans le vault');
  }

  async _callMistral(prompt, opts = {}) {
    const k = this.vault.config.api_vault.mistral?.key;
    if (!k) throw new Error('Clé Mistral absente');
    const model = this.vault.config.proxy_settings?.mistral_model || 'mistral-large-latest';
    const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${k}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: opts.maxTokens || 2048,
        temperature: opts.temperature || 0.4,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ message: r.statusText }));
      throw new Error(`[Mistral ${r.status}] ${err.message || r.statusText}`);
    }
    this.vault.trackCall('mistral');
    const d = await r.json();
    return d.choices?.[0]?.message?.content?.trim() || '';
  }

  async _callGroq(prompt, opts = {}) {
    const k = this.vault.config.api_vault.groq?.key;
    if (!k) throw new Error('Clé Groq absente');
    const model = this.vault.config.proxy_settings?.groq_model || 'llama-3.3-70b-versatile';
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${k}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: opts.maxTokens || 2048,
        temperature: opts.temperature || 0.4,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: { message: r.statusText } }));
      throw new Error(`[Groq ${r.status}] ${err.error?.message || r.statusText}`);
    }
    this.vault.trackCall('groq');
    const d = await r.json();
    return d.choices?.[0]?.message?.content?.trim() || '';
  }

  async _callGeminiViaOpenRouter(prompt, opts = {}) {
    const qwen = this.vault.config.api_vault.qwen;
    if (!qwen?.key) throw new Error('Clé OpenRouter absente — impossible de router Gemini');
    const model = opts.model || this.vault.config.proxy_settings?.target_model || 'gemini-2.5-flash';
    const orModel = `google/${model}`;
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${qwen.key}`,
        'HTTP-Referer': 'https://build.zenithlab.net',
      },
      body: JSON.stringify({
        model: orModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: opts.maxTokens || 2048,
        temperature: opts.temperature || 0.4,
      }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: { message: r.statusText } }));
      throw new Error(`[OR-Gemini ${r.status}] ${err.error?.message || r.statusText}`);
    }
    this.vault.trackCall('qwen');
    const d = await r.json();
    return d.choices?.[0]?.message?.content?.trim() || '';
  }

  async _callQwen(prompt, opts = {}) {
    const qwen = this.vault.config.api_vault.qwen;
    if (!qwen?.key) throw new Error('Clé Qwen/OpenRouter non configurée');

    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${qwen.key}`,
        'HTTP-Referer': 'https://build.zenithlab.net',
      },
      body: JSON.stringify({
        model: opts.qwenModel || 'qwen/qwen-2.5-72b-instruct',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: opts.maxTokens || 2048,
        temperature: opts.temperature || 0.4,
      }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: { message: r.statusText } }));
      throw new Error(`[${r.status}] ${err.error?.message || r.statusText}`);
    }

    this.vault.trackCall('qwen');
    const d = await r.json();
    return d.choices?.[0]?.message?.content?.trim() || '';
  }

  // Test a specific key directly
  async testGeminiKey(key, model = 'gemini-2.0-flash') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildGeminiBody('Reply with: OK', { maxTokens: 10 })),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: { message: r.statusText } }));
      throw new Error(`[${r.status}] ${err.error?.message || r.statusText}`);
    }
    return true;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectKeyType(key) {
  if (key.startsWith('AIza')) return 'AIza';
  if (key.startsWith('AQ'))   return 'AQ';
  return 'unknown';
}

function buildGeminiBody(prompt, opts = {}) {
  return {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: opts.maxTokens || 2048,
      temperature: opts.temperature || 0.3,
    },
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
