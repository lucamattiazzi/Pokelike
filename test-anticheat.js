#!/usr/bin/env node
// test-anticheat.js — end-to-end tests for the anti-cheat verification server.
//
// Usage:
//   node test-anticheat.js [server-url] [test-secret]
//
// The test secret is sent as X-AC-Test: <secret> on every request.
// The server should check this header and skip timing gates when it matches,
// so the test suite can run instantly without artificial delays.
// Guard it behind an env var on the server so it only works in dev/staging.
//
// Example:
//   node test-anticheat.js https://ac.pokelike.xyz mysecret

const SERVER      = process.argv[2] || 'https://ac.pokelike.xyz';
const TEST_SECRET = process.argv[3] || '';
const TEST_UUID   = 'test-uuid-' + Math.random().toString(36).slice(2);

let passed = 0;
let failed = 0;

function headers(uuid = TEST_UUID) {
  const h = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + uuid };
  if (TEST_SECRET) h['X-AC-Test'] = TEST_SECRET;
  return h;
}

// Real Charizard stats with maxed statBuffs (10 per stat) and best move tier.
// statBuffs are applied on top of baseStats server-side — this is the legitimate
// way to have a strong team without inflating baseStats past real Pokédex values.
const SAMPLE_TEAM = [
  { speciesId: 6, name: 'Charizard', level: 100, types: ['Fire', 'Flying'],
    baseStats: { hp: 78, atk: 84, def: 78, speed: 100, special: 109, spdef: 85 },
    heldItem: null, currentHp: 9999, maxHp: 9999,
    statBuffs: { hp: 10, atk: 10, def: 10, speed: 10, special: 10, spdef: 10 },
    moveTier: 2, isShiny: false },
];

async function req(method, path, body, uuid) {
  const opts = { method, headers: headers(uuid) };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(SERVER + path, opts);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, ok: res.ok, json, text };
}

function pass(name) { console.log(`  ✓  ${name}`); passed++; }
function fail(name, detail) {
  console.log(`  ✗  ${name}`);
  if (detail) console.log(`       ${detail}`);
  failed++;
}
function check(name, condition, detail) { condition ? pass(name) : fail(name, detail); }

async function startRun(seed, uuid) {
  const r = await req('POST', '/run/start', { seed, mode: 'normal' }, uuid);
  return r.json?.runToken || null;
}

async function allCheckpoints(runToken, seed, team, uuid) {
  const checkpoints = [];
  for (let i = 0; i < 8; i++) {
    const r = await req('POST', '/run/checkpoint', {
      runToken, prevCheckpoints: checkpoints.slice(), gymIdx: i,
      rngSeedAtStart: (seed + i) >>> 0, playerTeam: team,
    }, uuid);
    if (!r.json?.checkpointToken) return { ok: false, error: r.json?.error, gymIdx: i, checkpoints };
    checkpoints.push(r.json.checkpointToken);
  }
  return { ok: true, checkpoints };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

async function testStartRun() {
  console.log('\n[1] POST /run/start');

  const seed = (Date.now() ^ (Math.random() * 0x100000000 | 0)) >>> 0;

  const r = await req('POST', '/run/start', { seed, mode: 'normal' });
  check('returns 200', r.status === 200, `got ${r.status}`);
  check('returns runToken string', typeof r.json?.runToken === 'string' && r.json.runToken.length > 0,
        `got: ${JSON.stringify(r.json)}`);

  const r2 = await req('POST', '/run/start', { mode: 'normal' });
  check('rejects missing seed (4xx)', r2.status >= 400 && r2.status < 500, `got ${r2.status}`);

  const r3 = await req('POST', '/run/start', { seed, mode: 'hacked' });
  check('rejects invalid mode (4xx)', r3.status >= 400 && r3.status < 500, `got ${r3.status}`);

  return { seed, runToken: r.json?.runToken };
}

async function testCheckpoint(runToken, seed) {
  console.log('\n[2] POST /run/checkpoint');

  const checkpoints = [];
  for (let i = 0; i < 8; i++) {
    const r = await req('POST', '/run/checkpoint', {
      runToken, prevCheckpoints: checkpoints.slice(), gymIdx: i,
      rngSeedAtStart: (seed + i) >>> 0, playerTeam: SAMPLE_TEAM,
    });
    if (i === 0) {
      check('gym 0 returns 200', r.status === 200, `got ${r.status}: ${r.text}`);
      check('gym 0 returns checkpointToken string', typeof r.json?.checkpointToken === 'string',
            `got: ${JSON.stringify(r.json)}`);
    }
    if (i === 1) {
      check('chains correctly from previous checkpoint', r.status === 200, `got ${r.status}: ${r.text}`);
    }
    if (!r.json?.checkpointToken) break;
    checkpoints.push(r.json.checkpointToken);
  }
  check('all 8 checkpoints accepted', checkpoints.length === 8, `only got ${checkpoints.length}`);

  const rBad = await req('POST', '/run/checkpoint', {
    runToken: 'invalid-token', prevCheckpoints: [], gymIdx: 0,
    rngSeedAtStart: seed >>> 0, playerTeam: SAMPLE_TEAM,
  });
  check('rejects bad runToken (4xx)', rBad.status >= 400 && rBad.status < 500, `got ${rBad.status}`);

  const rOob = await req('POST', '/run/checkpoint', {
    runToken, prevCheckpoints: checkpoints.slice(), gymIdx: 99,
    rngSeedAtStart: seed >>> 0, playerTeam: SAMPLE_TEAM,
  });
  check('rejects gymIdx out of range (4xx)', rOob.status >= 400 && rOob.status < 500, `got ${rOob.status}`);

  return checkpoints;
}

async function testCompleteRun(runToken, checkpoints, seed) {
  console.log('\n[3] POST /run/complete');

  const summary = {
    nuzlockeMode: false, usedPokecenter: false, pickedUpItem: false,
    maxTeamSize: 1, starterSpeciesId: 4,
    championRngSeed: (seed + 99) >>> 0, finalTeam: SAMPLE_TEAM,
  };

  const r = await req('POST', '/run/complete', { runToken, checkpoints, summary });
  check('returns 200', r.status === 200, `got ${r.status}: ${r.text}`);
  check('returns verified field', typeof r.json?.verified === 'boolean',
        `got: ${JSON.stringify(r.json)}`);

  const r2 = await req('POST', '/run/complete', { runToken: 'bogus', checkpoints, summary });
  check('rejects bad runToken (4xx)', r2.status >= 400 && r2.status < 500, `got ${r2.status}`);

  const r3 = await req('POST', '/run/complete', { runToken, checkpoints, summary });
  check('rejects replayed runToken (4xx)', r3.status >= 400 && r3.status < 500, `got ${r3.status}`);
}

async function testGetRecords() {
  console.log('\n[4] GET /player/records');

  const r = await req('GET', '/player/records');
  check('returns 200', r.status === 200, `got ${r.status}`);
  check('returns an object', r.json !== null && typeof r.json === 'object',
        `got: ${r.text.slice(0, 80)}`);

  const res = await fetch(SERVER + '/player/records', { headers: { 'Content-Type': 'application/json' } });
  check('works without auth (anonymous or 401)', res.status === 200 || res.status === 401,
        `got ${res.status}`);
}

async function testGracefulDegradation() {
  console.log('\n[5] Graceful degradation (unreachable server)');

  async function silentFetch(url, opts) {
    try { return await fetch(url, opts); } catch { return null; }
  }

  const r = await silentFetch('https://ac.pokelike.xyz.invalid/run/start', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seed: 12345, mode: 'normal' }),
  });
  check('network failure returns null (not a throw)', r === null, `got: ${r}`);
}

async function testSpoofAttacks() {
  const seed = (Date.now() ^ (Math.random() * 0x100000000 | 0)) >>> 0;

  // ── 6. Stat inflation ───────────────────────────────────────────────────────
  console.log('\n[6] Spoof: stat inflation');
  // Real Charizard with atk/def/speed/special all set to 9999.
  // Server should reject because submitted stats don't match the Pokédex.
  const inflatedTeam = [{
    speciesId: 6, name: 'Charizard', level: 100, types: ['Fire', 'Flying'],
    baseStats: { hp: 78, atk: 9999, def: 9999, speed: 9999, special: 9999, spdef: 9999 },
    heldItem: null, currentHp: 9999, maxHp: 9999, statBuffs: {}, moveTier: 2, isShiny: false,
  }];
  const tInflate = await startRun(seed);
  const rInflate = await req('POST', '/run/checkpoint', {
    runToken: tInflate, prevCheckpoints: [], gymIdx: 0,
    rngSeedAtStart: seed >>> 0, playerTeam: inflatedTeam,
  });
  check('rejects inflated baseStats (4xx)', rInflate.status >= 400 && rInflate.status < 500,
        `got ${rInflate.status} — server accepted atk:9999 on Charizard`);

  // Also test a non-existent speciesId
  const fakeSpeciesTeam = [{
    speciesId: 99999, name: 'HackMon', level: 100, types: ['Normal'],
    baseStats: { hp: 255, atk: 255, def: 255, speed: 255, special: 255, spdef: 255 },
    heldItem: null, currentHp: 9999, maxHp: 9999, statBuffs: {}, moveTier: 2, isShiny: false,
  }];
  const tFake = await startRun((seed + 100) >>> 0);
  const rFake = await req('POST', '/run/checkpoint', {
    runToken: tFake, prevCheckpoints: [], gymIdx: 0,
    rngSeedAtStart: seed >>> 0, playerTeam: fakeSpeciesTeam,
  });
  check('rejects non-existent speciesId (4xx)', rFake.status >= 400 && rFake.status < 500,
        `got ${rFake.status} — server accepted speciesId:99999`);

  // ── 7. Skipped gym index ────────────────────────────────────────────────────
  console.log('\n[7] Spoof: skipped gym index');
  const tSkip = await startRun((seed + 200) >>> 0);
  const cp0r = await req('POST', '/run/checkpoint', {
    runToken: tSkip, prevCheckpoints: [], gymIdx: 0,
    rngSeedAtStart: seed >>> 0, playerTeam: SAMPLE_TEAM,
  });
  const cp0 = cp0r.json?.checkpointToken;
  const cp1r = await req('POST', '/run/checkpoint', {
    runToken: tSkip, prevCheckpoints: [cp0].filter(Boolean), gymIdx: 1,
    rngSeedAtStart: (seed + 1) >>> 0, playerTeam: SAMPLE_TEAM,
  });
  const cp1 = cp1r.json?.checkpointToken;
  // Now skip gym 2 and try to submit gym 3
  const rSkip = await req('POST', '/run/checkpoint', {
    runToken: tSkip, prevCheckpoints: [cp0, cp1].filter(Boolean), gymIdx: 3,
    rngSeedAtStart: (seed + 3) >>> 0, playerTeam: SAMPLE_TEAM,
  });
  check('rejects skipped gymIdx (4xx)', rSkip.status >= 400 && rSkip.status < 500,
        `got ${rSkip.status} — server accepted gym 3 after gyms 0,1 (skipping 2)`);

  // ── 8. Cross-run checkpoint reuse ───────────────────────────────────────────
  console.log('\n[8] Spoof: cross-run checkpoint reuse');
  const seedA = (seed + 300) >>> 0;
  const seedB = (seed + 400) >>> 0;
  const tA = await startRun(seedA);
  const tB = await startRun(seedB);
  const cpA = await allCheckpoints(tA, seedA, SAMPLE_TEAM);
  const rReuse = await req('POST', '/run/complete', {
    runToken: tB,
    checkpoints: cpA.checkpoints,
    summary: { nuzlockeMode: false, usedPokecenter: false, pickedUpItem: false,
               maxTeamSize: 1, starterSpeciesId: 4,
               championRngSeed: (seedB + 99) >>> 0, finalTeam: SAMPLE_TEAM },
  });
  check('rejects cross-run checkpoint reuse (4xx)', rReuse.status >= 400 && rReuse.status < 500,
        `got ${rReuse.status} — run B accepted checkpoints from run A`);

  // ── 9. UUID swap: start as user A, complete as user B ──────────────────────
  console.log('\n[9] Spoof: UUID swap between start and complete');
  const uuidA = 'spoof-user-a';
  const uuidB = 'spoof-user-b';
  const seedC = (seed + 500) >>> 0;
  const tC = await startRun(seedC, uuidA);
  const cpC = await allCheckpoints(tC, seedC, SAMPLE_TEAM, uuidA);
  const rSwap = await req('POST', '/run/complete', {
    runToken: tC,
    checkpoints: cpC.checkpoints,
    summary: { nuzlockeMode: false, usedPokecenter: false, pickedUpItem: false,
               maxTeamSize: 1, starterSpeciesId: 4,
               championRngSeed: (seedC + 99) >>> 0, finalTeam: SAMPLE_TEAM },
  }, uuidB);
  check('rejects UUID swap on complete (4xx)', rSwap.status >= 400 && rSwap.status < 500,
        `got ${rSwap.status} — user B completed a run started by user A`);

  // ── 10. Bait-and-switch: weak team checkpoints, strong team on complete ─────
  console.log('\n[10] Spoof: bait-and-switch team on complete');
  const weakTeam = [{
    speciesId: 1, name: 'Bulbasaur', level: 5, types: ['Grass', 'Poison'],
    baseStats: { hp: 45, atk: 49, def: 49, speed: 45, special: 65, spdef: 65 },
    heldItem: null, currentHp: 20, maxHp: 20, statBuffs: {}, moveTier: 0, isShiny: false,
  }];
  const seedD = (seed + 600) >>> 0;
  const tD = await startRun(seedD);
  const cpD = await allCheckpoints(tD, seedD, weakTeam);
  // weak team loses the replay so checkpoints fail — that's expected
  check('weak team correctly fails checkpoint replay', !cpD.ok,
        'weak team checkpoints passed — battle replay may not be working');
  // If checkpoints somehow passed, verify complete also rejects the team switch
  if (cpD.ok) {
    const rSwitch = await req('POST', '/run/complete', {
      runToken: tD, checkpoints: cpD.checkpoints,
      summary: { nuzlockeMode: false, usedPokecenter: false, pickedUpItem: false,
                 maxTeamSize: 1, starterSpeciesId: 1,
                 championRngSeed: (seedD + 99) >>> 0, finalTeam: SAMPLE_TEAM },
    });
    check('rejects team swap on complete (4xx)', rSwitch.status >= 400 && rSwitch.status < 500,
          `got ${rSwitch.status}`);
  }
}

// ── Runner ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`Server:     ${SERVER}`);
  console.log(`Test UUID:  ${TEST_UUID}`);
  console.log(`Test mode:  ${TEST_SECRET ? 'X-AC-Test header set (timing gates should be skipped)' : 'no secret — timing-sensitive tests may fail'}`);

  try {
    const { seed, runToken } = await testStartRun();
    if (runToken) {
      const checkpoints = await testCheckpoint(runToken, seed);
      await testCompleteRun(runToken, checkpoints, seed);
    } else {
      console.log('\n  (skipping checkpoint/complete tests — no runToken)');
      failed += 5;
    }
    await testGetRecords();
    await testGracefulDegradation();
    await testSpoofAttacks();
  } catch (e) {
    console.error('\nUnexpected error:', e.message);
    failed++;
  }

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
