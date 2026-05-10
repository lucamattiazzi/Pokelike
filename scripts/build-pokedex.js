#!/usr/bin/env node
// scripts/build-pokedex.js
// Fetches base stats for every catchable species (Gen 1-5, no legendaries)
// from PokeAPI and writes server/engine/pokedex.json.
//
// Run from the repo root:
//   node scripts/build-pokedex.js
//
// Output: server/engine/pokedex.json
//   { "1": { hp, atk, def, speed, special, spdef }, ... }
//
// Copy the output file to the server repo at server/engine/pokedex.json.
// The server loads it at boot for stat-inflation validation.

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH  = join(__dirname, '..', 'server', 'engine', 'pokedex.json');
const CONCURRENCY = 8;   // parallel fetches — PokeAPI is generous but don't hammer it
const RETRY_LIMIT = 3;

const LEGENDARY_IDS = new Set([
  144,145,146,150,151,
  243,244,245,249,250,251,
  377,378,379,380,381,382,383,384,385,386,
  480,481,482,483,484,485,486,487,488,489,490,491,492,493,
  494,638,639,640,641,642,643,644,645,646,647,648,649,
]);

const ALL_IDS = Array.from({ length: 649 }, (_, i) => i + 1)
  .filter(id => !LEGENDARY_IDS.has(id));

console.log(`Fetching stats for ${ALL_IDS.length} species from PokeAPI…`);

async function fetchWithRetry(id, attempt = 1) {
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    const get = name => d.stats.find(s => s.stat.name === name)?.base_stat ?? null;
    return {
      id,
      hp:      get('hp'),
      atk:     get('attack'),
      def:     get('defense'),
      speed:   get('speed'),
      special: get('special-attack'),
      spdef:   get('special-defense'),
    };
  } catch (e) {
    if (attempt < RETRY_LIMIT) {
      await new Promise(r => setTimeout(r, 500 * attempt));
      return fetchWithRetry(id, attempt + 1);
    }
    console.error(`  FAILED id=${id} after ${RETRY_LIMIT} attempts: ${e.message}`);
    return null;
  }
}

// Run IDs in batches of CONCURRENCY
async function fetchAll() {
  const results = {};
  const failed  = [];
  let done = 0;

  for (let i = 0; i < ALL_IDS.length; i += CONCURRENCY) {
    const batch   = ALL_IDS.slice(i, i + CONCURRENCY);
    const fetched = await Promise.all(batch.map(id => fetchWithRetry(id)));

    for (const entry of fetched) {
      if (!entry) { failed.push(entry); continue; }
      const { id, ...stats } = entry;
      // Validate — all stats should be positive numbers
      const invalid = Object.entries(stats).find(([, v]) => typeof v !== 'number' || v <= 0);
      if (invalid) {
        console.error(`  BAD DATA id=${id} stat=${invalid[0]} value=${invalid[1]}`);
        failed.push(id);
        continue;
      }
      results[id] = stats;
    }

    done += batch.length;
    const pct = ((done / ALL_IDS.length) * 100).toFixed(1);
    process.stdout.write(`\r  ${done}/${ALL_IDS.length} (${pct}%)   `);
  }

  return { results, failed };
}

(async () => {
  const { results, failed } = await fetchAll();
  process.stdout.write('\n');

  if (failed.length) {
    console.warn(`\n⚠  ${failed.length} species failed — re-run the script to retry them.`);
    console.warn(`   Failed IDs: ${failed.filter(Boolean).join(', ')}`);
  }

  mkdirSync(join(__dirname, '..', 'server', 'engine'), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));

  const count = Object.keys(results).length;
  console.log(`\n✓  Wrote ${count} species to ${OUT_PATH}`);

  if (failed.length) process.exit(1);
})();
