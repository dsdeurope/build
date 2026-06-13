#!/usr/bin/env node
/**
 * Supprime toutes les boutiques avec aliexpress_pct < 100 (ou null).
 * 1 seul write KV via POST /boutiques/purge.
 *
 * Usage:
 *   node scripts/purge-non-ali100.js
 *   node scripts/purge-non-ali100.js --dry-run
 */

const API = 'https://v35-build-api.ernestpedanou.workers.dev/api';
const TOKEN = 'c0e1ef644e74252419e56e7818885cbeaf7bd35bec04b0dfda954678e4f16354';
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  // 1. Récupérer toutes les boutiques (sans filtre ali)
  const res = await fetch(`${API}/boutiques?limit=500`);
  if (!res.ok) { console.error('GET /boutiques failed:', res.status); process.exit(1); }
  const { list } = await res.json();

  // 2. Identifier celles avec aliexpress_pct !== 100
  const toDelete = list.filter(b => b.aliexpress_pct !== 100);
  const toKeep   = list.filter(b => b.aliexpress_pct === 100);

  console.log(`Total : ${list.length} | À garder (100%) : ${toKeep.length} | À supprimer : ${toDelete.length}`);
  if (toDelete.length === 0) { console.log('Rien à supprimer.'); return; }

  toDelete.forEach(b => console.log(`  - ${b.domain} (${b.aliexpress_pct ?? 'null'}%)`));

  if (DRY_RUN) { console.log('\n[dry-run] Aucune suppression effectuée.'); return; }

  // 3. Purge en 1 seul write KV
  const purge = await fetch(`${API}/boutiques/purge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
    body: JSON.stringify({ ids: toDelete.map(b => b.id) })
  });
  const result = await purge.json();
  console.log('\nRésultat purge:', result);
  if (!purge.ok) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
