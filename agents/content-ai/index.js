// V35 Content AI — multilingual content generation via Mistral
// Secrets: MISTRAL_KEY, KV binding

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Content-Type': 'application/json',
};
function ok(d) { return Response.json({ ok:true, ...d }, { headers:CORS }); }
function err(msg, s=400) { return Response.json({ ok:false, error:msg }, { status:s, headers:CORS }); }

const MISTRAL_API = 'https://api.mistral.ai/v1/chat/completions';
const MODEL = 'mistral-small-latest'; // free tier compatible

const LANG_NAMES = { fr:'français', de:'allemand', es:'espagnol', it:'italien', en:'anglais', nl:'néerlandais', pt:'portugais' };

async function callMistral(key, prompt, maxTokens=400) {
  const r = await fetch(MISTRAL_API, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature: 0.7,
      messages: [{ role:'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`Mistral ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return d.choices?.[0]?.message?.content?.trim() || '';
}

// Cache in KV for 24h
async function cached(env, key, fn) {
  const hit = await env.KV.get(key);
  if (hit) return JSON.parse(hit);
  const val = await fn();
  await env.KV.put(key, JSON.stringify(val), { expirationTtl: 86400 });
  return val;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers:CORS });
    if (!env.MISTRAL_KEY) return err('MISTRAL_KEY secret not set', 500);

    const url = new URL(request.url);
    const [,, resource] = url.pathname.split('/');
    let body = {};
    if (request.method === 'POST') { try { body = await request.json(); } catch {} }

    // ── /api/health ──────────────────────────────────────────────────────────
    if (resource === 'health') return ok({ status:'ok', model:MODEL });

    // ── /api/product-description ─────────────────────────────────────────────
    // body: { productName, collectionName, niche, lang, keywords[] }
    if (resource === 'product-description') {
      const { productName, collectionName='', niche='mode', lang='fr', keywords=[] } = body;
      if (!productName) return err('productName required');
      const cacheKey = `ai:prod:${lang}:${productName.slice(0,50).replace(/\s+/g,'_')}`;
      const text = await cached(env, cacheKey, () =>
        callMistral(env.MISTRAL_KEY,
          `Rédige une description produit SEO en ${LANG_NAMES[lang]||lang} pour "${productName}" dans la niche "${niche}"${collectionName?' (collection: '+collectionName+')':''}. ${keywords.length?'Mots-clés à intégrer naturellement: '+keywords.join(', ')+'.':''} 3-4 phrases percutantes, bénéfices client, ton professionnel. Pas de titre, juste le texte.`
        )
      );
      return ok({ text, lang, productName });
    }

    // ── /api/collection-text ─────────────────────────────────────────────────
    // body: { collectionName, niche, lang, productCount }
    if (resource === 'collection-text') {
      const { collectionName, niche='mode', lang='fr', productCount=0 } = body;
      if (!collectionName) return err('collectionName required');
      const cacheKey = `ai:col:${lang}:${collectionName.slice(0,50).replace(/\s+/g,'_')}`;
      const text = await cached(env, cacheKey, () =>
        callMistral(env.MISTRAL_KEY,
          `Rédige un texte d'introduction pour la collection "${collectionName}" en ${LANG_NAMES[lang]||lang}. Niche: ${niche}. ${productCount>0?productCount+' produits disponibles.':''} Accrocheur, orienté SEO, 2-3 phrases. Pas de titre.`
        )
      );
      return ok({ text, lang, collectionName });
    }

    // ── /api/meta ────────────────────────────────────────────────────────────
    // body: { pageName, pageType, niche, lang, domain }
    if (resource === 'meta') {
      const { pageName, pageType='product', niche='mode', lang='fr', domain='' } = body;
      if (!pageName) return err('pageName required');
      const cacheKey = `ai:meta:${lang}:${pageName.slice(0,50).replace(/\s+/g,'_')}`;
      const result = await cached(env, cacheKey, async () => {
        const raw = await callMistral(env.MISTRAL_KEY,
          `Génère un titre SEO et une meta description en ${LANG_NAMES[lang]||lang} pour une page ${pageType} "${pageName}" (niche: ${niche}${domain?' - site: '+domain:''}).
Réponds UNIQUEMENT en JSON: {"title":"...","description":"..."}
Titre: max 60 car. Description: max 155 car. Sans guillemets dans les valeurs.`,
          200
        );
        try { return JSON.parse(raw.match(/\{.*\}/s)?.[0] || raw); }
        catch { return { title:pageName, description:raw.slice(0,155) }; }
      });
      return ok({ ...result, lang, pageName });
    }

    // ── /api/faq ─────────────────────────────────────────────────────────────
    // body: { topic, niche, lang, count }
    if (resource === 'faq') {
      const { topic, niche='mode', lang='fr', count=5 } = body;
      if (!topic) return err('topic required');
      const cacheKey = `ai:faq:${lang}:${topic.slice(0,40).replace(/\s+/g,'_')}`;
      const result = await cached(env, cacheKey, async () => {
        const raw = await callMistral(env.MISTRAL_KEY,
          `Génère ${count} questions-réponses FAQ en ${LANG_NAMES[lang]||lang} sur "${topic}" (niche: ${niche}).
Réponds UNIQUEMENT en JSON: [{"q":"...","a":"..."}]`,
          600
        );
        try { return JSON.parse(raw.match(/\[.*\]/s)?.[0] || '[]'); }
        catch { return []; }
      });
      return ok({ faq:result, lang, topic });
    }

    // ── /api/blog-intro ──────────────────────────────────────────────────────
    // body: { title, niche, lang, keywords[] }
    if (resource === 'blog-intro') {
      const { title, niche='mode', lang='fr', keywords=[] } = body;
      if (!title) return err('title required');
      const cacheKey = `ai:blog:${lang}:${title.slice(0,50).replace(/\s+/g,'_')}`;
      const text = await cached(env, cacheKey, () =>
        callMistral(env.MISTRAL_KEY,
          `Rédige une introduction d'article de blog en ${LANG_NAMES[lang]||lang} pour l'article "${title}" (niche: ${niche}). ${keywords.length?'Mots-clés: '+keywords.join(', ')+'.':''} Accrocheur, 100-150 mots, inspire la confiance.`,
          300
        )
      );
      return ok({ text, lang, title });
    }

    // ── /api/batch ───────────────────────────────────────────────────────────
    // body: { type, items[], lang, niche }
    // items: [{productName,...}, ...] — batch up to 20
    if (resource === 'batch') {
      const { type='product-description', items=[], lang='fr', niche='mode' } = body;
      if (!items.length) return err('items required');
      const results = [];
      for (const item of items.slice(0,20)) {
        try {
          const innerReq = new Request(request.url.replace('/api/batch', `/api/${type}`), {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ ...item, lang, niche }),
          });
          const r = await this.fetch(innerReq, env);
          results.push(await r.json());
        } catch(e) { results.push({ ok:false, error:e.message }); }
        await new Promise(r => setTimeout(r, 200)); // gentle rate limit
      }
      return ok({ results, count:results.length });
    }

    // ── /api/site-full ───────────────────────────────────────────────────────
    // Generate all content for a site: meta + collections + hero
    // body: { domain, niche, lang, collections[] }
    if (resource === 'site-full') {
      const { domain='', niche='mode', lang='fr', collections=[] } = body;
      const [hero, homeMeta] = await Promise.all([
        callMistral(env.MISTRAL_KEY,
          `Rédige un titre hero accrocheur (max 8 mots) et une accroche sous-titre (max 15 mots) en ${LANG_NAMES[lang]||lang} pour une boutique en ligne de ${niche}. JSON: {"hero":"...","sub":"..."}`,
          100
        ),
        callMistral(env.MISTRAL_KEY,
          `Titre SEO et meta description en ${LANG_NAMES[lang]||lang} pour la page d'accueil d'une boutique ${niche}${domain?' ('+domain+')':''}. JSON: {"title":"...","description":"..."}`,
          150
        ),
      ]);
      let heroData = { hero:'Découvrez notre collection', sub:'Livraison rapide, qualité garantie' };
      let metaData = { title:`Boutique ${niche}`, description:`Découvrez notre sélection ${niche}` };
      try { heroData = JSON.parse(hero.match(/\{.*\}/s)?.[0] || hero); } catch {}
      try { metaData = JSON.parse(homeMeta.match(/\{.*\}/s)?.[0] || homeMeta); } catch {}

      const colTexts = await Promise.all(collections.slice(0,10).map(c =>
        callMistral(env.MISTRAL_KEY,
          `Texte intro collection "${c}" en ${LANG_NAMES[lang]||lang} pour boutique ${niche}. 2 phrases max.`, 80
        ).catch(() => '')
      ));

      return ok({
        hero: heroData, meta: metaData,
        collections: collections.map((c,i) => ({ name:c, text:colTexts[i]||'' })),
        lang, domain,
      });
    }

    // ── /api/translate ───────────────────────────────────────────────────────
    // body: { text, fromLang, toLangs[], preserve_html }
    if (resource === 'translate') {
      const { text, fromLang='fr', toLangs=['de','es','it','en','nl','pt'], preserve_html=false } = body;
      if (!text) return err('text required');
      const results = {};
      const instructions = preserve_html ? 'Garde toutes les balises HTML intactes.' : '';
      await Promise.all(toLangs.map(async lang => {
        if (lang === fromLang) { results[lang] = text; return; }
        const cacheKey = `ai:tr:${fromLang}-${lang}:${text.slice(0,80).replace(/\s+/g,'_')}`;
        results[lang] = await cached(env, cacheKey, () =>
          callMistral(env.MISTRAL_KEY,
            `Traduis ce texte du ${LANG_NAMES[fromLang]||fromLang} vers le ${LANG_NAMES[lang]||lang}. ${instructions} Réponds UNIQUEMENT avec la traduction, sans explication:\n\n${text}`,
            Math.max(300, text.length * 2)
          )
        );
      }));
      return ok({ translations: results, fromLang, toLangs });
    }

    // ── /api/translate-site ──────────────────────────────────────────────────
    // Translate a full site's content strings into multiple languages
    // body: { strings:{key:value}, fromLang, toLangs[] }
    if (resource === 'translate-site') {
      const { strings={}, fromLang='fr', toLangs=['de','es'] } = body;
      const keys = Object.keys(strings);
      if (!keys.length) return err('strings required');
      const output = {}; // { de:{key:val}, es:{key:val} }
      toLangs.forEach(l => { output[l] = {}; });

      // Batch translate: join all strings, translate once per language
      const separator = '\n|||SPLIT|||\n';
      const combined = keys.map(k => strings[k]).join(separator);

      await Promise.all(toLangs.filter(l=>l!==fromLang).map(async lang => {
        try {
          const translated = await callMistral(env.MISTRAL_KEY,
            `Traduis chaque segment du ${LANG_NAMES[fromLang]||fromLang} vers le ${LANG_NAMES[lang]||lang}. Garde le séparateur "|||SPLIT|||" entre chaque segment. Réponds UNIQUEMENT avec les traductions séparées:\n\n${combined}`,
            Math.max(500, combined.length * 1.5)
          );
          const parts = translated.split('|||SPLIT|||');
          keys.forEach((k, i) => { output[lang][k] = (parts[i]||'').trim(); });
        } catch(e) {
          keys.forEach(k => { output[lang][k] = strings[k]; }); // fallback: original
        }
      }));
      if (toLangs.includes(fromLang)) { output[fromLang] = { ...strings }; }
      return ok({ output, fromLang, toLangs, keys:keys.length });
    }

    return err('Not found', 404);
  }
};
