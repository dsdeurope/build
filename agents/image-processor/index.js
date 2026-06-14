// V35 Image Processor — Anti-duplicate pipeline complet
// Principe : chaque image passe par resize+couleur+bruit+watermark+WebP avant R2
// Résultat : hash totalement différent de l'original → invisible pour Google Lens + DMCA-safe
//
// POST /process     — pipeline complet sur 1 image (hero + card + thumb)
// POST /batch       — jusqu'à 10 images en parallèle
// GET  /images/*    — serve depuis R2 avec headers cache
// GET  /health

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};
const J = (d, s = 200) => Response.json({ ok: true,  ...d }, { status: s, headers: CORS });
const E = (m, s = 400) => Response.json({ ok: false, error: m }, { status: s, headers: CORS });

// ── SEO helpers ───────────────────────────────────────────────────────────────
function toSlug(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-').replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 55);
}

function r2Key(domain, handle, title, idx) {
  const slug = toSlug(title || handle);
  const suffix = idx === 0 ? 'hero' : `gallery-${idx}`;
  return `products/${domain}/${handle}/${slug}-${suffix}.webp`;
}

// Alt text : chaque image d'une galerie a un angle différent (SEO)
const ALT_ANGLES = ['', ' - vue détaillée', ' - angle alternatif', ' - zoom matière', ' - porté'];
function buildAlt(title, idx) {
  return `${title}${ALT_ANGLES[Math.min(idx, ALT_ANGLES.length - 1)] || ` - photo ${idx + 1}`}`.slice(0, 125);
}

// ── Watermark — 4 positions rotatives (anti-crop batch) ───────────────────────
// Raison : position fixe = facile à masquer automatiquement via un crop
// Position change selon l'index → chaque image est unique même pour les voleuses de bots
function wmPos(idx, w, h, textW, fontSize) {
  const pad = Math.round(w * 0.022);
  return [
    { x: w - textW - pad, y: h - pad },                            // bas-droite
    { x: pad,             y: h - pad },                            // bas-gauche
    { x: Math.round((w - textW) / 2), y: Math.round(h / 2) },    // centre
    { x: w - textW - pad, y: fontSize + pad },                    // haut-droite
  ][idx % 4];
}

// ── Pixel manipulation : couleur + bruit en un seul pass ─────────────────────
// +3% brightness, -2% saturation, bruit ±3 — imperceptible à l'oeil, hash unique garanti
function applyPixelTransform(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const n = (Math.random() - 0.5) * 6; // bruit ±3
    // Désaturation -2% (blend vers gris) + brightness +3%
    d[i]     = Math.min(255, Math.max(0, Math.round((r * 0.98 + lum * 0.02) * 1.03 + n)));
    d[i + 1] = Math.min(255, Math.max(0, Math.round((g * 0.98 + lum * 0.02) * 1.03 + n)));
    d[i + 2] = Math.min(255, Math.max(0, Math.round((b * 0.98 + lum * 0.02) * 1.03 + n)));
  }
  ctx.putImageData(img, 0, 0);
}

// ── Watermark text ────────────────────────────────────────────────────────────
function drawWatermark(ctx, text, w, h, posIdx) {
  const fontSize = Math.max(11, Math.round(w * 0.024));
  ctx.font = `${fontSize}px Arial, sans-serif`;
  const tw = ctx.measureText(text).width;
  const pos = wmPos(posIdx, w, h, tw, fontSize);
  // Ombre noire pour lisibilité sur fond clair et sombre
  ctx.globalAlpha = 0.20;
  ctx.fillStyle = '#000';
  ctx.fillText(text, pos.x + 1, pos.y + 1);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, pos.x, pos.y);
  ctx.globalAlpha = 1.0;
}

// ── Pipeline principal : fetch → transform → encode ──────────────────────────
async function pipeline(sourceUrl, watermarkText, positionIndex) {
  // 1. Fetch
  const resp = await fetch(sourceUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) throw new Error(`fetch:${resp.status}`);
  const blob = await resp.blob();
  if (!blob.type.startsWith('image/') && blob.type !== 'application/octet-stream') throw new Error(`not_image:${blob.type}`);

  // 2. Decode → ImageBitmap (EXIF supprimé automatiquement à l'encodage canvas)
  const bitmap = await createImageBitmap(blob);
  const origW = bitmap.width, origH = bitmap.height;
  if (origW < 80 || origH < 80) { bitmap.close(); throw new Error('image_too_small'); }

  // 3. Resize pseudo-aléatoire basé sur positionIndex (93% → 99% de l'original)
  //    Chaque index donne un ratio unique → hash différent même pour le même produit
  const factor = 0.93 + (positionIndex % 7) * 0.009; // 0.930, 0.939, 0.948, ...
  const heroW = Math.round(origW * factor);
  const heroH = Math.round(origH * factor);

  // ── Hero (1200px max, transformations complètes + watermark)
  const hC = new OffscreenCanvas(heroW, heroH);
  const hCtx = hC.getContext('2d');
  hCtx.drawImage(bitmap, 0, 0, heroW, heroH);
  applyPixelTransform(hCtx, heroW, heroH);
  if (watermarkText) drawWatermark(hCtx, watermarkText, heroW, heroH, positionIndex);

  // ── Card 600px (pas de watermark si trop petite)
  const cardW = Math.min(600, heroW);
  const cardH = Math.round(heroH * (cardW / heroW));
  const cC = new OffscreenCanvas(cardW, cardH);
  const cCtx = cC.getContext('2d');
  cCtx.drawImage(bitmap, 0, 0, cardW, cardH);
  applyPixelTransform(cCtx, cardW, cardH);
  if (watermarkText && cardW >= 400) drawWatermark(cCtx, watermarkText, cardW, cardH, positionIndex);

  // ── Thumb 300px (pas de watermark — trop petit, nuit à l'UX)
  const thumbW = Math.min(300, heroW);
  const thumbH = Math.round(heroH * (thumbW / heroW));
  const tC = new OffscreenCanvas(thumbW, thumbH);
  tC.getContext('2d').drawImage(bitmap, 0, 0, thumbW, thumbH);

  bitmap.close();

  // 4. Encode WebP en parallèle (EXIF supprimé par re-encodage canvas)
  const [heroBlob, cardBlob, thumbBlob] = await Promise.all([
    hC.convertToBlob({ type: 'image/webp', quality: 0.82 }),
    cC.convertToBlob({ type: 'image/webp', quality: 0.82 }),
    tC.convertToBlob({ type: 'image/webp', quality: 0.80 }),
  ]);

  return { heroBlob, cardBlob, thumbBlob, origW, origH, newW: heroW, newH: heroH, factor };
}

// ── Upload R2 ─────────────────────────────────────────────────────────────────
async function uploadR2(r2, key, blob) {
  await r2.put(key, await blob.arrayBuffer(), {
    httpMetadata: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' },
  });
  return key;
}

// ── Process one image (full pipeline + R2) ───────────────────────────────────
async function processOne(body, env) {
  const { source_url, product_title = '', handle = 'product', domain = 'store', position_index = 0 } = body;
  if (!source_url) throw new Error('source_url required');
  if (!env.R2) throw new Error('R2 binding not configured');

  const watermark = env.WATERMARK_TEXT || domain;
  const heroKey  = r2Key(domain, handle, product_title, position_index);
  const cardKey  = heroKey.replace('-hero.webp', '-card.webp').replace(/(gallery-\d+)\.webp/, '$1-card.webp');
  const thumbKey = heroKey.replace('.webp', '-thumb.webp');

  const { heroBlob, cardBlob, thumbBlob, origW, origH, newW, newH, factor } = await pipeline(source_url, watermark, position_index);

  await Promise.all([
    uploadR2(env.R2, heroKey,  heroBlob),
    uploadR2(env.R2, cardKey,  cardBlob),
    uploadR2(env.R2, thumbKey, thumbBlob),
  ]);

  const base = env.CDN_DOMAIN ? `https://${env.CDN_DOMAIN}` : `https://v35-image-processor.ernestpedanou.workers.dev/images`;
  return {
    hero_url:  `${base}/${heroKey}`,
    card_url:  `${base}/${cardKey}`,
    thumb_url: `${base}/${thumbKey}`,
    filename:  heroKey.split('/').pop(),
    alt_text:  buildAlt(product_title, position_index),
    title_text: (product_title || buildAlt(product_title, position_index)).slice(0, 100),
    key: heroKey,
    meta: { orig: `${origW}×${origH}`, output: `${newW}×${newH}`, resize_factor: factor.toFixed(3), watermarked: !!watermark, size_bytes: heroBlob.size },
  };
}

// ── ROUTER ────────────────────────────────────────────────────────────────────
function authOk(req, env) {
  const h = req.headers.get('Authorization') || '';
  const t = new URL(req.url).searchParams.get('token') || '';
  return !env.API_TOKEN || h === 'Bearer ' + env.API_TOKEN || t === env.API_TOKEN;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url  = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '');

    // ── Serve images from R2 — public (CDN-like)
    if (path.startsWith('/images/')) {
      const key = decodeURIComponent(path.slice(8));
      if (!env.R2) return new Response('R2 not configured', { status: 503 });
      const obj = await env.R2.get(key);
      if (!obj) return new Response('Not found', { status: 404 });
      const ifNoneMatch = request.headers.get('If-None-Match');
      if (ifNoneMatch && obj.etag && ifNoneMatch === obj.etag) return new Response(null, { status: 304 });
      return new Response(obj.body, {
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Access-Control-Allow-Origin': '*',
          'ETag': obj.etag || '',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    if (path === '/health') return J({ worker: 'v35-image-processor', r2: !!env.R2, cdn: env.CDN_DOMAIN || 'worker-url' });
    if (!authOk(request, env)) return E('Unauthorized', 401);

    if (request.method !== 'POST') return E('Method not allowed', 405);
    let body = {};
    try { body = await request.json(); } catch { return E('Invalid JSON'); }

    // ── Single image
    if (path === '/process') {
      try {
        const result = await processOne(body, env);
        return J(result);
      } catch (e) {
        return E(e.message);
      }
    }

    // ── Batch (10 max)
    if (path === '/batch') {
      const items = Array.isArray(body.images) ? body.images : [];
      if (!items.length) return E('images[] required');
      const results = await Promise.allSettled(
        items.slice(0, 10).map((item, i) =>
          processOne({ ...item, position_index: item.position_index ?? i }, env)
        )
      );
      return J({
        processed: results.filter(r => r.status === 'fulfilled').length,
        failed:    results.filter(r => r.status === 'rejected').length,
        results:   results.map(r => r.status === 'fulfilled'
          ? { ok: true,  ...r.value }
          : { ok: false, error: r.reason?.message }
        ),
      });
    }

    return E('Not found', 404);
  },
};
