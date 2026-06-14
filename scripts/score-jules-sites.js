#!/usr/bin/env node
// Calcule CPC (benchmark niche) + Score V35 pour les sites jules_dur
// Score V35 /10 : aliexpress_pct + CMS + âge domaine + online + http_status

const fs   = require('fs');
const path = require('path');
const INDEX = path.join(__dirname, '../agents/build-api/index.js');

// ── CPC benchmark FR par niche (source: Google Ads industry reports 2024) ────
const CPC_NICHE = {
  bijoux:  0.75,
  mode:    0.55,
  maison:  0.45,
  beaute:  0.80,
  enfant:  0.55,
  sport:   0.50,
  default: 0.50,
};

// ── Score V35 /10 ─────────────────────────────────────────────────────────────
// AliExpress (3pts) + CMS (2pts) + Âge (2pts) + Online (2pts) + HTTP 200 (1pt)
function calcScore(b) {
  let score = 0;

  // AliExpress pct — 3 pts max
  const pct = b.aliexpress_pct ?? 0;
  if (pct >= 100)      score += 3.0;
  else if (pct >= 99)  score += 2.5;
  else if (pct >= 80)  score += 2.0;

  // CMS quality — 2 pts max
  const cms = (b.type || '').toLowerCase();
  if (cms === 'shopify')       score += 2.0;
  else if (cms === 'woocommerce') score += 1.5;
  else if (cms !== 'unknown' && cms !== '') score += 1.0;

  // Âge domaine — 2 pts max
  const age = b.age_days || 0;
  if (age > 365 * 3)      score += 2.0;
  else if (age > 365 * 1) score += 1.5;
  else if (age > 180)     score += 0.5;

  // Online — 2 pts max
  if (b.online === true)   score += 2.0;
  else if (b.online !== false) score += 0; // inconnu

  // HTTP 200 — 1 pt
  if (b.http_status === 200) score += 1.0;

  return Math.round(Math.min(score, 10) * 10) / 10;
}

// ── Patch BOUTIQUES_SEED ──────────────────────────────────────────────────────
let code = fs.readFileSync(INDEX, 'utf8');

// Extraire le BOUTIQUES_SEED
const seedStart = code.indexOf('const BOUTIQUES_SEED = [');
const seedEnd   = code.indexOf('];', seedStart) + 2;
const seedStr   = code.slice(seedStart + 'const BOUTIQUES_SEED = '.length, seedEnd - 1);

let seed;
try { seed = JSON.parse(seedStr); }
catch (e) { console.error('Parse error:', e.message); process.exit(1); }

let updated = 0;
for (const b of seed) {
  if (!b.comment?.includes('@jules_dur')) continue;

  const cpc   = CPC_NICHE[b.niche] ?? CPC_NICHE.default;
  const score = calcScore(b);

  b.cpc   = cpc;
  b.score = score;
  updated++;
}

// Réécrire le fichier
const newSeed = 'const BOUTIQUES_SEED = ' + JSON.stringify(seed);
code = code.slice(0, seedStart) + newSeed + code.slice(seedEnd - 1);
fs.writeFileSync(INDEX, code);

console.log(`✅ ${updated} sites mis à jour (CPC + Score V35)`);

// Résumé distribution scores
const scores = seed.filter(b => b.comment?.includes('@jules_dur')).map(b => b.score);
const avg    = (scores.reduce((a,b) => a+b, 0) / scores.length).toFixed(1);
const dist   = { '<5': 0, '5-7': 0, '7-8': 0, '8-9': 0, '9-10': 0 };
for (const s of scores) {
  if (s < 5)      dist['<5']++;
  else if (s < 7) dist['5-7']++;
  else if (s < 8) dist['7-8']++;
  else if (s < 9) dist['8-9']++;
  else            dist['9-10']++;
}
console.log(`Score moyen: ${avg}/10`);
console.log('Distribution:', dist);
