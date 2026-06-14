// V35 Content AI — OpenRouter + Gemini multi-key rotation, prompts SEO pro
// Secrets: OPENROUTER_KEYS (comma-sep), GEMINI_KEYS (comma-sep, fallback), KV binding

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Content-Type': 'application/json',
};
function ok(d) { return Response.json({ ok:true, ...d }, { headers:CORS }); }
function err(msg, s=400) { return Response.json({ ok:false, error:msg }, { status:s, headers:CORS }); }

// ── OpenAI client (first priority) ────────────────────────────────────────
const OAI_URL   = 'https://api.openai.com/v1/chat/completions';
const OAI_MODEL = 'gpt-4o-mini';

async function callOpenAI(prompt, apiKey) {
  const r = await fetch(OAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: OAI_MODEL, messages: [{ role:'user', content: prompt }], temperature: 0.2, max_tokens: 8192 }),
    signal: AbortSignal.timeout(120000),
  });
  if (r.status === 429) throw Object.assign(new Error('RATE_LIMITED'), { code:429 });
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error('QUOTA_EXHAUSTED'), { code:r.status });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
  const d = await r.json();
  const text = d.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty response from OpenAI');
  return text;
}

// ── OpenRouter client (secondary) ─────────────────────────────────────────
const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OR_MODEL_PRIMARY  = 'google/gemini-2.5-flash';
const OR_MODEL_FALLBACK = 'google/gemini-2.0-flash';

async function callOpenRouter(prompt, apiKey, model = OR_MODEL_PRIMARY) {
  const r = await fetch(OR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role:'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 8192,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (r.status === 429) throw Object.assign(new Error('RATE_LIMITED'), { code:429 });
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error('QUOTA_EXHAUSTED'), { code:r.status });
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${await r.text()}`);
  const d = await r.json();
  const text = d.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty response from OpenRouter');
  return text;
}

// ── Gemini direct client (fallback) ──────────────────────────────────────
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent';
const MODEL_PRIMARY  = 'gemini-2.5-flash';
const MODEL_FALLBACK = 'gemini-2.0-flash';

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

// ── Key rotation (OpenRouter primary, Gemini fallback) ────────────────────
// State: KV stores per-key status: {exhausted:bool, coolUntil:number}
class KeyRotator {
  constructor(oaiKeys, orKeys, geminiKeys, kv) {
    this.oaiKeys = oaiKeys;       // OpenAI keys (first priority)
    this.orKeys = orKeys;         // OpenRouter keys (secondary)
    this.geminiKeys = geminiKeys; // Gemini keys (fallback)
    this.kv = kv;
    this.oaiIdx = 0;
    this.orIdx = 0;
    this.gIdx = 0;
  }

  async callWithRotation(prompt) {
    const now = Date.now();

    // 0. Try OpenAI keys first
    for (let attempt = 0; attempt < this.oaiKeys.length; attempt++) {
      const key = this.oaiKeys[this.oaiIdx % this.oaiKeys.length];
      this.oaiIdx = (this.oaiIdx + 1) % Math.max(1, this.oaiKeys.length);
      const stateRaw = await this.kv?.get(`oai:key:${key.slice(-8)}`).catch(() => null);
      if (stateRaw) { const s = JSON.parse(stateRaw); if (s.exhausted || (s.coolUntil && now < s.coolUntil)) continue; }
      try { return await callOpenAI(prompt, key); }
      catch(e) {
        if (e.code === 429) { await this.kv?.put(`oai:key:${key.slice(-8)}`, JSON.stringify({ coolUntil: now+60000 }), { expirationTtl:120 }).catch(()=>{}); continue; }
        if (e.code === 401 || e.code === 403) { await this.kv?.put(`oai:key:${key.slice(-8)}`, JSON.stringify({ exhausted:true }), { expirationTtl:86400 }).catch(()=>{}); continue; }
      }
    }

    // 1. Try OpenRouter keys next
    const orN = this.orKeys.length;
    for (let attempt = 0; attempt < orN * 2; attempt++) {
      const key = this.orKeys[this.orIdx % orN];
      this.orIdx = (this.orIdx + 1) % orN;
      const stateRaw = await this.kv?.get(`or:key:${key.slice(-8)}`).catch(() => null);
      if (stateRaw) {
        const s = JSON.parse(stateRaw);
        if (s.exhausted) continue;
        if (s.coolUntil && now < s.coolUntil) continue;
      }
      try {
        return await callOpenRouter(prompt, key, OR_MODEL_PRIMARY);
      } catch(e) {
        if (e.code === 429) {
          await this.kv?.put(`or:key:${key.slice(-8)}`, JSON.stringify({ coolUntil: now + 60000 }), { expirationTtl: 120 }).catch(() => {});
          continue;
        }
        if (e.code === 401 || e.code === 403) {
          await this.kv?.put(`or:key:${key.slice(-8)}`, JSON.stringify({ exhausted: true }), { expirationTtl: 86400 }).catch(() => {});
          continue;
        }
        // Try fallback model on non-auth errors
        try { return await callOpenRouter(prompt, key, OR_MODEL_FALLBACK); } catch {}
      }
    }

    // 2. Fallback: Gemini direct keys
    const gN = this.geminiKeys.length;
    for (let attempt = 0; attempt < gN * 2; attempt++) {
      const key = this.geminiKeys[this.gIdx % gN];
      this.gIdx = (this.gIdx + 1) % gN;
      const stateRaw = await this.kv?.get(`gemini:key:${key.slice(-8)}`).catch(() => null);
      if (stateRaw) {
        const state = JSON.parse(stateRaw);
        if (state.exhausted) continue;
        if (state.coolUntil && now < state.coolUntil) continue;
      }

      try {
        return await callGemini(prompt, key, MODEL_PRIMARY);
      } catch(e) {
        if (e.code === 429) {
          await this.kv?.put(`gemini:key:${key.slice(-8)}`,
            JSON.stringify({ coolUntil: now + 60000 }),
            { expirationTtl: 120 }
          ).catch(() => {});
          continue;
        }
        if (e.code === 403 || e.code === 401) {
          await this.kv?.put(`gemini:key:${key.slice(-8)}`,
            JSON.stringify({ exhausted: true }),
            { expirationTtl: 86400 }
          ).catch(() => {});
          continue;
        }
        try { return await callGemini(prompt, key, MODEL_FALLBACK); } catch {}
        throw e;
      }
    }
    throw new Error('All AI keys exhausted or rate-limited');
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

// 20 langues EU — fr=principal, 19 sous-domaines
const LANG_NAMES = {
  fr:'Français', en:'Anglais', de:'Allemand', es:'Espagnol', it:'Italien',
  nl:'Néerlandais', pt:'Portugais', pl:'Polonais', sv:'Suédois', da:'Danois',
  fi:'Finnois', no:'Norvégien', cs:'Tchèque', ro:'Roumain', hu:'Hongrois',
  sk:'Slovaque', sl:'Slovène', hr:'Croate', bg:'Bulgare', el:'Grec',
};

const COUNTRIES = {
  fr:'France', en:'Royaume-Uni', de:'Allemagne', es:'Espagne', it:'Italie',
  nl:'Pays-Bas', pt:'Portugal', pl:'Pologne', sv:'Suède', da:'Danemark',
  fi:'Finlande', no:'Norvège', cs:'République Tchèque', ro:'Roumanie', hu:'Hongrie',
  sk:'Slovaquie', sl:'Slovénie', hr:'Croatie', bg:'Bulgarie', el:'Grèce',
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

// ── 14-point full product content ────────────────────────────────────────
function buildProductFullPrompt(product, niche, lang, brandName) {
  const ln = LANG_NAMES[lang] || 'English';
  return `Expert e-commerce content strategist. Generate all 14 content points for this ${niche} product in ${ln}.
Brand: ${brandName||''}. Tone: premium, aspirational, direct. No hype words (perfect/amazing/revolutionary/best).

Product: ${JSON.stringify(product)}

Output STRICT JSON — all 14 keys mandatory:
{
  "slogan": "≤10 word punchy brand hook",
  "bullet_points": ["benefit 1","benefit 2","benefit 3","benefit 4","benefit 5"],
  "description_short": "60-80 word selling summary, benefit-led",
  "description_long": "<p>200-300 word HTML with <ul><li> for key features</li></ul></p>",
  "description_intro": "60-90 word landing page hook",
  "collection": {"name":"category name","description":"60-80 word category description"},
  "meta_title": "55-60 char SEO title, keyword-first",
  "meta_description": "145-155 char meta description with CTA",
  "alt_text": "50-80 char descriptive image alt text",
  "h1": "max 8 words keyword-first H1",
  "h2s": ["supporting H2 #1","supporting H2 #2"],
  "faq": [{"q":"question?","a":"answer 30-50 words"},{"q":"?","a":""},{"q":"?","a":""}],
  "cta": {"primary":"Add to Cart variant","secondary":"Save to Wishlist variant","urgency":"scarcity line ≤8 words"},
  "brand_tone": "one-line tone descriptor",
  "compliance_check": {"all_14_present":true,"lang":"${lang}","niche":"${niche}"}
}`;
}

// ── Product rewrite prompt ────────────────────────────────────────────────
function buildProductRewritePrompt(product, niche) {
  return `SYSTEM: Expert SEO copywriter e-commerce. Rewrite this product as unique HTML.
Niche: ${niche}
RULES:
- Never copy source structure. Output: 1×H1 (keyword-first, max 8 words) + 2×H2 + <ul> benefits (4-6 items) + 1 short paragraph.
- No hype: banned = "premium","parfait","meilleur","incroyable","révolutionnaire".
- Keyword density ~2%. Persuasive, direct tone.
- Output: valid HTML only. No markdown, no explanation, no <html>/<body> wrapper.

Product:
Title: ${product.title}
Features: ${JSON.stringify(product.features||[])}
Benefits: ${JSON.stringify(product.benefits||[])}
Price: ${product.price||''}
Keyword: ${product.keyword||product.title}`;
}

// ── Translation prompt (HTML tag preservation) ────────────────────────────
function buildTranslatePrompt(html, lang, exclusions) {
  return `SYSTEM: Expert e-commerce HTML translator.
Target: ${LANG_NAMES[lang]||lang}
RULES:
- Translate text nodes only. PRESERVE all HTML tags exactly (<strong>,<ul>,<li>,<h1>,<h2>,<p> etc).
- NEVER translate: ${exclusions.length ? exclusions.join(', ') : 'none'}.
- Output: translated HTML only, identical structure, no explanation.

${html}`;
}

// Prompt 6: Blog Pillar Article (SEO, 1500+ words)
function buildBlogPillarPrompt(title, niche, lang, domain, collections) {
  const ln = LANG_NAMES[lang] || lang;
  return `ROLE: Expert SEO content writer specialising in e-commerce blog content.

Write a complete pillar article in ${ln} for an e-commerce site in the "${niche}" niche.
Domain: ${domain}
Collections available: ${JSON.stringify((collections||[]).slice(0,6))}

Article title: "${title}"

REQUIREMENTS:
- Length: 1,400–1,800 words
- Structure: H1 (article title) + 5–7 H2 sections + FAQ (3–5 questions)
- Tone: Informative, direct, expert — not promotional. No "Discover/Explore/Shop" as openers.
- Keyword integration: natural, semantic, ~1.5% density
- Each H2 section: 150–280 words
- Include 1 internal CTA block (HTML) linking to a relevant collection
- End with 3–5 FAQ items
- Output: Valid HTML only — no markdown, no wrapper tags, no explanation
- HTML structure: <h1>, <h2>, <h3>, <p>, <ul>, <li>, <blockquote>, <div class="art-cta">
- Internal CTA format: <div class="art-cta"><h3>CTA title</h3><p>subtitle</p><a href="/collections/[slug]/">CTA text</a></div>
- FAQ format: <div class="art-faq"><h2>FAQ</h2><div class="faq-item"><p class="faq-q">Q?</p><p class="faq-a">Answer.</p></div></div>

Anti-LLM rules: NEVER use "perfect/amazing/revolutionary/game-changer/stunning". NEVER start sentences with "Whether you're". Varied syntax. No filler transitions.`;
}

// Prompt 7: Bulk product descriptions
function buildDescriptionsBulkPrompt(products, niche, lang) {
  const ln = LANG_NAMES[lang] || lang;
  return `ROLE: Expert e-commerce copywriter. Generate concise product descriptions in ${ln}.
Niche: ${niche}
Rules:
- Each description: 60–90 words, benefit-led, no hype words (perfect/luxury/premium/amazing)
- Include 1 key feature + 1 use case + 1 differentiator
- Direct tone, active voice, varied syntax
- Output: JSON array only

FORMAT:
[{"title":"product title","description":"60-90 word description in ${lang}"}]

Products:
${JSON.stringify(products)}`;
}

// Prompt 8: SEO slugs generator
function buildSlugsPrompt(names, lang, domain) {
  const ln = LANG_NAMES[lang] || lang;
  return `ROLE: SEO specialist. Generate clean, short URL slugs.
Language: ${ln} (domain: ${domain})
Rules:
- Slugs in ${lang === 'fr' ? 'French' : ln} — keep native language words (no English slugs for FR sites)
- Max 5 words, all lowercase, hyphens only, no stop words (le/la/les/de/du/des)
- Keep primary keyword at start
- Short always wins over complete
- Output: JSON only

FORMAT:
[{"original":"name","slug":"slug-here"}]

Names to slugify:
${JSON.stringify(names)}`;
}

// Prompt 9: Comparatif / Comparison article
function buildComparatifPrompt(niche, subject, items, lang, domain) {
  const ln = LANG_NAMES[lang] || lang;
  return `ROLE: Expert content strategist. Write a comparison article in ${ln}.
Niche: ${niche} | Domain: ${domain}
Subject: "${subject}"
Items to compare: ${JSON.stringify(items)}

REQUIREMENTS:
- Length: 900–1,200 words
- Structure: intro (100w) + comparison table (HTML) + per-item section (150w each) + verdict
- Comparison table: <table class="comp-table"> with criteria rows and item columns
- Verdict: clear winner per use case (not "it depends")
- Tone: Independent expert, not promotional. Acknowledge weaknesses.
- Output: valid HTML only (no markdown, no wrapper, no explanation)
- Anti-LLM: no "Discover/Whether you're/In conclusion/To summarise"`;
}

// Prompt 10: UGC-style reviews generator
function buildAvisPrompt(product, niche, count, lang) {
  const ln = LANG_NAMES[lang] || lang;
  return `ROLE: Simulate realistic customer reviews in ${ln} for QA/testing purposes.
Product: ${JSON.stringify(product)}
Niche: ${niche}
Count: ${count || 5}

Rules:
- Mix of 4★ and 5★ (no 3★ or lower)
- Varied length: 2 short (1–2 sentences), 2 medium (3–4 sentences), 1 detailed (5–7 sentences)
- Include specifics: delivery experience, packaging, fit/feel, comparison to expectations
- Natural names (mix of French/UK depending on lang), varied cities
- Some mention the price vs value
- "✓ Verified purchase" label on all
- Output: JSON array only

FORMAT:
[{"stars":5,"author":"Name — City","date":"X weeks ago","text":"review text","verified":true}]`;
}

// Prompt 11: CRO blocks
function buildCROPrompt(product, pageType, lang, niche) {
  const ln = LANG_NAMES[lang] || lang;
  return `ROLE: CRO (Conversion Rate Optimisation) specialist for e-commerce.
Language: ${ln} | Page type: ${pageType} | Niche: ${niche}
Product context: ${JSON.stringify(product)}

Generate all CRO elements for this page. Output strict JSON:
{
  "urgency_badge": "≤8 words — scarcity/time pressure without lying",
  "social_proof_line": "≤12 words — recent activity proof",
  "guarantee_block": "≤25 words — risk reversal statement",
  "hero_subline": "≤18 words — benefit-first value prop under main headline",
  "sticky_cta": "≤6 words — mobile sticky bar CTA text",
  "trust_bullets": ["3 trust bullets, ≤8 words each"],
  "upsell_headline": "≤10 words — product recommendation section title",
  "exit_intent_offer": "≤20 words — exit intent popup offer",
  "email_capture_hook": "≤15 words — newsletter signup incentive"
}

Rules: No fake numbers. No impossible promises. No "Amazing/Perfect/Life-changing". Direct, factual.`;
}

// Prompt 12: Reusable content blocks
function buildBlocksPrompt(type, context, lang, niche) {
  const ln = LANG_NAMES[lang] || lang;
  const blockDefs = {
    'trust': 'Generate 4 trust badges: [{icon:"SVG path name",title:"3-4 words",detail:"8-12 words"}]',
    'faq': 'Generate 5 FAQ pairs relevant to this e-commerce niche: [{q:"question?",a:"answer 30-50 words"}]',
    'testimonials': 'Generate 3 customer testimonials: [{stars:5,text:"60-90 words",author:"Name — City",date:"timeframe"}]',
    'value_props': 'Generate 3 value propositions: [{icon:"SVG name",title:"3-4 words",description:"15-20 words"}]',
    'about': 'Generate 2-paragraph brand story (120-160 words total): {"p1":"...","p2":"..."}',
  };
  return `ROLE: E-commerce content specialist. Generate "${type}" content block in ${ln}.
Niche: ${niche}
Context: ${JSON.stringify(context)}

${blockDefs[type] || 'Generate appropriate block content as JSON.'}

Output: JSON only. No text outside JSON. No markdown. No explanation.`;
}

// ── SEO Scorer (local, no AI) ─────────────────────────────────────────────
function seoScore(html, keyword) {
  const text = html.replace(/<[^>]+>/g,' ').toLowerCase();
  const words = text.match(/\b\w+\b/g)||[];
  const kw = keyword.toLowerCase();
  const kwHits = words.filter(w => text.slice(text.indexOf(w)).startsWith(kw)).length
    || (text.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))||[]).length;
  const density = words.length ? (kwHits / words.length) * 100 : 0;
  const h1 = (html.match(/<h1[\s>]/gi)||[]).length;
  const h2 = (html.match(/<h2[\s>]/gi)||[]).length;
  const ul = (html.match(/<ul[\s>]/gi)||[]).length;
  const issues = [];
  if (density < 1) issues.push(`Densité keyword "${keyword}" : ${density.toFixed(1)}% < 1%`);
  if (h1 !== 1) issues.push(`H1 : ${h1} trouvé(s), attendu 1`);
  if (h2 < 2)  issues.push(`H2 : ${h2} trouvé(s), attendu ≥2`);
  if (ul < 1)  issues.push('Aucune liste <ul>');
  const score = (density>=1?25:0)+(h1===1?25:0)+(h2>=2?25:0)+(ul>=1?25:0);
  return { passes: issues.length===0, score, keyword_density: +density.toFixed(2), h1, h2, ul, issues };
}

// ── Main handler ──────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers:CORS });

    // Setup key rotator — OpenAI first, OpenRouter second, Gemini fallback
    const oaiKeys = (env.OPENAI_KEY || env.OPENAI_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
    const orKeys = (env.OPENROUTER_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
    const geminiKeys = (env.GEMINI_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
    if (!oaiKeys.length && !orKeys.length && !geminiKeys.length) return err('No AI keys configured', 500);
    const rotator = new KeyRotator(oaiKeys, orKeys, geminiKeys, env.KV);

    const url = new URL(request.url);
    const [,, resource] = url.pathname.split('/');
    let body = {};
    if (request.method === 'POST') { try { body = await request.json(); } catch {} }

    // ── /api/health ──────────────────────────────────────────────────────────
    if (resource === 'health') {
      return ok({ status:'ok', or_keys: orKeys.length, gemini_keys: geminiKeys.length, model: OR_MODEL_PRIMARY });
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
    // Single lang per request to avoid OpenRouter concurrent rate limits
    if (resource === 'homepage') {
      const { domain='', niche='mode', lang='fr', langs=[], country, collections=[] } = body;
      if (!domain) return err('domain required');
      // If langs array given, generate sequentially and return all
      const targetLangs = langs.length ? langs : [lang];
      const results = {};
      // Check consolidated cache first (plt:homepages written by seed script)
      const allHomes = await env.KV?.get('plt:homepages').then(v => v ? JSON.parse(v) : null).catch(() => null);
      if (allHomes?.[domain]) {
        const cached = allHomes[domain].langs || allHomes[domain];
        for (const l of targetLangs) { if (cached[l]) results[l] = cached[l]; }
      }
      // Generate missing langs
      for (const l of targetLangs) {
        if (results[l]) continue;
        const tgt = country || COUNTRIES[l] || l;
        try {
          const prompt = buildHomepagePrompt(domain, niche, l, tgt, collections);
          const text = await rotator.callWithRotation(prompt);
          try { results[l] = extractJSON(text); }
          catch { results[l] = { hero:{ title:niche, subtitle:'', cta:'Voir' }, meta:{title:domain,description:''} }; }
        } catch(e) {
          results[l] = { error: e.message };
        }
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
      const orStatuses = await Promise.all(orKeys.map(async key => {
        const stateRaw = await env.KV?.get(`or:key:${key.slice(-8)}`).catch(() => null);
        const state = stateRaw ? JSON.parse(stateRaw) : {};
        return { type:'openrouter', suffix:`***${key.slice(-8)}`, exhausted:state.exhausted||false, coolUntil:state.coolUntil||null, active:!state.exhausted&&(!state.coolUntil||Date.now()>state.coolUntil) };
      }));
      const gStatuses = await Promise.all(geminiKeys.map(async key => {
        const stateRaw = await env.KV?.get(`gemini:key:${key.slice(-8)}`).catch(() => null);
        const state = stateRaw ? JSON.parse(stateRaw) : {};
        return { type:'gemini', suffix:`***${key.slice(-8)}`, exhausted:state.exhausted||false, coolUntil:state.coolUntil||null, active:!state.exhausted&&(!state.coolUntil||Date.now()>state.coolUntil) };
      }));
      const all = [...orStatuses, ...gStatuses];
      return ok({ keys: all, total: all.length, active: all.filter(k=>k.active).length });
    }

    // ── /api/product-rewrite ─────────────────────────────────────────────────
    // body: { product:{title,features[],benefits[],price,keyword}, niche }
    if (resource === 'product-rewrite') {
      const { product={}, niche='mode' } = body;
      if (!product.title) return err('product.title required');
      const prompt = buildProductRewritePrompt(product, niche);
      const html = await rotator.callWithRotation(prompt);
      const score = seoScore(html, product.keyword||product.title);
      return ok({ html, seo_score: score, draft: !score.passes });
    }

    // ── /api/translate ───────────────────────────────────────────────────────
    // body: { html, lang, exclusions:[] }
    if (resource === 'translate') {
      const { html='', lang='fr', exclusions=[] } = body;
      if (!html) return err('html required');
      const prompt = buildTranslatePrompt(html, lang, exclusions);
      const translated = await rotator.callWithRotation(prompt);
      return ok({ html: translated, lang });
    }

    // ── /api/product-full ────────────────────────────────────────────────────
    // body: { product:{title,features[],benefits[],price,keyword}, niche, lang, brandName }
    if (resource === 'product-full') {
      const { product={}, niche='mode', lang='fr', brandName='' } = body;
      if (!product.title) return err('product.title required');
      const required = ['slogan','bullet_points','description_short','description_long','description_intro','collection','meta_title','meta_description','alt_text','h1','h2s','faq','cta','brand_tone'];
      const prompt = buildProductFullPrompt(product, niche, lang, brandName);
      const cacheKey = `ai:full:${lang}:${product.title.slice(0,50).replace(/\W/g,'_')}`;
      const content = await cached(env.KV, cacheKey, async () => {
        const text = await rotator.callWithRotation(prompt);
        return extractJSON(text);
      }, 86400 * 7);
      const missing = required.filter(k => !content[k]);
      return ok({ product_content: content, lang, niche, compliance: { points_present: required.length - missing.length, missing, all_14_present: missing.length === 0 } });
    }

    // ── /api/seo-score ───────────────────────────────────────────────────────
    // body: { html, keyword }
    if (resource === 'seo-score') {
      const { html='', keyword='' } = body;
      if (!html || !keyword) return err('html and keyword required');
      return ok(seoScore(html, keyword));
    }

    // ── /api/blog-pillar ─────────────────────────────────────────────────────
    // body: { title, niche, lang, domain, collections:[] }
    if (resource === 'blog-pillar') {
      const { title='', niche='mode', lang='fr', domain='', collections=[] } = body;
      if (!title) return err('title required');
      const cacheKey = `ai:pillar:${lang}:${title.slice(0,50).replace(/\W/g,'_')}`;
      const html = await cached(env.KV, cacheKey, async () => {
        return await rotator.callWithRotation(buildBlogPillarPrompt(title, niche, lang, domain, collections));
      }, 86400 * 30);
      return ok({ html, title, lang, niche });
    }

    // ── /api/descriptions-bulk ───────────────────────────────────────────────
    // body: { products:[{title,features[]}], niche, lang }
    if (resource === 'descriptions-bulk') {
      const { products=[], niche='mode', lang='fr' } = body;
      if (!products.length) return err('products[] required');
      const prompt = buildDescriptionsBulkPrompt(products, niche, lang);
      const text = await rotator.callWithRotation(prompt);
      const result = extractJSON(text);
      return ok({ descriptions: result, count: result.length, lang, niche });
    }

    // ── /api/slugs ───────────────────────────────────────────────────────────
    // body: { names:[], lang, domain }
    if (resource === 'slugs') {
      const { names=[], lang='fr', domain='' } = body;
      if (!names.length) return err('names[] required');
      const cacheKey = `ai:slugs:${lang}:${names.slice(0,3).join(',').slice(0,60)}`;
      const result = await cached(env.KV, cacheKey, async () => {
        const text = await rotator.callWithRotation(buildSlugsPrompt(names, lang, domain));
        return extractJSON(text);
      });
      return ok({ slugs: result, count: result.length, lang });
    }

    // ── /api/comparatif ──────────────────────────────────────────────────────
    // body: { niche, subject, items:[], lang, domain }
    if (resource === 'comparatif') {
      const { niche='mode', subject='', items=[], lang='fr', domain='' } = body;
      if (!subject || !items.length) return err('subject and items[] required');
      const prompt = buildComparatifPrompt(niche, subject, items, lang, domain);
      const html = await rotator.callWithRotation(prompt);
      return ok({ html, subject, lang, niche });
    }

    // ── /api/avis ────────────────────────────────────────────────────────────
    // body: { product:{title,...}, niche, count, lang }
    if (resource === 'avis') {
      const { product={}, niche='mode', count=5, lang='fr' } = body;
      if (!product.title) return err('product.title required');
      const cacheKey = `ai:avis:${lang}:${product.title.slice(0,40).replace(/\W/g,'_')}`;
      const result = await cached(env.KV, cacheKey, async () => {
        const text = await rotator.callWithRotation(buildAvisPrompt(product, niche, count, lang));
        return extractJSON(text);
      }, 86400 * 7);
      return ok({ reviews: result, count: result.length, lang });
    }

    // ── /api/cro ─────────────────────────────────────────────────────────────
    // body: { product:{}, page_type, lang, niche }
    if (resource === 'cro') {
      const { product={}, page_type='product', lang='fr', niche='mode' } = body;
      const prompt = buildCROPrompt(product, page_type, lang, niche);
      const text = await rotator.callWithRotation(prompt);
      const result = extractJSON(text);
      return ok({ cro: result, page_type, lang });
    }

    // ── /api/blocks ──────────────────────────────────────────────────────────
    // body: { type, context:{}, lang, niche }
    if (resource === 'blocks') {
      const { type='trust', context={}, lang='fr', niche='mode' } = body;
      const validTypes = ['trust','faq','testimonials','value_props','about'];
      if (!validTypes.includes(type)) return err(`type must be one of: ${validTypes.join(', ')}`);
      const cacheKey = `ai:blocks:${type}:${lang}:${niche}`;
      const result = await cached(env.KV, cacheKey, async () => {
        const text = await rotator.callWithRotation(buildBlocksPrompt(type, context, lang, niche));
        return extractJSON(text);
      }, 86400 * 7);
      return ok({ block: result, type, lang, niche });
    }

    // ── /api/translate-blueprint ─────────────────────────────────────────────
    // Traduit un blueprint complet (titres collections + produits) selon schéma xlsx
    // body: { blueprint:{allCollections:[]}, lang, niche }
    if (resource === 'translate-blueprint') {
      const { blueprint={}, lang='en', niche='mode' } = body;
      if (!blueprint.allCollections?.length) return err('blueprint.allCollections required');
      const country = COUNTRIES[lang] || lang;
      const ln = LANG_NAMES[lang] || lang;

      // 1. Titres collections (prompt style xlsx: "Traduis ce titre H1 pour [LANG]")
      const colTitles = blueprint.allCollections.map(c=>c.title);
      const colPrompt = `Tu es expert SEO e-commerce multilingue. Traduis ces titres de collections en ${ln} (${country}).
Règles: naturels dans la langue cible, 2-5 mots, optimisés moteur de recherche local.
Niche: ${niche}
Input: ${JSON.stringify(colTitles)}
Output JSON: {"translations":[{"fr":"titre original","${lang}":"traduction"}]}`;
      const colText = await rotator.callWithRotation(colPrompt);
      const colData = extractJSON(colText);
      const colMap = {};
      (colData?.translations||[]).forEach(t=>{if(t.fr&&t[lang])colMap[t.fr]=t[lang];});

      // 2. Titres produits (prompt style xlsx: "Traduis cette description produit pour [LANG]")
      const allProds = blueprint.allCollections.flatMap(c=>(c.products||[]).map(p=>({slug:p.slug,title:p.title,desc:p.desc})));
      const prodPrompt = `Tu es expert SEO e-commerce multilingue. Traduis ces titres et descriptions produits en ${ln} (${country}).
Règles: titre 4-7 mots longue-traîne, description 1 phrase percutante. Niche: ${niche}
Input: ${JSON.stringify(allProds.slice(0,30))}
Output JSON: {"translations":[{"slug":"slug","title":"titre traduit","desc":"description traduite"}]}`;
      const prodText = await rotator.callWithRotation(prodPrompt);
      const prodData = extractJSON(prodText);
      const prodMap = {};
      (prodData?.translations||[]).forEach(t=>{if(t.slug)prodMap[t.slug]={title:t.title,desc:t.desc};});

      // 3. Reconstruire blueprint traduit
      const translated = {
        ...blueprint,
        allCollections: blueprint.allCollections.map(col=>({
          ...col,
          title: colMap[col.title]||col.title,
          intro: col.intro,
          products: (col.products||[]).map(p=>({
            ...p,
            title: prodMap[p.slug]?.title||p.title,
            desc: prodMap[p.slug]?.desc||p.desc,
          })),
        })),
      };

      return ok({blueprint:translated, lang, country, collections_translated:Object.keys(colMap).length, products_translated:Object.keys(prodMap).length});
    }

    return err('Not found', 404);
  }
};
