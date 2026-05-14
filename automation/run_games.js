#!/usr/bin/env node
'use strict';
/**
 * run_games.js
 *
 * Main entry point.  Runs N games with the chosen agent and appends results
 * to a JSONL file for later analysis / model training.
 *
 * Usage:
 *   node run_games.js [--games 100] [--seed 42] [--out results/games.jsonl]
 *                     [--parallel 4] [--provider anthropic|llama|openai|random]
 *                     [--model <name>] [--base-url http://localhost:8080/v1]
 *
 * Providers:
 *   anthropic  (default) — Claude via Anthropic API; needs ANTHROPIC_API_KEY
 *   llama                — llama-cpp or any OpenAI-compatible local server
 *   openai               — OpenAI or any OpenAI-compatible remote API
 *   random               — fully random agent (no API needed; great for baselines)
 *
 * Environment:
 *   ANTHROPIC_API_KEY  — Anthropic key
 *   OPENAI_API_KEY     — key for openai/llama providers (use "none" for local)
 *   LLAMA_BASE_URL     — local server URL (default http://localhost:8080/v1)
 *   OPENAI_BASE_URL    — OpenAI-compatible server URL
 *   POKELIKE_MODEL     — model name override
 */

const fs   = require('fs');
const path = require('path');

const GameRunner  = require('./game_runner');
const LLMAgent    = require('./llm_agent');
const RandomAgent = require('./random_agent');

// ─── CLI args ─────────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const get  = (flag, def) => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : def;
  };
  const provider = get('--provider', 'anthropic');

  // Parse rules: --rules "rule1; rule2" splits on semicolons,
  // --rules-file FILE reads one rule per line
  let rules = [];
  const rulesStr  = get('--rules', '');
  const rulesFile = get('--rules-file', '');
  if (rulesStr)  rules = rulesStr.split(';').map(r => r.trim()).filter(Boolean);
  if (rulesFile) {
    const lines = fs.readFileSync(rulesFile, 'utf8').split('\n');
    rules = [...rules, ...lines.map(l => l.trim()).filter(l => l && !l.startsWith('#'))];
  }

  const nuzlocke = args.includes('--nuzlocke');

  // --memory [file]  — omit path to use default results/memory.md
  const memoryIdx = args.indexOf('--memory');
  let memory = '';
  if (memoryIdx !== -1) {
    const next = args[memoryIdx + 1];
    memory = (next && !next.startsWith('--'))
      ? next
      : path.join(__dirname, 'results', 'memory.md');
  }
  const memorySize = parseInt(get('--memory-size', '10'), 10);

  return {
    games:      parseInt(get('--games',    '50'),  10),
    seed:       parseInt(get('--seed',     '1'),   10),
    out:        get('--out', path.join(__dirname, 'results',
                  provider === 'random' ? 'random_games.jsonl'
                  : nuzlocke ? 'nuzlocke_games.jsonl' : 'games.jsonl')),
    parallel:   parseInt(get('--parallel', provider === 'random' ? '8' : '1'), 10),
    verbose:    args.includes('--verbose'),
    provider,
    model:      get('--model',    process.env.POKELIKE_MODEL || ''),
    baseUrl:    get('--base-url', process.env.LLAMA_BASE_URL || process.env.OPENAI_BASE_URL || ''),
    rules,
    nuzlocke,
    memory,
    memorySize,
  };
}

// ─── Load Pokemon cache ───────────────────────────────────────────────────────
function loadCache() {
  const p = path.join(__dirname, 'pokemon_cache.json');
  if (!fs.existsSync(p)) {
    console.error(`Pokemon cache not found at ${p}`);
    console.error('Run: node build_cache.js');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// ─── Extract flat features from a decision for ML training ───────────────────
function extractFeatures(decision, gameState) {
  const ALL_TYPES = ['Normal','Fire','Water','Electric','Grass','Ice',
    'Fighting','Poison','Ground','Flying','Psychic','Bug','Rock',
    'Ghost','Dragon','Dark','Steel'];

  const teamTypeCoverage = new Set((gameState?.team || []).flatMap(p => p.types || []));
  const avgHpRatio = gameState?.team?.length
    ? gameState.team.reduce((s, p) => {
        const [cur, max] = (p.hp || '1/1').split('/').map(Number);
        return s + (max > 0 ? cur / max : 0);
      }, 0) / gameState.team.length
    : 1;

  const base = {
    map:          gameState?.currentMap ?? 0,
    badges:       gameState?.badges ?? 0,
    teamSize:     gameState?.team?.length ?? 0,
    avgHpRatio:   Math.round(avgHpRatio * 100) / 100,
    avgBST:       gameState?.team?.length
      ? Math.round(gameState.team.reduce((s, p) => s + (p.bst || 0), 0) / gameState.team.length)
      : 0,
    itemCount:    gameState?.bagItems?.length ?? 0,
    teamWithItems: (gameState?.team || []).filter(p => p.item).length,
    typesCovered: teamTypeCoverage.size,
    // Type presence flags
    ...Object.fromEntries(ALL_TYPES.map(t => [`has${t}`, teamTypeCoverage.has(t) ? 1 : 0])),
  };

  // Decision-specific features
  const specific = {};
  switch (decision.type) {
    case 'starter':
      specific.starterBST = decision.options?.[decision.choice]?.baseStats
        ? Object.values(decision.options[decision.choice].baseStats).reduce((a, b) => a + b, 0)
        : 0;
      specific.starterType = decision.options?.[decision.choice]?.types?.[0] || 'Unknown';
      break;

    case 'branch':
      specific.chosenNodeType = decision.options?.[decision.choice]?.type || 'unknown';
      break;

    case 'catch':
      specific.skipped = decision.choice === (decision.options?.length || 3) ? 1 : 0;
      specific.catchedBST = !specific.skipped && decision.options?.[decision.choice]?.baseStats
        ? Object.values(decision.options[decision.choice].baseStats).reduce((a, b) => a + b, 0)
        : 0;
      specific.catchedType = !specific.skipped && decision.options?.[decision.choice]?.types?.[0] || 'none';
      specific.isNewType = !specific.skipped && decision.options?.[decision.choice]?.types
        ? decision.options[decision.choice].types.some(t => !teamTypeCoverage.has(t)) ? 1 : 0
        : 0;
      break;

    case 'item':
      specific.skipped = decision.choice === (decision.options?.length || 3) ? 1 : 0;
      specific.itemName = !specific.skipped && decision.options?.[decision.choice]?.id || 'skip';
      break;
  }

  return { ...base, ...specific, decisionType: decision.type };
}

// ─── Play one game ─────────────────────────────────────────────────────────────
async function playGame(runner, agent, seed, verbose, opts = {}) {
  const startMs = Date.now();

  const result = await runner.play(seed, async (decision) => {
    const { choice, reason } = await agent.decide(decision);
    // Attach features to each decision for ML training
    decision._features = extractFeatures(decision, decision.state);
    decision._reason   = reason;
    return choice;
  }, { nuzlocke: opts.nuzlocke || false });

  const elapsed = Date.now() - startMs;

  if (verbose) {
    const icon = result.outcome === 'win' ? '🏆' : result.outcome === 'loss' ? '💀' : '❌';
    const s = result.stats || {};
    console.log(
      `${icon} Seed ${seed}: ${result.outcome.padEnd(5)} | ` +
      `Maps: ${result.mapsCleared}/9 | ` +
      `Battles: ${s.battlesTotal ?? '?'} | ` +
      `Caught: ${s.pokemonCaught ?? '?'} | ` +
      `Fainted: ${s.pokemonFainted ?? '?'} | ` +
      `Items: ${s.itemsTaken ?? '?'} | ` +
      `Healed: ${s.timesCured ?? '?'} | ` +
      `Team: ${(result.finalTeam || []).map(p => `${p.name} Lv${p.level}`).join(', ')} | ` +
      `${elapsed}ms`
    );
  }

  return {
    seed,
    outcome:       result.outcome,
    mapsCleared:   result.mapsCleared,
    eliteDefeated: result.eliteDefeated,
    finalTeam:     result.finalTeam,
    stats:         result.stats || {},
    decisions:     (result.decisions || []).map(d => ({
      type:     d.type,
      choice:   d.choice,
      features: d._features,
      reason:   d._reason,
    })),
    elapsedMs:    elapsed,
    apiCalls:     agent.callCount,
    timestamp:    new Date().toISOString(),
  };
}

// ─── Agent factory ────────────────────────────────────────────────────────────
function makeAgent(opts) {
  if (opts.provider === 'random') return new RandomAgent();

  // LLM providers
  if (opts.provider === 'anthropic' || opts.provider === 'claude') {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY environment variable is required for provider=anthropic');
      process.exit(1);
    }
  }
  const agentOpts = {
    provider: opts.provider,
    ...(opts.model   && { model:   opts.model   }),
    ...(opts.baseUrl && { baseUrl: opts.baseUrl }),
    ...(opts.rules?.length  && { rules:  opts.rules  }),
    ...(opts._memory        && { memory: opts._memory }),
  };
  return new LLMAgent(agentOpts);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs();

  console.log(`Loading Pokemon cache...`);
  const cache  = loadCache();
  console.log(`Cache loaded: ${Object.keys(cache).length} species`);

  // ── Memory ──────────────────────────────────────────────────────────────────
  if (opts.memory) LLMAgent.initMemoryFile(opts.memory);
  const memoryContent = LLMAgent.loadMemory(opts.memory, opts.memorySize);
  // Attach loaded memory to opts so makeAgent can inject it into the system prompt
  opts._memory = memoryContent;

  const runner   = new GameRunner(cache);
  const template = makeAgent(opts);   // used only for label; each game gets its own instance
  // Dedicated agent for memory writes (reused across games, no per-game callCount needed)
  const memoryWriter = (opts.memory && opts.provider !== 'random') ? makeAgent(opts) : null;

  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  const outStream = fs.createWriteStream(opts.out, { flags: 'a' });

  console.log(`Running ${opts.games} games (seed ${opts.seed} → ${opts.seed + opts.games - 1})`);
  console.log(`Provider: ${template.label}${opts.nuzlocke ? ' | Mode: NUZLOCKE' : ''}`);
  console.log(`Output: ${opts.out}`);
  if (opts.memory) {
    const raw          = fs.existsSync(opts.memory) ? fs.readFileSync(opts.memory, 'utf8') : '';
    const totalEntries = (raw.match(/^## Run /mg) || []).length;
    const loadedCount  = Math.min(totalEntries, opts.memorySize);
    console.log(`Memory: ${opts.memory} (${loadedCount}/${totalEntries} entries loaded, max ${opts.memorySize})`);
  }
  if (opts.rules?.length) {
    console.log(`Rules (${opts.rules.length}):`);
    for (const r of opts.rules) console.log(`  • ${r}`);
  }
  console.log();

  let wins = 0, losses = 0, errors = 0;
  const statTotals = { battlesTotal: 0, pokemonCaught: 0, pokemonFainted: 0,
                       itemsTaken: 0, movesLearned: 0, timesCured: 0, battleRounds: 0,
                       permadeaths: 0 };
  const startAll = Date.now();

  if (opts.parallel <= 1) {
    // Sequential
    for (let i = 0; i < opts.games; i++) {
      const seed = opts.seed + i;
      const result = await playGame(runner, makeAgent(opts), seed, true, opts);
      outStream.write(JSON.stringify(result) + '\n');
      if (result.outcome === 'win')   wins++;
      else if (result.outcome === 'loss') losses++;
      else errors++;
      for (const k of Object.keys(statTotals)) statTotals[k] += result.stats?.[k] ?? 0;

      if (memoryWriter) {
        await memoryWriter.appendMemory(result, opts.memory, opts.memorySize)
          .catch(e => console.warn(`  [memory] write failed: ${e.message}`));
      }

      // Progress every 10 games
      if ((i + 1) % 10 === 0 || i === opts.games - 1) {
        const done = i + 1;
        const elapsed = ((Date.now() - startAll) / 1000).toFixed(1);
        const avg = k => (statTotals[k] / done).toFixed(1);
        console.log(`\n--- Progress: ${done}/${opts.games} | ` +
          `Wins: ${wins} (${(100 * wins / done).toFixed(1)}%) | ` +
          `Losses: ${losses} | Errors: ${errors} | ${elapsed}s elapsed`);
        console.log(`    Avg/game: battles=${avg('battlesTotal')} rounds=${avg('battleRounds')} ` +
          `caught=${avg('pokemonCaught')} fainted=${avg('pokemonFainted')} ` +
          `items=${avg('itemsTaken')} tutor=${avg('movesLearned')} ` +
          `healed=${avg('timesCured')} ---\n`);
      }
    }
  } else {
    // Parallel batches
    const BATCH = opts.parallel;
    for (let i = 0; i < opts.games; i += BATCH) {
      const batch = Array.from(
        { length: Math.min(BATCH, opts.games - i) },
        (_, j) => opts.seed + i + j
      );

      const results = await Promise.all(
        batch.map(seed => playGame(runner, makeAgent(opts), seed, opts.verbose, opts))
      );

      for (const r of results) {
        outStream.write(JSON.stringify(r) + '\n');
        if (r.outcome === 'win')   { wins++;   if (!opts.verbose) process.stdout.write('W'); }
        else if (r.outcome === 'loss') { losses++; if (!opts.verbose) process.stdout.write('L'); }
        else                       { errors++; if (!opts.verbose) process.stdout.write('E'); }
        for (const k of Object.keys(statTotals)) statTotals[k] += r.stats?.[k] ?? 0;
      }
      // Memory writes are sequential to avoid concurrent file appends
      if (memoryWriter) {
        for (const r of results) {
          await memoryWriter.appendMemory(r, opts.memory, opts.memorySize)
            .catch(e => console.warn(`  [memory] write failed: ${e.message}`));
        }
      }

      if (!opts.verbose && (i + BATCH) % 50 === 0) {
        const done = Math.min(i + BATCH, opts.games);
        const elapsed = ((Date.now() - startAll) / 1000).toFixed(1);
        console.log(`\n[${done}/${opts.games}] Wins: ${wins} (${(100 * wins / done).toFixed(1)}%) | ${elapsed}s`);
      }
    }
  }

  outStream.end();
  const totalSec = ((Date.now() - startAll) / 1000).toFixed(1);

  const n = opts.games;
  const avg = k => (statTotals[k] / n).toFixed(1);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`COMPLETE: ${n} games in ${totalSec}s`);
  console.log(`  Wins:   ${wins}  (${(100 * wins  / n).toFixed(1)}%)`);
  console.log(`  Losses: ${losses}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Output: ${opts.out}`);
  console.log(`\n  Averages per game:`);
  console.log(`    Battles fought : ${avg('battlesTotal')}  (${avg('battleRounds')} rounds)`);
  console.log(`    Pokemon caught : ${avg('pokemonCaught')}`);
  console.log(`    Pokemon fainted: ${avg('pokemonFainted')}` +
    (opts.nuzlocke ? `  (permadeaths: ${avg('permadeaths')})` : ''));
  console.log(`    Items taken    : ${avg('itemsTaken')}`);
  console.log(`    Moves learned  : ${avg('movesLearned')}`);
  console.log(`    Times healed   : ${avg('timesCured')}`);
  console.log(`${'='.repeat(60)}`);
}

main().catch(err => { console.error(err); process.exit(1); });
