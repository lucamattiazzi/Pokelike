#!/usr/bin/env node
'use strict';
/**
 * play_model.js
 *
 * Runs games using the trained decision-tree model (from train_model.py)
 * instead of an LLM.  No API key needed; decisions are instant.
 *
 * The model predicts P(win | state, choice) for each option and picks
 * the highest-scoring one.  Falls back to a simple heuristic if no model
 * exists for a given decision type.
 *
 * Usage:
 *   node play_model.js [--games 1000] [--seed 1] [--out results/model_games.jsonl]
 *                      [--models models/] [--parallel 8]
 */

const fs   = require('fs');
const path = require('path');

const GameRunner = require('./game_runner');

// ─── Load JSON decision-tree models ──────────────────────────────────────────

function loadModels(modelsDir) {
  const models = {};
  for (const dtype of ['starter', 'branch', 'catch', 'item']) {
    const p = path.join(modelsDir, `model_${dtype}.json`);
    if (fs.existsSync(p)) {
      models[dtype] = JSON.parse(fs.readFileSync(p, 'utf8'));
      console.log(`Loaded model: ${dtype}`);
    }
  }
  return models;
}

// ─── Decision tree inference ─────────────────────────────────────────────────

function dtPredict(model, featureValues) {
  const { children_left, children_right, feature, threshold, value } = model;
  let node = 0;
  while (children_left[node] !== -1) {
    const f  = feature[node];
    const tv = featureValues[f] ?? 0;
    node = tv <= threshold[node] ? children_left[node] : children_right[node];
  }
  // value[node][0] = [n_class0, n_class1]
  const counts = value[node][0];
  const total  = counts.reduce((a, b) => a + b, 0);
  return total > 0 ? counts[1] / total : 0.5; // P(win)
}

function encodeFeatures(model, featDict) {
  const { feature_cols, encoders } = model;
  return feature_cols.map(col => {
    if (col.endsWith('_enc')) {
      const base = col.slice(0, -4);
      const val  = String(featDict[base] ?? 'unknown');
      const classes = encoders[base] || [];
      const idx = classes.indexOf(val);
      return idx === -1 ? 0 : idx;
    }
    return parseFloat(featDict[col] ?? 0);
  });
}

// ─── Build feature dict for a decision ───────────────────────────────────────

const ALL_TYPES = ['Normal','Fire','Water','Electric','Grass','Ice',
  'Fighting','Poison','Ground','Flying','Psychic','Bug','Rock',
  'Ghost','Dragon','Dark','Steel'];

function baseFeatures(state) {
  const team = state?.team || [];
  const typeCoverage = new Set(team.flatMap(p => p.types || []));
  const avgHp = team.length
    ? team.reduce((s, p) => { const [c, m] = (p.hp || '1/1').split('/').map(Number); return s + (m ? c/m : 0); }, 0) / team.length
    : 1;
  return {
    map:          state?.currentMap ?? 0,
    badges:       state?.badges ?? 0,
    teamSize:     team.length,
    avgHpRatio:   Math.round(avgHp * 100) / 100,
    avgBST:       team.length ? Math.round(team.reduce((s, p) => s + (p.bst || 0), 0) / team.length) : 0,
    itemCount:    state?.bagItems?.length ?? 0,
    teamWithItems: team.filter(p => p.item).length,
    typesCovered:  typeCoverage.size,
    ...Object.fromEntries(ALL_TYPES.map(t => [`has${t}`, typeCoverage.has(t) ? 1 : 0])),
  };
}

function buildFeatures(decision) {
  const base = baseFeatures(decision.state);
  const team = decision.state?.team || [];
  const typeCoverage = new Set(team.flatMap(p => p.types || []));

  switch (decision.type) {
    case 'starter':
      return (decision.options || []).map(opt => ({
        ...base,
        starterBST:  opt?.baseStats ? Object.values(opt.baseStats).reduce((a, b) => a + b, 0) : 0,
        starterType: opt?.types?.[0] || 'Unknown',
      }));

    case 'branch':
      return (decision.options || []).map(opt => ({
        ...base,
        chosenNodeType: opt?.type || 'unknown',
      }));

    case 'catch': {
      const opts = [...(decision.options || [])];
      if (decision.canSkip) opts.push(null); // skip option
      return opts.map(opt => ({
        ...base,
        skipped:     opt === null ? 1 : 0,
        catchedBST:  opt?.baseStats ? Object.values(opt.baseStats).reduce((a, b) => a + b, 0) : 0,
        catchedType: opt?.types?.[0] || 'none',
        isNewType:   opt?.types?.some(t => !typeCoverage.has(t)) ? 1 : 0,
      }));
    }

    case 'item': {
      const opts = [...(decision.options || [])];
      if (decision.canSkip) opts.push(null);
      return opts.map(opt => ({
        ...base,
        skipped:  opt === null ? 1 : 0,
        itemName: opt?.id || 'skip',
      }));
    }

    default:
      return (decision.options || decision.team || [{}]).map(() => base);
  }
}

// ─── ModelAgent ───────────────────────────────────────────────────────────────

class ModelAgent {
  constructor(models) {
    this._models = models;
  }

  /**
   * Returns the index of the best choice according to the trained model.
   * Falls back to heuristics if no model exists for this decision type.
   */
  decide(decision) {
    const model = this._models[decision.type];
    const featureSets = buildFeatures(decision);

    if (model && featureSets.length > 0) {
      // Score each option with the decision tree
      const scores = featureSets.map(f => dtPredict(model, encodeFeatures(model, f)));
      const best   = scores.indexOf(Math.max(...scores));
      return best;
    }

    // Heuristic fallbacks
    return this._heuristic(decision);
  }

  _heuristic(decision) {
    switch (decision.type) {
      case 'starter':
        // Pick highest BST
        return this._maxIdx((decision.options || []),
          p => p?.baseStats ? Object.values(p.baseStats).reduce((a, b) => a + b, 0) : 0);

      case 'branch': {
        // Prefer: pokecenter > catch > item > trainer > battle
        const pref = { pokecenter: 10, catch: 8, item: 7, move_tutor: 6, legendary: 5, trainer: 4, battle: 3, question: 2 };
        return this._maxIdx(decision.options || [], n => pref[n?.type] ?? 0);
      }

      case 'catch': {
        const team = decision.state?.team || [];
        const teamTypes = new Set(team.flatMap(p => p.types || []));
        const opts  = decision.options || [];
        // Score: base BST + bonus for new type coverage
        const scores = opts.map(p => {
          const bst   = p?.baseStats ? Object.values(p.baseStats).reduce((a, b) => a + b, 0) : 0;
          const bonus = (p?.types || []).some(t => !teamTypes.has(t)) ? 80 : 0;
          return bst + bonus;
        });
        // Skip (index opts.length) if best option BST is below threshold
        const best  = Math.max(...scores);
        if (decision.canSkip && best < 280 && team.length >= 4) {
          return opts.length; // skip
        }
        return scores.indexOf(best);
      }

      case 'swap': {
        const team = decision.team || [];
        // Release weakest (lowest BST), keeping items
        return this._minIdx(team, p => p?.bst ?? 0);
      }

      case 'item': {
        const HIGH_VALUE = new Set(['life_orb','choice_band','choice_specs',
          'shell_bell','leftovers','scope_lens','rocky_helmet']);
        const opts = decision.options || [];
        const scores = opts.map(it => HIGH_VALUE.has(it?.id) ? 2 : (it?.usable ? 1 : 0));
        const best = Math.max(...scores);
        if (decision.canSkip && best === 0) return opts.length; // skip low-value items
        return scores.indexOf(best);
      }

      case 'item_assign': {
        const team = decision.team || [];
        // Give to highest BST Pokemon that doesn't already have an item
        const noItem = team.filter(p => !p.heldItem);
        if (noItem.length === 0) return team.length; // bag
        const best = noItem.reduce((a, p) => (p.bst || 0) > (a.bst || 0) ? p : a);
        return team.indexOf(best);
      }

      case 'move_tutor':
        // Upgrade highest BST Pokemon
        return this._maxIdx(decision.team || [], p => p?.bst ?? 0);

      case 'trade':
        return (decision.team?.length || 0); // skip by default (random trade isn't safe)

      case 'evolve_branch':
        return 0; // first option

      default:
        return 0;
    }
  }

  _maxIdx(arr, scoreFn) {
    let best = 0, bestScore = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      const s = scoreFn(arr[i]);
      if (s > bestScore) { bestScore = s; best = i; }
    }
    return best;
  }

  _minIdx(arr, scoreFn) {
    let best = 0, bestScore = Infinity;
    for (let i = 0; i < arr.length; i++) {
      const s = scoreFn(arr[i]);
      if (s < bestScore) { bestScore = s; best = i; }
    }
    return best;
  }
}

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get  = (flag, def) => { const i = args.indexOf(flag); return i !== -1 && args[i+1] ? args[i+1] : def; };
  return {
    games:    parseInt(get('--games', '1000'), 10),
    seed:     parseInt(get('--seed',  '1'),    10),
    out:      get('--out',     path.join(__dirname, 'results', 'model_games.jsonl')),
    models:   get('--models',  path.join(__dirname, 'models')),
    parallel: parseInt(get('--parallel', '4'), 10),
    verbose:  args.includes('--verbose'),
  };
}

// ─── Run games ────────────────────────────────────────────────────────────────

async function playGame(runner, agent, seed) {
  const startMs = Date.now();

  const result = await runner.play(seed, async (decision) => {
    return agent.decide(decision);
  });

  return {
    seed,
    outcome:     result.outcome,
    mapsCleared: result.mapsCleared,
    finalTeam:   result.finalTeam,
    elapsedMs:   Date.now() - startMs,
    timestamp:   new Date().toISOString(),
  };
}

async function main() {
  const opts = parseArgs();

  // Load Pokemon cache
  const cachePath = path.join(__dirname, 'pokemon_cache.json');
  if (!fs.existsSync(cachePath)) {
    console.error('Pokemon cache not found. Run: node build_cache.js');
    process.exit(1);
  }
  const cache  = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  const models = loadModels(opts.models);

  if (Object.keys(models).length === 0) {
    console.log('No trained models found — using heuristics only.');
    console.log('To train models, first run: node run_games.js && python train_model.py\n');
  }

  const runner = new GameRunner(cache);
  const agent  = new ModelAgent(models);

  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  const out = fs.createWriteStream(opts.out, { flags: 'a' });

  console.log(`Running ${opts.games} games with model agent (seed ${opts.seed}...)`);
  console.log(`Parallel: ${opts.parallel}  Output: ${opts.out}\n`);

  let wins = 0, losses = 0, errors = 0;
  const t0 = Date.now();

  for (let i = 0; i < opts.games; i += opts.parallel) {
    const batch = Array.from(
      { length: Math.min(opts.parallel, opts.games - i) },
      (_, j) => opts.seed + i + j
    );
    const results = await Promise.all(batch.map(seed => playGame(runner, agent, seed)));

    for (const r of results) {
      out.write(JSON.stringify(r) + '\n');
      if (r.outcome === 'win')  { wins++;   process.stdout.write('W'); }
      else if (r.outcome === 'loss') { losses++; process.stdout.write('L'); }
      else                      { errors++; process.stdout.write('E'); }
    }

    if ((i + opts.parallel) % 100 === 0 || i + opts.parallel >= opts.games) {
      const done = Math.min(i + opts.parallel, opts.games);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const gps = (done / ((Date.now() - t0) / 1000)).toFixed(1);
      console.log(`\n[${done}/${opts.games}] Wins: ${wins} (${(100*wins/done).toFixed(1)}%) | ${elapsed}s | ${gps} g/s`);
    }
  }

  out.end();
  const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`COMPLETE: ${opts.games} games in ${totalSec}s`);
  console.log(`  Wins:   ${wins}  (${(100*wins/opts.games).toFixed(1)}%)`);
  console.log(`  Losses: ${losses}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Output: ${opts.out}`);
  console.log(`${'='.repeat(60)}`);
}

main().catch(err => { console.error(err); process.exit(1); });
