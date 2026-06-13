// Orchestrateur V35 — pilote le pipeline complet de clonage/déploiement de sites
// Pipeline: validate → scrape → images → aged-domain → content-jobs → skeleton

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const WORKERS = {
  SEQ:      'https://v35-sequenceur.ernestpedanou.workers.dev',
  HEALTH:   'https://v35-domain-health-checker.ernestpedanou.workers.dev',
  SKELETON: 'https://v35-skeleton-builder.ernestpedanou.workers.dev',
  AGED:     'https://v35-aged-domain-finder.ernestpedanou.workers.dev',
  PALETTE:  'https://v35-color-palette.ernestpedanou.workers.dev',
  SUPPLIER: 'https://v35-supplier-resolver.ernestpedanou.workers.dev',
};

// Free image APIs — caller supplies API keys via env or body
const PEXELS_BASE  = 'https://api.pexels.com/v1/search';
const UNSPLASH_BASE= 'https://api.unsplash.com/search/photos';

// Language → hreflang mapping
const LANG_LABELS = {
  fr:'Français', de:'Deutsch', es:'Español', it:'Italiano',
  pt:'Português', nl:'Nederlands', pl:'Polski', sv:'Svenska',
  da:'Dansk', en:'English', ro:'Română',
};

// Spam blacklist for content filtering
const SPAM_RE = /viagra|cialis|pharmacy|porn|casino|gambling|bet\b|loan|payday|drug|nude|escort/i;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}

function sanitizeDomain(d) {
  return d.replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0].toLowerCase().trim();
}

// ── Image helpers ─────────────────────────────────────────────────────────────

async function fetchPexelsImages(query, niche, apiKey, count = 12) {
  if (!apiKey) return [];
  try {
    const r = await fetch(`${PEXELS_BASE}?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(8000),
    });
    const d = await r.json();
    return (d.photos || []).map((p, i) => ({
      id: `pexels_${p.id}`,
      src: p.src.large2x || p.src.large,
      thumb: p.src.medium,
      photographer: p.photographer,
      source: 'pexels',
      alt: buildAlt(query, niche, i),
      filename: `${niche}_pexels_${p.id}.webp`,
      dedup_hint: 'rename+webp+strip-exif+resize-800px',
    }));
  } catch { return []; }
}

async function fetchUnsplashImages(query, niche, apiKey, count = 12) {
  if (!apiKey) return [];
  try {
    const r = await fetch(`${UNSPLASH_BASE}?query=${encodeURIComponent(query)}&per_page=${count}`, {
      headers: { Authorization: `Client-ID ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    const d = await r.json();
    return (d.results || []).map((p, i) => ({
      id: `unsplash_${p.id}`,
      src: p.urls.regular,
      thumb: p.urls.thumb,
      photographer: p.user.name,
      source: 'unsplash',
      alt: buildAlt(query, niche, i),
      filename: `${niche}_unsplash_${p.id}.webp`,
      dedup_hint: 'rename+webp+strip-exif+resize-800px',
    }));
  } catch { return []; }
}

function buildAlt(query, niche, idx) {
  // Multi-language ALT stubs — filled in by content pipeline
  return {
    fr: `${query} — ${niche} ${idx + 1}`,
    de: `${query} — ${niche} ${idx + 1}`,
    es: `${query} — ${niche} ${idx + 1}`,
    it: `${query} — ${niche} ${idx + 1}`,
    en: `${query} — ${niche} ${idx + 1}`,
  };
}

// ── Content job generator (prompts for traduction service) ────────────────────

function buildContentJobs(blueprint, targetDomain, niche, languages) {
  const collections = blueprint.collections || [];
  const brand = targetDomain.replace(/^www\./,'').split('.')[0].replace(/-/g,' ');
  const jobs = [];

  const langList = languages.map(l => LANG_LABELS[l] || l).join(', ');

  // 1. Collection intros (Koray-style — from COLLECTIONS_INTRO XLSX pattern)
  const collTitles = collections.map(c => c.title).join('", "');
  jobs.push({
    type: 'collection_intro',
    prompt_numero: `${targetDomain}_CI_1`,
    prompt: `SYSTEM: You are a Category Page Semantic Writer for ecommerce. Write concise, descriptive collection introductions (80-120 words each) for the niche: ${niche}. Do NOT invent specs, certifications or discount claims. Rewrite from scratch — NOT a translation of the source site.

Brand: ${brand}
Domain: ${targetDomain}
Categories: ["${collTitles}"]
Languages: ${langList}

For EACH language, generate introductions for EACH category. Output JSON:
{"lang": "fr", "collections": [{"handle": "...", "intro": "..."}]}`,
    langue: langList,
    pays: languages.join(','),
    site: targetDomain,
  });

  // 2. Collection long (full category page copy)
  collections.slice(0, 8).forEach((col, i) => {
    jobs.push({
      type: 'collection_long',
      prompt_numero: `${targetDomain}_CL_${i+1}`,
      prompt: `You are a multilingual e-commerce SEO + CRO copywriter.

Write a full-length category page (400-600 words) for:
Category: ${col.title}
Brand: ${brand}
Niche: ${niche}
Domain: ${targetDomain}

Requirements:
- Rewrite entirely — do NOT translate word-for-word from any source
- Semantic SEO structure: H2 intro + 2-3 H3 sub-sections + buying guide + CTA
- Languages: ${langList}
- No spam, no fake specs, no invented data

Output JSON: {"lang":"fr","handle":"${col.handle}","h1":"...","intro":"...","sections":[{"h2":"...","body":"..."}]}`,
      langue: langList,
      pays: languages.join(','),
      site: targetDomain,
    });
  });

  // 3. Blog articles (3 per site)
  const blogTopics = [
    `Guide d'achat ${niche} — comment choisir`,
    `Tendances ${niche} — les incontournables`,
    `Entretien et conseils ${niche}`,
  ];
  blogTopics.forEach((topic, i) => {
    jobs.push({
      type: 'blog',
      prompt_numero: `${targetDomain}_BL_${i+1}`,
      prompt: `You are a multilingual content writer for an e-commerce site in the ${niche} niche.

Write a blog article on: "${topic}"
Brand: ${brand}
Domain: ${targetDomain}
Languages: ${langList}

Requirements:
- 600-800 words per language
- SEO-optimized: H1, H2s, natural keyword usage
- Informational + helpful — no sales pitch
- Rewrite from scratch (not a translation)

Output JSON: {"lang":"fr","slug":"...","title":"...","intro":"...","sections":[{"h2":"...","body":"..."}],"meta_description":"..."}`,
      langue: langList,
      pays: languages.join(','),
      site: targetDomain,
    });
  });

  // 4. SEO titles (from Titres XLSX pattern)
  jobs.push({
    type: 'titles',
    prompt_numero: `${targetDomain}_TI_1`,
    prompt: `SYSTEM ROLE: Tu es un Expert SEO Multilingue. Tu génères des titres produits optimisés.

Pour le site ${targetDomain} (niche: ${niche}), génère des titres SEO pour ces collections:
${collections.map(c => `- ${c.title} (${c.count||0} produits)`).join('\n')}

Languages: ${langList}

Règles:
- 50-65 caractères max par titre
- Inclure le mot-clé principal naturellement
- Pas de spam, pas de majuscules abusives
- Adapter le ton selon la langue (ex: DE = plus formel, FR = lifestyle)

Output JSON: {"lang":"fr","titles":[{"collection":"...","title":"...","meta_title":"...","h1":"..."}]}`,
    langue: langList,
    pays: languages.join(','),
    site: targetDomain,
  });

  return jobs;
}

// ── Hreflang builder ──────────────────────────────────────────────────────────

function buildHreflang(targetDomain, languages) {
  const base = `https://${targetDomain}`;
  return languages.map(lang => ({
    lang,
    href: `${base}/${lang}/`,
    tag: `<link rel="alternate" hreflang="${lang}" href="${base}/${lang}/">`,
  })).concat([{
    lang: 'x-default',
    href: `${base}/fr/`,
    tag: `<link rel="alternate" hreflang="x-default" href="${base}/fr/">`,
  }]);
}

// ── Pipeline step runner ──────────────────────────────────────────────────────

async function runStep(jobId, stepName, fn, env) {
  const key = `orch:${jobId}`;
  const raw = await env.KV.get(key);
  const job = raw ? JSON.parse(raw) : {};

  job.steps = job.steps || [];
  const stepIdx = job.steps.findIndex(s => s.name === stepName);
  const step = stepIdx >= 0 ? job.steps[stepIdx] : { name: stepName, status: 'pending' };

  step.status = 'running';
  step.startedAt = Date.now();
  if (stepIdx < 0) job.steps.push(step); else job.steps[stepIdx] = step;
  await env.KV.put(key, JSON.stringify(job), { expirationTtl: 86400 });

  let result;
  try {
    result = await fn();
    step.status = 'done';
    step.result = result;
  } catch (e) {
    step.status = 'error';
    step.error = e.message;
  }
  step.duration = Date.now() - step.startedAt;
  job.steps[job.steps.findIndex(s => s.name === stepName)] = step;
  await env.KV.put(key, JSON.stringify(job), { expirationTtl: 86400 });
  return result;
}

// ── Main fetch handler ────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\//, '');

    // GET /status/:jobId
    if (request.method === 'GET' && path.startsWith('status/')) {
      const jobId = path.slice(7);
      const raw = await env.KV.get(`orch:${jobId}`);
      if (!raw) return Response.json({ error: 'Job not found' }, { status: 404, headers: CORS });
      return Response.json(JSON.parse(raw), { headers: CORS });
    }

    // GET /jobs — list recent jobs
    if (request.method === 'GET' && path === 'jobs') {
      const list = await env.KV.get('orch:__index');
      return Response.json(list ? JSON.parse(list) : [], { headers: CORS });
    }

    if (request.method !== 'POST') return new Response('POST /orchestrate', { status: 405, headers: CORS });

    let body;
    try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS }); }

    const {
      sourceDomain: rawSource,
      targetDomain: rawTarget,
      niche = 'mode',
      languages = ['fr', 'de', 'es'],
      findAgedDomain = true,
      pexelsKey = env.PEXELS_KEY || '',
      unsplashKey = env.UNSPLASH_KEY || '',
    } = body;

    if (!rawSource || !rawTarget) {
      return Response.json({ error: 'sourceDomain + targetDomain required' }, { status: 400, headers: CORS });
    }

    const sourceDomain = sanitizeDomain(rawSource);
    const targetDomain = sanitizeDomain(rawTarget);

    // Spam check on source domain
    if (SPAM_RE.test(sourceDomain)) {
      return Response.json({ error: 'Source domain flagged as spam niche' }, { status: 400, headers: CORS });
    }

    const jobId = uid();
    const jobKey = `orch:${jobId}`;

    // Init job record
    const job = {
      id: jobId,
      sourceDomain,
      targetDomain,
      niche,
      languages,
      status: 'running',
      createdAt: Date.now(),
      steps: [],
    };
    await env.KV.put(jobKey, JSON.stringify(job), { expirationTtl: 86400 });

    // Update index
    const idxRaw = await env.KV.get('orch:__index');
    const idx = idxRaw ? JSON.parse(idxRaw) : [];
    idx.unshift({ jobId, sourceDomain, targetDomain, niche, createdAt: job.createdAt });
    await env.KV.put('orch:__index', JSON.stringify(idx.slice(0, 50)), { expirationTtl: 86400 * 30 });

    // ── Run pipeline (sequential, each step updates KV) ───────────────────────

    // Step 1: Scrape source site
    const blueprint = await runStep(jobId, 'scrape', async () => {
      const r = await fetch(WORKERS.SEQ, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scrape-collections', domain: sourceDomain }),
        signal: AbortSignal.timeout(25000),
      });
      const d = await r.json();
      if (!d.collections?.length) throw new Error(d.error || 'No collections found');
      return {
        source: sourceDomain,
        collections: d.collections,
        totalCollections: d.collections.length,
        niches: d.niches || [niche],
      };
    }, env);

    // Step 2: Fetch images
    const images = await runStep(jobId, 'images', async () => {
      const query = `${niche} ${sourceDomain.split('.')[0]}`;
      const [pexels, unsplash] = await Promise.all([
        fetchPexelsImages(query, niche, pexelsKey, 15),
        fetchUnsplashImages(query, niche, unsplashKey, 10),
      ]);
      const all = [...pexels, ...unsplash];

      // Also extract source site image URLs from scraped collections
      const sourceImages = (blueprint?.collections || [])
        .filter(c => c.image)
        .map((c, i) => ({
          id: `scraped_${i}`,
          src: c.image,
          source: 'scraped',
          alt: buildAlt(c.title, niche, i),
          filename: `${niche}_${c.handle}_${i}.webp`,
          dedup_hint: 'rename+webp+strip-exif+resize-800px+unique-suffix',
        }));

      return {
        count: all.length + sourceImages.length,
        free_images: all,
        scraped_images: sourceImages,
        dedup_instructions: {
          steps: [
            '1. Télécharger chaque image',
            '2. Convertir en WebP (quality 82)',
            '3. Redimensionner à max 800px de large',
            '4. Supprimer les métadonnées EXIF',
            '5. Renommer: {niche}_{hash8}.webp',
            '6. ALT text: voir champ alt.{lang} par langue',
          ],
          php_snippet: `<?php\nfunction processImage(string $src, string $dest, string $hash): bool {\n  $img = imagecreatefromstring(file_get_contents($src));\n  if(!$img) return false;\n  $w = imagesx($img); $h = imagesy($img);\n  if($w > 800){ $h = intval($h * 800/$w); $img = imagescale($img, 800, $h); }\n  imagewebp($img, $dest, 82);\n  imagedestroy($img);\n  return true;\n}`,
        },
        free_sources: [
          { name: 'Pexels', url: 'https://www.pexels.com/api/', limit: '200 req/h, gratuit, usage commercial' },
          { name: 'Unsplash', url: 'https://unsplash.com/developers', limit: '50 req/h, gratuit, usage commercial' },
          { name: 'Pixabay', url: 'https://pixabay.com/api/docs/', limit: '100 req/h, gratuit, usage commercial' },
        ],
      };
    }, env);

    // Step 3: Find aged domain
    const agedDomain = findAgedDomain ? await runStep(jobId, 'aged_domain', async () => {
      const r = await fetch(`${WORKERS.AGED}?niche=${encodeURIComponent(niche)}&limit=10&min_age_days=730`, {
        signal: AbortSignal.timeout(20000),
      });
      const d = await r.json();
      return d;
    }, env) : { skipped: true };

    // Step 4: Generate content jobs
    const contentJobs = await runStep(jobId, 'content_jobs', async () => {
      const jobs = buildContentJobs(blueprint || { collections: [] }, targetDomain, niche, languages);
      return {
        count: jobs.length,
        types: [...new Set(jobs.map(j => j.type))],
        jobs,
        traduction_api: 'http://localhost:8000/api/jobs/upload',
        note: 'POST each job to traduction service as XLSX or via /api/jobs/create',
      };
    }, env);

    // Step 5: Build hreflang config
    const i18nConfig = await runStep(jobId, 'i18n', async () => {
      return {
        strategy: 'subdirectories',
        rationale: 'Recommandation Google — consolide PageRank, 1 seul domaine, hreflang natif',
        hreflang: buildHreflang(targetDomain, languages),
        url_structure: languages.map(l => ({
          lang: l,
          url: `https://${targetDomain}/${l}/`,
          collections: `https://${targetDomain}/${l}/collections/`,
          blog: `https://${targetDomain}/${l}/blog/`,
        })),
        php_router: `// In index.php — detect lang from URL segment\n$seg = explode('/', trim($_SERVER['REQUEST_URI'],'/'));\n$lang = in_array($seg[0], ['fr','de','es','it','nl','pt','pl','sv']) ? $seg[0] : 'fr';\ndefine('LANG', $lang);\nrequire __DIR__.'/includes/i18n.php';`,
        nginx_hint: `# Optional: rewrite /{lang}/ to index.php\nlocation ~ ^/([a-z]{2})(/.*)?$ {\n  try_files $uri $uri/ /index.php?lang=$1&path=$2;\n}`,
        htaccess: `# Subdirectory lang routing\nRewriteRule ^(fr|de|es|it|nl|pt|pl|sv)(/(.*))?$ index.php?lang=$1&path=$3 [L,QSA]`,
      };
    }, env);

    // Step 6: Generate skeleton
    const skeleton = await runStep(jobId, 'skeleton', async () => {
      const r = await fetch(WORKERS.SKELETON, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: targetDomain,
          niche,
          blueprint: blueprint || { collections: [] },
          languages,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      return { file_count: d.file_count, palette: d.palette, files: Object.keys(d.files) };
    }, env);

    // Finalize job
    const finalRaw = await env.KV.get(jobKey);
    const finalJob = JSON.parse(finalRaw);
    finalJob.status = finalJob.steps.some(s => s.status === 'error') ? 'partial' : 'done';
    finalJob.completedAt = Date.now();
    finalJob.summary = {
      source: sourceDomain,
      target: targetDomain,
      niche,
      languages,
      collections: blueprint?.totalCollections || 0,
      images: images?.count || 0,
      contentJobs: contentJobs?.count || 0,
      aged_domains_found: agedDomain?.count || 0,
      skeleton_files: skeleton?.file_count || 0,
      strategy: 'subdirectories + hreflang',
    };
    await env.KV.put(jobKey, JSON.stringify(finalJob), { expirationTtl: 86400 });

    return Response.json({ jobId, status: finalJob.status, summary: finalJob.summary, poll: `/status/${jobId}` }, { headers: CORS });
  }
};
