// V35 Content AI — Gemini multi-key rotation + prompts SEO professionnels
// Secrets: GEMINI_KEYS (comma-separated API keys), KV binding

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Content-Type': 'application/json',
};
function ok(d) { return Response.json({ ok:true, ...d }, { headers:CORS }); }
function err(msg, s=400) { return Response.json({ ok:false, error:msg }, { status:s, headers:CORS }); }

// ── Gemini client ──────────────────────────────────────────────────────────
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent';
const MODEL_PRIMARY  = 'gemini-2.5-pro-preview-06-05';
const MODEL_FALLBACK = 'gemini-2.5-flash-preview-05-20';

async function callGemini(prompt, apiKey, model = MODEL_PRIMARY) {
  const url = GEMINI_URL.replace('{model}', model) + `?key=${apiKey}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role:'user', parts:[{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (r.status === 429) throw Object.assign(new Error('RATE_LIMITED'), { code:429 });
  if (r.status === 403 || r.status === 401) throw Object.assign(new Error('QUOTA_EXHAUSTED'), { code:r.status });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);
  const d = await r.json();
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

// ── Key rotation (round-robin, skip rate-limited) ──────────────────────────
// State: KV stores per-key status: {exhausted:bool, coolUntil:number}
class KeyRotator {
  constructor(keys, kv) {
    this.keys = keys; // string[]
    this.kv = kv;
    this.idx = 0;
  }

  async callWithRotation(prompt, model = MODEL_PRIMARY) {
    const n = this.keys.length;
    const now = Date.now();
    for (let attempt = 0; attempt < n * 2; attempt++) {
      const key = this.keys[this.idx % n];
      this.idx = (this.idx + 1) % n;

      // Check cooldown in KV
      const stateRaw = await this.kv?.get(`gemini:key:${key.slice(-8)}`).catch(() => null);
      if (stateRaw) {
        const state = JSON.parse(stateRaw);
        if (state.exhausted) continue;
        if (state.coolUntil && now < state.coolUntil) continue;
      }

      try {
        return await callGemini(prompt, key, model);
      } catch(e) {
        if (e.code === 429) {
          // Cool down this key for 60s
          await this.kv?.put(`gemini:key:${key.slice(-8)}`,
            JSON.stringify({ coolUntil: now + 60000 }),
            { expirationTtl: 120 }
          ).catch(() => {});
          continue;
        }
        if (e.code === 403 || e.code === 401) {
          // Mark exhausted for the day
          await this.kv?.put(`gemini:key:${key.slice(-8)}`,
            JSON.stringify({ exhausted: true }),
            { expirationTtl: 86400 }
          ).catch(() => {});
          continue;
        }
        if (model === MODEL_PRIMARY) {
          // Fallback to flash
          try { return await callGemini(prompt, key, MODEL_FALLBACK); } catch {}
        }
        throw e;
      }
    }
    throw new Error('All Gemini keys exhausted or rate-limited');
  }
}

// ── Prompt cache ──────────────────────────────────────────────────────────
async function cached(kv, cacheKey, fn, ttl = 86400) {
  const hit = await kv?.get(cacheKey).catch(() => null);
  if (hit) return JSON.parse(hit);
  const val = await fn();
  await kv?.put(cacheKey, JSON.stringify(val), { expirationTtl: ttl }).catch(() => {});
  return val;
}

// ── Extract JSON from Gemini response ────────────────────────────────────
function extractJSON(text) {
  // Remove markdown code blocks
  text = text.replace(/```json\n?/gi, '').replace(/```\n?/g, '');
  const s = text.search(/[\[{]/);
  const e = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));
  if (s !== -1 && e > s) return JSON.parse(text.slice(s, e + 1));
  return JSON.parse(text.trim());
}

// ── PROMPTS (from xlsx — original professional prompts) ────────────────────

const LANG_NAMES = {
  fr:'Français', de:'Allemand', es:'Espagnol', it:'Italien', en:'Anglais',
  nl:'Néerlandais', pt:'Portugais', pl:'Polonais', ru:'Russe', cs:'Tchèque',
  hu:'Hongrois', ro:'Roumain', et:'Estonien', lv:'Letton', lt:'Lituanien'
};

const COUNTRIES = {
  fr:'France', de:'Allemagne', es:'Espagne', it:'Italie', en:'Royaume-Uni',
  nl:'Pays-Bas', pt:'Portugal', pl:'Pologne', ru:'Russie', cs:'République Tchèque',
  hu:'Hongrie', ro:'Roumanie', et:'Estonie', lv:'Lettonie', lt:'Lituanie'
};

// Prompt 1: SEO Collection Titles (multi-language)
function buildCollectionTitlesPrompt(collectionsArr, lang, country) {
  return `SYSTEM ROLE:
Tu es un **Expert SEO Collections Shopify Multilingue International**.
Tu transformes automatiquement une liste de noms de collections en français en **LE titre de collection optimal** pour un pays cible.
Tu réalises l'intégralité du process **en interne**, et tu ne sors qu'un **JSON compact final** avec **un seul titre choisi par collection**.
Contraintes strictes :
- Input = liste de noms collections FR + pays cible + langue cible.
- Output = un seul titre par collection : mot-clé principal natif/local en début, naturel, 3–7 mots max, ressemble à une vraie recherche Google dans la langue cible.
- SEO prioritaire : mot-clé principal (le plus cherché localement) en tout début, intention d'achat/usage incluse si pertinent.
- Naturel et fluide : pas de keyword stacking robotique ; imite ce que les locaux tapent vraiment (pas traduction littérale FR).
- Longueur : court et impactant pour meta title (50–60 caractères idéalement).
- Évite superlatifs marketing : blacklist absolue = beste, premium, perfekt, luxuriös, günstig, top, billig, etc.
- Chaque titre doit être unique dans le batch.
- Traite max 500 collections par réponse.

FORMAT DE SORTIE (OBLIGATOIRE – UNIQUEMENT ÇA) :
{
  "country_target": "${country}",
  "language_target": "${lang}",
  "collections": [
    { "original_fr": "nom original", "title_final": "titre optimisé en ${lang}" }
  ]
}

IMPORTANT – RÈGLES FINALES :
- Compte les collections input → output exactement le même nombre.
- Pas d'explications, pas de texte hors JSON.
- Priorise recherches Google natives du pays.

/generate_collections
pays: ${country}
langue: ${lang}
collections_fr:
${collectionsArr.map(c => `- ${c}`).join('\n')}`;
}

// Prompt 2: SEO Product Titles (multi-language)
function buildProductTitlesPrompt(titlesArr, lang, country) {
  return `SYSTEM ROLE:
Tu es un **Expert SEO Multilingue**.
Tu transformes automatiquement une liste de titres produits en français en titres optimisés longue traîne pour un pays cible.
Tu réalises l'intégralité du process **en interne**, et tu ne sors qu'un **JSON compact final** avec **un seul titre choisi par produit**.
Contraintes :
- Input = titres produits FR + pays cible + langue cible.
- Génération : mot-clé principal + attributs → adaptation locale → 10 variantes internes → anti-doublon → sélection 1 titre optimal.
- SEO : le mot-clé doit être en début de titre (keyword-first).
- Chaque titre = 6–8 mots, longue traîne, unique, naturel dans la langue cible.
- Output = JSON propre, uniquement titres retenus, aucun commentaire ni explication.

FORMAT DE SORTIE (OBLIGATOIRE) :
{
  "country_target": "${country}",
  "language_target": "${lang}",
  "products": [
    { "original_fr": "titre original FR", "title_final": "titre optimisé en ${lang}" }
  ]
}

IMPORTANT : Compter les titres d'input → output exactement le même nombre. Pas de texte hors JSON.

/generate
pays: ${country}
langue: ${lang}
titres_fr:
${titlesArr.map(t => `- "${t}"`).join('\n')}`;
}

// Prompt 3: Collections Intro (KORAY-STYLE — short + long description)
function buildCollectionsIntroPrompt(categoriesArr, lang, country) {
  return `SYSTEM / DEVELOPER PROMPT — UNIVERSAL ECOMMERCE CATEGORY INTRO ENGINE (KORAY-STYLE)

You are a "Category Page Semantic Writer" specialized in ecommerce category/collection pages across ANY niche. You do NOT write marketing copy. You write concise, descriptive category introductions that improve:
- semantic clarity (what the page is about)
- intent matching (why a user searched this)
- topical authority within the site architecture

RULES:
- SHORT DESCRIPTION: 18–32 words, 1 sentence (2 max), includes head_term + key modifier, defines what the collection contains (not a sales pitch)
- LONG DESCRIPTION: 90–160 words, 2 paragraphs. P1: define scope & boundaries. P2: clarify typical use/selection logic. Never use bullet lists.
- Language: ${LANG_NAMES[lang] || lang} (target country: ${country})
- Anti-LLM filter: NEVER use "Discover/Explore/Shop/Find the perfect", "Designed for/Ideal for/Perfect for", "premium/top-tier/ultimate/best", "Elevate your experience"
- No hallucinated specs (no performance metrics, certifications, warranties unless explicit in category name)
- Noun-led sentences, concrete terms, varied syntax, restrained tone

OUTPUT FORMAT (JSON array only, no other text):
[
  {
    "category": "original category name",
    "short_description": "18-32 word description",
    "long_description": "90-160 word description in 2 paragraphs"
  }
]

categories: ${JSON.stringify(categoriesArr)}
language: "${lang}"
country: "${country}"`;
}

// Prompt 4: Blog article intro (multilingual, SEO)
function buildBlogPrompt(titles, niche, lang, country) {
  return `SYSTEM ROLE: Tu es un expert SEO et rédacteur e-commerce spécialisé en contenu de blog multilingue.

Génère des introductions d'articles de blog SEO en ${LANG_NAMES[lang] || lang} (${country}).
Niche : ${niche}
Règles :
- Introduction : 120–180 mots par article
- Accroche forte en première phrase (sans "Découvrez", "Dans cet article")
- Intègre naturellement le mot-clé principal (tiré du titre)
- Ton informatif et direct, pas de hype marketing
- Structure : affirmation forte → contexte/problème → promesse de l'article
- Dernière phrase : transition vers le contenu (sans "Dans ce guide..." répété)

FORMAT DE SORTIE (JSON uniquement) :
[
  {
    "title": "titre de l'article",
    "intro": "introduction en ${lang} (120-180 mots)"
  }
]

Articles à traiter :
${JSON.stringify(titles)}`;
}

// Prompt 5: Homepage — exceptional quality
function buildHomepagePrompt(domain, niche, lang, country, collections) {
  return `SYSTEM ROLE: Tu es un expert en copywriting e-commerce haute conversion et UX writing.

Génère le contenu complet d'une homepage de boutique e-commerce en ${LANG_NAMES[lang] || lang} (${country}).
Domaine : ${domain}
Niche : ${niche}
Collections disponibles : ${JSON.stringify(collections.slice(0, 10))}

EXIGENCES QUALITÉ MAXIMALE :
1. HERO SECTION : titre principal (max 8 mots, impact immédiat, keyword-first), sous-titre (max 18 mots, bénéfice concret), CTA (3-4 mots, action directe)
2. VALUE PROPOSITION : 3 avantages différenciants (icône + titre court 3-4 mots + description 15-20 mots chacun)
3. SECTION COLLECTIONS : intro générale (2 phrases, 40-60 mots, définit la boutique sans hype)
4. TRUST SECTION : 4 éléments de confiance adaptés au marché ${country} (livraison, retours, paiement, service)
5. SEO META : title (55-60 car.), meta description (145-155 car.)
6. SCHEMA ORG : extrait JSON-LD WebSite + Organization

INTERDITS : "Découvrez", "Explorez", "Nos produits sont", "De qualité premium", "Leader mondial", toute promesse non vérifiable.
TON : direct, factuel, engageant. Phrases courtes. Verbes actifs.

OUTPUT JSON (uniquement) :
{
  "lang": "${lang}",
  "hero": { "title": "...", "subtitle": "...", "cta": "..." },
  "value_props": [
    { "icon": "...", "title": "...", "desc": "..." },
    { "icon": "...", "title": "...", "desc": "..." },
    { "icon": "...", "title": "...", "desc": "..." }
  ],
  "collections_intro": "...",
  "trust": [
    { "icon": "...", "label": "...", "detail": "..." }
  ],
  "meta": { "title": "...", "description": "..." },
  "schema_org": {}
}`;
}

// ── Main handler ──────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers:CORS });

    // Setup key rotator
    const geminiKeys = (env.GEMINI_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
    if (!geminiKeys.length) return err('GEMINI_KEYS secret not set', 500);
    const rotator = new KeyRotator(geminiKeys, env.KV);

    const url = new URL(request.url);
    const [,, resource] = url.pathname.split('/');
    let body = {};
    if (request.method === 'POST') { try { body = await request.json(); } catch {} }

    // ── /api/health ──────────────────────────────────────────────────────────
    if (resource === 'health') {
      return ok({ status:'ok', keys: geminiKeys.length, model: MODEL_PRIMARY });
    }

    // ── /api/collection-titles ───────────────────────────────────────────────
    // body: { collections:string[], lang, country }
    if (resource === 'collection-titles') {
      const { collections=[], lang='fr', country } = body;
      if (!collections.length) return err('collections[] required');
      const tgt = country || COUNTRIES[lang] || lang;
      const cacheKey = `ai:col-titles:${lang}:${collections.slice(0,3).join(',').slice(0,60)}`;
      const result = await cached(env.KV, cacheKey, async () => {
        const prompt = buildCollectionTitlesPrompt(collections, lang, tgt);
        const text = await rotator.callWithRotation(prompt);
        return extractJSON(text);
      });
      return ok({ result, lang, country: tgt });
    }

    // ── /api/product-titles ──────────────────────────────────────────────────
    // body: { titles:string[], lang, country }
    if (resource === 'product-titles') {
      const { titles=[], lang='fr', country } = body;
      if (!titles.length) return err('titles[] required');
      const tgt = country || COUNTRIES[lang] || lang;
      const cacheKey = `ai:prod-titles:${lang}:${titles.slice(0,3).join(',').slice(0,60)}`;
      const result = await cached(env.KV, cacheKey, async () => {
        const prompt = buildProductTitlesPrompt(titles, lang, tgt);
        const text = await rotator.callWithRotation(prompt);
        return extractJSON(text);
      });
      return ok({ result, lang, country: tgt });
    }

    // ── /api/collections-intro ───────────────────────────────────────────────
    // body: { categories:string[], lang, country }
    if (resource === 'collections-intro') {
      const { categories=[], lang='fr', country } = body;
      if (!categories.length) return err('categories[] required');
      const tgt = country || COUNTRIES[lang] || lang;
      const cacheKey = `ai:col-intro:${lang}:${categories.slice(0,3).join(',').slice(0,60)}`;
      const result = await cached(env.KV, cacheKey, async () => {
        const prompt = buildCollectionsIntroPrompt(categories, lang, tgt);
        const text = await rotator.callWithRotation(prompt);
        return extractJSON(text);
      });
      return ok({ result, lang, country: tgt });
    }

    // ── /api/blog ────────────────────────────────────────────────────────────
    // body: { titles:string[], niche, lang, country }
    if (resource === 'blog') {
      const { titles=[], niche='mode', lang='fr', country } = body;
      if (!titles.length) return err('titles[] required');
      const tgt = country || COUNTRIES[lang] || lang;
      const cacheKey = `ai:blog:${lang}:${titles[0].slice(0,50)}`;
      const result = await cached(env.KV, cacheKey, async () => {
        const prompt = buildBlogPrompt(titles, niche, lang, tgt);
        const text = await rotator.callWithRotation(prompt);
        return extractJSON(text);
      });
      return ok({ result, lang, country: tgt });
    }

    // ── /api/homepage ────────────────────────────────────────────────────────
    // body: { domain, niche, lang, country, collections:string[], langs:string[] }
    // Generates homepage content for ALL requested languages in parallel
    if (resource === 'homepage') {
      const { domain='', niche='mode', lang='fr', langs=['fr','de','es'], country, collections=[] } = body;
      if (!domain) return err('domain required');
      const targetLangs = langs.length ? langs : [lang];
      const results = {};
      await Promise.all(targetLangs.map(async l => {
        const tgt = country || COUNTRIES[l] || l;
        const cacheKey = `ai:home:${l}:${domain}`;
        results[l] = await cached(env.KV, cacheKey, async () => {
          const prompt = buildHomepagePrompt(domain, niche, l, tgt, collections);
          const text = await rotator.callWithRotation(prompt);
          try { return extractJSON(text); }
          catch { return { hero:{ title:niche, subtitle:'', cta:'Voir' }, meta:{title:domain,description:''} }; }
        }, 43200); // 12h cache for homepage
      }));
      // Store in KV for skeleton builder to retrieve
      if (env.KV) {
        await env.KV.put(`home:${domain}`, JSON.stringify(results), { expirationTtl: 86400 }).catch(() => {});
      }
      return ok({ results, domain, langs: targetLangs });
    }

    // ── /api/site-full ───────────────────────────────────────────────────────
    // Full content generation for a site: homepage + collection titles + intros
    // body: { domain, niche, lang, langs[], collections_fr:string[], titles_fr:string[] }
    if (resource === 'site-full') {
      const {
        domain='', niche='mode',
        langs=['fr','de','es','it','en'],
        collections_fr=[], titles_fr=[]
      } = body;
      if (!domain) return err('domain required');

      const [homeResults, colTitleResults, colIntroResults] = await Promise.all([
        // Homepage content for all languages
        Promise.all(langs.map(async l => {
          const tgt = COUNTRIES[l] || l;
          const prompt = buildHomepagePrompt(domain, niche, l, tgt, collections_fr);
          try { const t = await rotator.callWithRotation(prompt); return [l, extractJSON(t)]; }
          catch { return [l, null]; }
        })).then(arr => Object.fromEntries(arr)),

        // Collection titles for primary non-FR languages
        langs.filter(l=>l!=='fr').length && collections_fr.length
          ? Promise.all(langs.filter(l=>l!=='fr').map(async l => {
            const tgt = COUNTRIES[l] || l;
            try {
              const t = await rotator.callWithRotation(buildCollectionTitlesPrompt(collections_fr, l, tgt));
              return [l, extractJSON(t)];
            } catch { return [l, null]; }
          })).then(arr => Object.fromEntries(arr))
          : Promise.resolve({}),

        // Collection intros (FR first, then translate via collection-titles endpoint)
        collections_fr.length
          ? rotator.callWithRotation(buildCollectionsIntroPrompt(collections_fr, 'fr', 'France'))
              .then(t => extractJSON(t))
              .catch(() => [])
          : Promise.resolve([]),
      ]);

      const payload = { homepage: homeResults, collection_titles: colTitleResults, collection_intros: colIntroResults, domain, langs };
      if (env.KV) await env.KV.put(`site-full:${domain}`, JSON.stringify(payload), { expirationTtl: 86400 }).catch(() => {});
      return ok(payload);
    }

    // ── /api/key-status ──────────────────────────────────────────────────────
    if (resource === 'key-status') {
      const statuses = await Promise.all(geminiKeys.map(async key => {
        const stateRaw = await env.KV?.get(`gemini:key:${key.slice(-8)}`).catch(() => null);
        const state = stateRaw ? JSON.parse(stateRaw) : {};
        return {
          suffix: `***${key.slice(-8)}`,
          exhausted: state.exhausted || false,
          coolUntil: state.coolUntil || null,
          active: !state.exhausted && (!state.coolUntil || Date.now() > state.coolUntil),
        };
      }));
      return ok({ keys: statuses, total: geminiKeys.length, active: statuses.filter(k=>k.active).length });
    }

    return err('Not found', 404);
  }
};
