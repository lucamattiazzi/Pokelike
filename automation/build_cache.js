#!/usr/bin/env node
/**
 * build_cache.js
 *
 * One-time script: fetches all relevant Pokemon species from PokeAPI and saves
 * to pokemon_cache.json so game_runner.js can work offline.
 *
 * Run once: node build_cache.js
 * Re-run to refresh: node build_cache.js --refresh
 */

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'pokemon_cache.json');

// All Pokemon IDs from GEN1_BST_APPROX in data.js, plus starters and evolution targets
const ALL_BUCKET_IDS = [
  // low
  1,4,7,10,11,13,14,16,17,19,20,21,23,27,29,32,41,46,48,52,54,56,60,
  69,72,74,79,81,84,86,96,98,100,102,108,111,116,118,120,129,133,
  152,155,158,161,163,165,167,170,172,173,174,175,177,179,183,187,
  191,194,201,204,209,216,218,220,223,225,228,231,235,236,238,246,
  252,255,258,261,263,265,266,268,270,273,276,278,280,281,283,285,
  287,290,292,293,296,298,300,304,307,309,316,318,322,325,327,328,
  331,333,339,341,343,349,353,355,360,361,363,366,370,371,374,
  387,390,393,396,399,401,403,406,412,415,420,425,427,431,436,438,443,447,449,451,453,456,459,
  495,498,501,504,506,509,511,513,515,517,519,522,524,527,529,532,535,540,543,
  546,548,551,554,557,562,564,566,568,570,572,574,577,580,582,585,
  588,590,592,595,597,599,602,605,607,610,613,616,619,622,624,627,629,633,636,
  // midLow
  25,30,33,35,37,39,43,50,58,61,63,66,73,77,83,92,95,96,104,109,
  113,114,116,120,122,126,127,128,138,140,
  166,168,180,188,190,193,222,239,240,
  267,269,271,274,294,299,302,303,329,345,347,
  418,426,428,432,434,437,439,441,444,448,450,452,454,455,457,460,
  505,507,510,518,520,523,525,528,530,536,541,544,547,549,552,555,
  558,563,565,567,569,571,573,575,578,581,583,586,589,591,593,596,
  598,600,603,606,608,611,614,617,620,623,625,628,630,634,
  // mid
  2,5,8,42,49,51,64,67,70,75,82,85,93,97,101,105,107,110,119,
  121,124,125,130,137,
  153,156,159,162,176,184,185,192,195,198,202,206,207,215,219,247,
  253,256,259,262,264,277,279,284,288,301,305,308,311,312,313,314,
  315,320,337,338,351,352,358,364,372,
  388,391,394,397,404,408,410,419,424,429,430,435,440,446,453,456,458,461,462,463,465,466,467,469,471,472,473,474,476,477,478,479,
  496,499,502,508,521,526,533,537,542,545,553,559,560,561,576,579,584,587,594,
  601,604,609,612,615,618,621,626,631,632,635,637,
  // midHigh
  26,36,40,44,55,62,76,80,87,88,89,90,91,99,106,115,117,123,131,132,137,142,143,
  164,176,178,200,203,205,207,210,211,215,221,224,226,227,234,237,
  272,275,286,291,297,310,317,319,323,324,326,332,335,336,340,342,
  354,356,357,359,362,367,368,369,375,
  400,407,413,416,417,421,423,433,445,464,468,475,
  497,500,503,531,538,539,550,556,
  // high
  3,6,9,12,15,18,22,24,28,31,34,38,45,47,53,57,59,
  65,68,71,76,78,80,89,94,103,112,117,121,130,134,135,136,139,141,142,143,149,
  154,164,171,181,182,186,189,196,197,199,205,208,212,213,214,217,
  229,232,233,241,
  282,295,321,330,334,344,346,348,
  389,398,402,405,409,411,414,422,431,436,442,448,460,470,
  497,500,503,512,514,516,534,
  // veryHigh
  6,9,65,68,94,112,130,131,143,147,148,149,
  157,160,169,230,242,248,
  254,257,260,289,306,350,365,373,376,
  392,395,445,448,460,466,467,468,473,475,477,
  497,500,503,535,537,571,609,612,635,637,
  // Gym leader & Elite Four Pokemon (for completeness)
  74,95,120,121,25,100,26,114,71,45,109,110,89,122,49,64,65,77,58,78,59,
  51,31,34,111,112,87,91,80,124,131,95,107,106,68,94,42,93,131,
  // Starters and evolutions
  1,2,3,4,5,6,7,8,9,
  // Legendaries (for legendary nodes)
  144,145,146,147,148,149,150,151,
  243,244,245,249,250,251,
  377,378,379,380,381,382,383,384,385,386,
  480,481,482,483,484,485,486,487,488,489,490,491,492,493,494,
];

const UNIQUE_IDS = [...new Set(ALL_BUCKET_IDS)].sort((a, b) => a - b);

async function fetchPokemon(id) {
  const url = `https://pokeapi.co/api/v2/pokemon/${id}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for id ${id}`);
  const d = await res.json();
  return {
    id: d.id,
    name: d.name.charAt(0).toUpperCase() + d.name.slice(1),
    types: d.types.map(t => t.type.name.charAt(0).toUpperCase() + t.type.name.slice(1)),
    baseStats: {
      hp:      d.stats.find(s => s.stat.name === 'hp')?.base_stat || 45,
      atk:     d.stats.find(s => s.stat.name === 'attack')?.base_stat || 50,
      def:     d.stats.find(s => s.stat.name === 'defense')?.base_stat || 50,
      speed:   d.stats.find(s => s.stat.name === 'speed')?.base_stat || 50,
      special: d.stats.find(s => s.stat.name === 'special-attack')?.base_stat || 50,
      spdef:   d.stats.find(s => s.stat.name === 'special-defense')?.base_stat || 50,
    },
    spriteUrl: d.sprites.front_default || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${d.id}.png`,
    shinySpriteUrl: d.sprites.front_shiny || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${d.id}.png`,
  };
}

async function buildCache() {
  const refresh = process.argv.includes('--refresh');

  let existing = {};
  if (!refresh && fs.existsSync(CACHE_FILE)) {
    existing = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    console.log(`Loaded ${Object.keys(existing).length} existing cache entries`);
  }

  const missing = UNIQUE_IDS.filter(id => !existing[id]);
  console.log(`Fetching ${missing.length} Pokemon from PokeAPI...`);

  const BATCH = 20;
  let fetched = 0;
  let errors = 0;

  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(id => fetchPokemon(id)));

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === 'fulfilled') {
        existing[batch[j]] = r.value;
        fetched++;
      } else {
        console.warn(`  Failed id ${batch[j]}: ${r.reason.message}`);
        errors++;
      }
    }

    process.stdout.write(`\r  Progress: ${Math.min(i + BATCH, missing.length)}/${missing.length} (${errors} errors)`);

    // Rate limit: small delay between batches
    if (i + BATCH < missing.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log(`\nFetched ${fetched} Pokemon, ${errors} errors`);
  fs.writeFileSync(CACHE_FILE, JSON.stringify(existing, null, 2));
  console.log(`Cache saved to ${CACHE_FILE} (${Object.keys(existing).length} total entries)`);
}

buildCache().catch(err => { console.error(err); process.exit(1); });
