#!/usr/bin/env node
// scripts/build-client-pokedex.js
// Fetches every catchable species (Gen 1-5) from PokeAPI and writes
// data/pokedex.json — a single bundled dataset the client loads at boot
// to avoid per-pokemon HTTP fetches.
//
// Run from the repo root:
//   node scripts/build-client-pokedex.js
//
// Output: data/pokedex.json
//   {
//     "1": {
//       name, types, baseStats:{hp,atk,def,speed,special,spdef},
//       base_experience, spriteUrl, shinySpriteUrl,
//       growthRate, flavorText
//     }, ...
//   }

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH  = join(__dirname, '..', 'data', 'pokedex.json');
const CONCURRENCY = 8;
const RETRY_LIMIT = 4;
const MAX_ID = 649;

const ALL_IDS = Array.from({ length: MAX_ID }, (_, i) => i + 1);

console.log(`Fetching ${ALL_IDS.length} species (pokemon + pokemon-species) from PokeAPI…`);

function normalizeGrowthRate(slug) {
  switch (slug) {
    case 'slow':            return 'slow';
    case 'medium':          return 'medium_fast';
    case 'medium-slow':     return 'medium_slow';
    case 'fast':            return 'fast';
    case 'slow-then-very-fast':
    case 'fluctuating':     return 'fluctuating';
    case 'fast-then-very-slow':
    case 'erratic':         return 'erratic';
    default:                return 'medium_fast';
  }
}

async function fetchJson(url, attempt = 1) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (attempt < RETRY_LIMIT) {
      await new Promise(r => setTimeout(r, 600 * attempt));
      return fetchJson(url, attempt + 1);
    }
    throw e;
  }
}

async function fetchOne(id) {
  try {
    const [d, s] = await Promise.all([
      fetchJson(`https://pokeapi.co/api/v2/pokemon/${id}`),
      fetchJson(`https://pokeapi.co/api/v2/pokemon-species/${id}`),
    ]);
    const get = name => d.stats.find(x => x.stat.name === name)?.base_stat ?? 50;
    const baseStats = {
      hp:      get('hp'),
      atk:     get('attack'),
      def:     get('defense'),
      speed:   get('speed'),
      special: get('special-attack'),
      spdef:   get('special-defense'),
    };
    const types = d.types.map(t => t.type.name.charAt(0).toUpperCase() + t.type.name.slice(1));
    const flavorEntry = s.flavor_text_entries.find(e => e.language.name === 'en');
    const flavorText  = flavorEntry
      ? flavorEntry.flavor_text.replace(/\f|\n|­/g, ' ').replace(/\s{2,}/g, ' ').trim()
      : '';
    return {
      id,
      name: d.name.charAt(0).toUpperCase() + d.name.slice(1),
      types,
      baseStats,
      base_experience: d.base_experience ?? 64,
      spriteUrl:       d.sprites.front_default || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
      shinySpriteUrl:  d.sprites.front_shiny   || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${id}.png`,
      growthRate: normalizeGrowthRate(s.growth_rate?.name),
      flavorText,
    };
  } catch (e) {
    console.error(`  FAILED id=${id}: ${e.message}`);
    return null;
  }
}

(async () => {
  const results = {};
  const failed  = [];
  let done = 0;

  for (let i = 0; i < ALL_IDS.length; i += CONCURRENCY) {
    const batch   = ALL_IDS.slice(i, i + CONCURRENCY);
    const fetched = await Promise.all(batch.map(id => fetchOne(id)));
    for (const entry of fetched) {
      if (!entry) { failed.push(entry); continue; }
      const { id, ...rest } = entry;
      results[id] = rest;
    }
    done += batch.length;
    const pct = ((done / ALL_IDS.length) * 100).toFixed(1);
    process.stdout.write(`\r  ${done}/${ALL_IDS.length} (${pct}%)   `);
  }
  process.stdout.write('\n');

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(results));

  const count = Object.keys(results).length;
  console.log(`✓  Wrote ${count} species to ${OUT_PATH}`);
  if (failed.length) {
    console.warn(`⚠  ${failed.length} species failed — re-run to retry.`);
    process.exit(1);
  }
})();
