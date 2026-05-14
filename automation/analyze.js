#!/usr/bin/env node
'use strict';
/**
 * analyze.js
 *
 * Reads a JSONL results file produced by run_games.js and prints a strategy
 * report: win rates by decision type, most/least successful choices, type
 * coverage patterns, and more.
 *
 * Usage:
 *   node analyze.js [--in results/games.jsonl] [--top 10] [--json]
 */

const fs   = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const get  = (flag, def) => { const i = args.indexOf(flag); return i !== -1 && args[i+1] ? args[i+1] : def; };
  return {
    input:   get('--in',  path.join(__dirname, 'results', 'games.jsonl')),
    top:     parseInt(get('--top', '10'), 10),
    json:    args.includes('--json'),
  };
}

// ─── Load JSONL ───────────────────────────────────────────────────────────────
function loadGames(file) {
  if (!fs.existsSync(file)) {
    console.error(`Results file not found: ${file}`);
    process.exit(1);
  }
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

// ─── Aggregate helpers ────────────────────────────────────────────────────────
function winRate(games) {
  if (!games.length) return 0;
  return games.filter(g => g.outcome === 'win').length / games.length;
}

function groupBy(arr, keyFn) {
  const map = {};
  for (const item of arr) {
    const k = keyFn(item);
    (map[k] ??= []).push(item);
  }
  return map;
}

// Collect all decisions of a given type across all games, annotated with outcome
function collectDecisions(games, type) {
  const results = [];
  for (const g of games) {
    for (const d of (g.decisions || [])) {
      if (d.type === type) {
        results.push({ ...d, outcome: g.outcome, seed: g.seed });
      }
    }
  }
  return results;
}

// ─── Analysis functions ───────────────────────────────────────────────────────
function analyzeStarters(games, topN) {
  const decisions = collectDecisions(games, 'starter');
  const byType    = groupBy(decisions, d => d.features?.starterType || 'unknown');
  return Object.entries(byType)
    .map(([type, ds]) => ({
      starterType: type,
      games: ds.length,
      winRate: winRate(ds.map(d => ({ outcome: d.outcome }))),
    }))
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, topN);
}

function analyzeBranches(games, topN) {
  const decisions = collectDecisions(games, 'branch');
  const byMap     = groupBy(decisions, d => `map${d.features?.map ?? 0}`);
  const results   = [];
  for (const [map, ds] of Object.entries(byMap)) {
    const byNodeType = groupBy(ds, d => d.features?.chosenNodeType || 'unknown');
    for (const [nodeType, nds] of Object.entries(byNodeType)) {
      results.push({
        map, nodeType,
        chosen: nds.length,
        winRate: winRate(nds.map(d => ({ outcome: d.outcome }))),
      });
    }
  }
  return results.sort((a, b) => b.winRate - a.winRate).slice(0, topN);
}

function analyzeCatches(games, topN) {
  const decisions = collectDecisions(games, 'catch');
  const skips     = decisions.filter(d => d.features?.skipped === 1);
  const catches   = decisions.filter(d => d.features?.skipped !== 1);

  // By type caught
  const byType = groupBy(catches, d => d.features?.catchedType || 'unknown');
  const byTypeStats = Object.entries(byType)
    .map(([t, ds]) => ({
      type: t,
      times: ds.length,
      winRate: winRate(ds.map(d => ({ outcome: d.outcome }))),
      avgBST: Math.round(ds.reduce((s, d) => s + (d.features?.catchedBST || 0), 0) / ds.length),
    }))
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, topN);

  // Skip vs catch
  const skipWR   = winRate(skips.map(d => ({ outcome: d.outcome })));
  const catchWR  = winRate(catches.map(d => ({ outcome: d.outcome })));
  const newTypeWR = winRate(catches.filter(d => d.features?.isNewType === 1).map(d => ({ outcome: d.outcome })));

  return { byType: byTypeStats, skipWinRate: skipWR, catchWinRate: catchWR, newTypeWinRate: newTypeWR };
}

function analyzeItems(games, topN) {
  const decisions = collectDecisions(games, 'item');
  const byItem = groupBy(
    decisions.filter(d => d.features?.skipped !== 1),
    d => d.features?.itemName || 'unknown'
  );
  return Object.entries(byItem)
    .map(([item, ds]) => ({
      item,
      times: ds.length,
      winRate: winRate(ds.map(d => ({ outcome: d.outcome }))),
    }))
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, topN);
}

function analyzeTeamComposition(games, topN) {
  // Look at final teams of won games vs lost games
  const won  = games.filter(g => g.outcome === 'win');
  const lost = games.filter(g => g.outcome === 'loss');

  function avgTeamSize(gs) {
    return gs.length ? gs.reduce((s, g) => s + (g.finalTeam?.length || 0), 0) / gs.length : 0;
  }
  function avgBST(gs) {
    return gs.length
      ? gs.reduce((s, g) => {
          const team = g.finalTeam || [];
          return s + (team.length ? team.reduce((ss, p) => ss + (p.bst || 0), 0) / team.length : 0);
        }, 0) / gs.length
      : 0;
  }
  function typeFreq(gs) {
    const cnt = {};
    for (const g of gs) {
      for (const p of (g.finalTeam || [])) {
        for (const t of (p.types || [])) cnt[t] = (cnt[t] || 0) + 1;
      }
    }
    const total = Object.values(cnt).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(cnt).map(([t, c]) => ({ type: t, freq: c / total }))
      .sort((a, b) => b.freq - a.freq).slice(0, topN);
  }

  return {
    won:  { count: won.length,  avgTeamSize: avgTeamSize(won).toFixed(2),  avgBST: avgBST(won).toFixed(0),  topTypes: typeFreq(won) },
    lost: { count: lost.length, avgTeamSize: avgTeamSize(lost).toFixed(2), avgBST: avgBST(lost).toFixed(0), topTypes: typeFreq(lost) },
  };
}

function analyzeMapsCleared(games) {
  const groups = groupBy(games, g => g.mapsCleared ?? 0);
  return Object.entries(groups)
    .map(([maps, gs]) => ({ mapsCleared: Number(maps), count: gs.length, pct: (100 * gs.length / games.length).toFixed(1) }))
    .sort((a, b) => a.mapsCleared - b.mapsCleared);
}

// ─── Print report ─────────────────────────────────────────────────────────────
function printReport(games, opts) {
  const total   = games.length;
  const wins    = games.filter(g => g.outcome === 'win').length;
  const losses  = games.filter(g => g.outcome === 'loss').length;
  const errors  = games.filter(g => g.outcome === 'error').length;

  const hr = '─'.repeat(60);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`POKELIKE STRATEGY ANALYSIS  (${total} games)`);
  console.log('═'.repeat(60));
  console.log(`Win rate: ${(100 * wins / total).toFixed(1)}%  (${wins}W / ${losses}L / ${errors}E)\n`);

  // Maps cleared distribution
  const mapDist = analyzeMapsCleared(games);
  console.log(`${hr}\nMAPS CLEARED DISTRIBUTION`);
  console.log(`${'Maps'.padEnd(8)} ${'Count'.padEnd(8)} ${'%'}`);
  for (const row of mapDist) {
    const label = row.mapsCleared === 9 ? '9 (WIN)' : String(row.mapsCleared);
    console.log(`${label.padEnd(8)} ${String(row.count).padEnd(8)} ${row.pct}%`);
  }

  // Starter analysis
  const starters = analyzeStarters(games, opts.top);
  console.log(`\n${hr}\nSTARTER WIN RATES`);
  console.log(`${'Type'.padEnd(12)} ${'Games'.padEnd(8)} ${'WinRate'}`);
  for (const s of starters) {
    console.log(`${s.starterType.padEnd(12)} ${String(s.games).padEnd(8)} ${(100 * s.winRate).toFixed(1)}%`);
  }

  // Branch choices
  const branches = analyzeBranches(games, opts.top);
  console.log(`\n${hr}\nBEST BRANCH CHOICES (by win rate)`);
  console.log(`${'Map'.padEnd(6)} ${'NodeType'.padEnd(14)} ${'Chosen'.padEnd(8)} ${'WinRate'}`);
  for (const b of branches) {
    console.log(`${b.map.padEnd(6)} ${b.nodeType.padEnd(14)} ${String(b.chosen).padEnd(8)} ${(100 * b.winRate).toFixed(1)}%`);
  }

  // Catch analysis
  const catchStats = analyzeCatches(games, opts.top);
  console.log(`\n${hr}\nCATCH DECISIONS`);
  console.log(`Skip win rate:      ${(100 * catchStats.skipWinRate).toFixed(1)}%`);
  console.log(`Catch win rate:     ${(100 * catchStats.catchWinRate).toFixed(1)}%`);
  console.log(`Catch new type WR:  ${(100 * catchStats.newTypeWinRate).toFixed(1)}%`);
  console.log(`\nBest types to catch:`);
  console.log(`${'Type'.padEnd(12)} ${'Times'.padEnd(8)} ${'AvgBST'.padEnd(10)} ${'WinRate'}`);
  for (const t of catchStats.byType) {
    console.log(`${t.type.padEnd(12)} ${String(t.times).padEnd(8)} ${String(t.avgBST).padEnd(10)} ${(100 * t.winRate).toFixed(1)}%`);
  }

  // Item analysis
  const items = analyzeItems(games, opts.top);
  console.log(`\n${hr}\nBEST ITEMS TO TAKE`);
  console.log(`${'Item'.padEnd(20)} ${'Times'.padEnd(8)} ${'WinRate'}`);
  for (const it of items) {
    console.log(`${it.item.padEnd(20)} ${String(it.times).padEnd(8)} ${(100 * it.winRate).toFixed(1)}%`);
  }

  // Team composition comparison
  const teamComp = analyzeTeamComposition(games, 8);
  console.log(`\n${hr}\nTEAM COMPOSITION COMPARISON`);
  console.log(`${'Metric'.padEnd(20)} ${'WON'.padEnd(16)} ${'LOST'}`);
  console.log(`${'Avg team size'.padEnd(20)} ${teamComp.won.avgTeamSize.padEnd(16)} ${teamComp.lost.avgTeamSize}`);
  console.log(`${'Avg BST'.padEnd(20)} ${teamComp.won.avgBST.padEnd(16)} ${teamComp.lost.avgBST}`);
  console.log(`\nTop types in WINNING teams:`);
  for (const t of teamComp.won.topTypes.slice(0, 6)) {
    console.log(`  ${t.type.padEnd(12)} ${(100 * t.freq).toFixed(1)}%`);
  }
  console.log(`Top types in LOSING teams:`);
  for (const t of teamComp.lost.topTypes.slice(0, 6)) {
    console.log(`  ${t.type.padEnd(12)} ${(100 * t.freq).toFixed(1)}%`);
  }

  console.log(`\n${'═'.repeat(60)}\n`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
  const opts  = parseArgs();
  const games = loadGames(opts.input);

  if (!games.length) {
    console.log('No games found in results file.');
    return;
  }

  if (opts.json) {
    const out = {
      total: games.length,
      winRate: winRate(games),
      starters: analyzeStarters(games, opts.top),
      branches: analyzeBranches(games, opts.top),
      catches:  analyzeCatches(games, opts.top),
      items:    analyzeItems(games, opts.top),
      teamComp: analyzeTeamComposition(games, 8),
      mapsCleared: analyzeMapsCleared(games),
    };
    console.log(JSON.stringify(out, null, 2));
  } else {
    printReport(games, opts);
  }
}

main();
