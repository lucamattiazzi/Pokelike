'use strict';
/**
 * game_runner.js
 *
 * Headless Node.js game simulation. Loads data.js, battle.js and map.js in a
 * vm sandbox (no browser/DOM needed) and reimplements the game loop, pausing
 * at every strategic decision point so an external agent can choose.
 *
 * Usage:
 *   const GameRunner = require('./game_runner');
 *   const runner = new GameRunner(pokemonCache);
 *   const result = await runner.play(seed, async (decision) => {
 *     // decision: { type, options, state }  →  return choice index
 *     return 0;
 *   });
 */

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const GAME_ROOT = path.join(__dirname, '..', 'js');

// ─── Minimal DOM stub used by map.js helper functions ────────────────────────
function makeDomStub() {
  const el = () => ({
    style: {}, className: '', innerHTML: '', textContent: '',
    appendChild() {}, addEventListener() {}, setAttribute() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    remove() {}, classList: { add() {}, remove() {}, contains() { return false; } },
  });
  return {
    getElementById() { return el(); },
    createElement() { return el(); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    body: { appendChild() {}, style: {} },
  };
}

// ─── Build the vm sandbox ─────────────────────────────────────────────────────
function buildSandbox(pokemonCache) {
  const storage = {};

  storage['pkrl_species_list'] = JSON.stringify(
    Object.values(pokemonCache).map(p => ({ name: p.name.toLowerCase(), id: p.id }))
  );
  for (const [id, poke] of Object.entries(pokemonCache)) {
    storage[`pkrl_poke_${poke.id}`] = JSON.stringify(poke);
  }

  const localStorage = {
    getItem:    k => storage[k] ?? null,
    setItem:    (k, v) => { storage[k] = v; },
    removeItem: k => { delete storage[k]; },
  };

  async function fetchMock(url) {
    const m = url.match(/\/pokemon\/([^/?]+)/);
    if (m) {
      const key = m[1];
      const entry = pokemonCache[key] || pokemonCache[parseInt(key)];
      if (entry) {
        return {
          ok: true,
          json: async () => ({
            id: entry.id,
            name: entry.name.toLowerCase(),
            types: entry.types.map(t => ({ type: { name: t.toLowerCase() } })),
            stats: [
              { stat: { name: 'hp' },               base_stat: entry.baseStats.hp },
              { stat: { name: 'attack' },            base_stat: entry.baseStats.atk },
              { stat: { name: 'defense' },           base_stat: entry.baseStats.def },
              { stat: { name: 'speed' },             base_stat: entry.baseStats.speed },
              { stat: { name: 'special-attack' },    base_stat: entry.baseStats.special },
              { stat: { name: 'special-defense' },   base_stat: entry.baseStats.spdef },
            ],
            sprites: { front_default: entry.spriteUrl, front_shiny: entry.shinySpriteUrl },
          }),
        };
      }
    }
    if (url.includes('/pokemon?limit=')) {
      return { ok: true, json: async () => ({ results: [] }) };
    }
    throw new Error(`[GameRunner] fetch not mocked for: ${url}`);
  }

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout,
    clearTimeout,
    Promise,
    Math,
    Array,
    Object,
    Set,
    Map,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Number,
    String,
    Boolean,
    Error,
    Symbol,
    undefined,

    localStorage,
    fetch: fetchMock,
    document: makeDomStub(),
    window:   {},
    requestAnimationFrame() {},
    Image: function() {},

    _rngSeed: 0,

    state: {
      currentMap: 0, currentNode: null, team: [], items: [], badges: 0,
      map: null, eliteIndex: 0, trainer: 'boy', starterSpeciesId: null,
      maxTeamSize: 1, nuzlockeMode: false, isEndlessMode: false,
      usedPokecenter: false,
    },

    endlessState: { stageNumber: 1, regionNumber: 1, mapIndexInRegion: 0 },

    markPokedexCaught()     {},
    markShinyDexCaught()    {},
    checkDexAchievements()  {},
    getPokedex()            { return {}; },
    getShinyDex()           { return {}; },
    getHallOfFame()         { return []; },
    hasShinyCharm()         { return false; },
    getUsedStarters()       { return []; },
    loadPersistentBuffs()   { return {}; },
    savePersistentBuffs()   {},
    loadBuffsIntoPokemon()  {},
    getEndlessMaxGenId()    { return 649; },
    getSettings()           { return {}; },
    unlockAchievement()     { return null; },
    showAchievementToast()  {},
    showMapNotification()   {},
    renderTeamBar()         {},
    renderItemBadges()      {},
    saveRun()               {},
    clearSavedRun()         {},
  };

  sandbox.window = sandbox;
  return sandbox;
}

// ─── Load game files into a shared vm context ─────────────────────────────────
function loadGameFiles(sandbox) {
  const ctx = vm.createContext(sandbox);

  // Inject RNG, helper functions, and game.js constants/functions that
  // data.js/battle.js/map.js reference, plus game.js logic injected here to
  // avoid loading the full game.js (which uses `let state` at module scope).
  const prelude = `
    function rng() {
      _rngSeed = (_rngSeed + 0x6D2B79F5) | 0;
      let t = Math.imul(_rngSeed ^ (_rngSeed >>> 15), 1 | _rngSeed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function seedRng(seed) { _rngSeed = seed >>> 0; }
    function getRngSeed()  { return _rngSeed >>> 0; }

    // From game.js — walks EVOLUTIONS/BRANCHING_EVOLUTIONS backwards to find base form.
    // Must be defined after data.js loads, so wrap in a late-binding function.
    function getEvoLineRoot(speciesId) {
      const parentOf = {};
      for (const [from, evo] of Object.entries(EVOLUTIONS)) {
        parentOf[evo.into] = Number(from);
      }
      for (const [fromId, choices] of Object.entries(BRANCHING_EVOLUTIONS)) {
        for (const evo of choices) parentOf[evo.into] = Number(fromId);
      }
      let id = speciesId;
      while (parentOf[id] !== undefined) id = parentOf[id];
      return id;
    }

    // From game.js — level scaled to node layer using the seeded RNG.
    function getLevelForNode(node) {
      const [minL, maxL] = MAP_LEVEL_RANGES[state.currentMap];
      const t      = Math.min(1, Math.max(0, (node.layer - 1) / 5));
      const base   = Math.round(minL + t * (maxL - minL));
      const spread = Math.max(1, Math.round((maxL - minL) / 8));
      return Math.min(maxL, Math.max(minL, base + Math.floor(rng() * spread)));
    }

    // From game.js — resolves a question-mark node type.
    function resolveQuestionMark() {
      const r = rng();
      if (r < 0.22) return 'battle';
      if (r < 0.42) return 'trainer';
      if (r < 0.52) return state.nuzlockeMode ? 'battle' : 'catch';
      if (r < 0.65) return 'item';
      if (r < 0.72) return 'shiny';
      return 'mega';
    }

    // From game.js — trainer type → name + species pool.
    const TRAINER_BATTLE_CONFIG = {
      bugCatcher:  { name: 'Bug Catcher',  pool: [10,11,12,13,14,15,46,47,48,49,123,127] },
      hiker:       { name: 'Hiker',        pool: [27,28,50,51,66,67,68,74,75,76,95,111,112] },
      fisher:      { name: 'Fisherman',    pool: [54,55,60,61,62,72,73,86,87,90,91,98,99,116,117,118,119,129,130] },
      Scientist:   { name: 'Scientist',    pool: [81,82,88,89,92,93,94,100,101,137] },
      teamRocket:  { name: 'Rocket Grunt', pool: [19,20,23,24,41,42,52,53,88,89,109,110] },
      policeman:   { name: 'Officer',      pool: [58,59] },
      fireSpitter: { name: 'Fire Trainer', pool: [4,5,6,37,38,58,59,77,78,126,136] },
      aceTrainer:  { name: 'Ace Trainer',  pool: null },
      oldGuy:      { name: 'Old Man',      pool: null },
    };
  `;
  vm.runInContext(prelude, ctx);

  for (const file of ['data.js', 'battle.js', 'map.js']) {
    const code = fs.readFileSync(path.join(GAME_ROOT, file), 'utf8');
    vm.runInContext(code, ctx);
  }

  return ctx;
}

// ─── GameRunner ───────────────────────────────────────────────────────────────

class GameRunner {
  constructor(pokemonCache) {
    this._cache = pokemonCache;
  }

  async play(seed, agentFn, { nuzlocke = false } = {}) {
    const sandbox = buildSandbox(this._cache);
    const ctx     = loadGameFiles(sandbox);

    const call = (name, ...args) => {
      sandbox.__args = args;
      return vm.runInContext(`${name}(...__args)`, ctx);
    };

    const get = expr => vm.runInContext(expr, ctx);

    const decisions = [];

    const decide = async (decision) => {
      const idx = await agentFn({ ...decision, state: this._stateSummary(sandbox) });
      decisions.push({ ...decision, choice: idx, state: undefined });
      return typeof idx === 'number' ? idx : 0;
    };

    try {
      vm.runInContext(`seedRng(${seed >>> 0})`, ctx);
      sandbox.state = {
        currentMap: 0, currentNode: null, team: [], items: [], badges: 0,
        map: null, eliteIndex: 0, trainer: 'boy', starterSpeciesId: null,
        maxTeamSize: 1, nuzlockeMode: nuzlocke, isEndlessMode: false,
        usedPokecenter: false, catchesThisMap: 0,
      };
      sandbox._stats = {
        nodesVisited:   0,
        battlesTotal:   0,
        battleRounds:   0,
        pokemonCaught:  0,
        pokemonFainted: 0,
        permadeaths:    0,
        itemsTaken:     0,
        movesLearned:   0,
        timesCured:     0,
        pokemonHistory: [],
      };

      // ── Starter selection ────────────────────────────────────────────────────
      const STARTER_IDS = [1, 4, 7];
      const starters = await Promise.all(
        STARTER_IDS.map(id => vm.runInContext(`fetchPokemonById(${id})`, ctx))
      );
      const starterIdx = await decide({ type: 'starter', options: starters });
      const starterSpecies = starters[starterIdx] || starters[0];
      const starter = call('createInstance', starterSpecies, 5, false, 0);

      sandbox._stats.pokemonHistory.push({
        name: starterSpecies.name, species: starterSpecies.id,
        level: 5, types: starterSpecies.types,
        bst: starterSpecies.baseStats ? Object.values(starterSpecies.baseStats).reduce((a, b) => a + b, 0) : 0,
        acquired: 'starter', acquiredMap: 0,
        released: false, releasedMap: null,
      });
      starter._histId = sandbox._stats.pokemonHistory.length - 1;

      sandbox.state.team             = [starter];
      sandbox.state.starterSpeciesId = starter.speciesId;
      sandbox.state.maxTeamSize      = 1;

      // ── Maps 0–7 ─────────────────────────────────────────────────────────────
      for (let mapIdx = 0; mapIdx < 8; mapIdx++) {
        sandbox.state.currentMap     = mapIdx;
        sandbox.state.catchesThisMap = 0;
        sandbox.state.map            = call('generateMap', mapIdx, nuzlocke);

        const mapResult = await this._playMap(ctx, sandbox, call, get, decide, mapIdx);
        if (!mapResult.won) {
          return {
            outcome: 'loss', mapsCleared: mapIdx, mode: nuzlocke ? 'nuzlocke' : 'normal',
            finalTeam: this._teamSummary(sandbox.state.team),
            stats: { ...sandbox._stats },
            decisions, seed,
          };
        }
        sandbox.state.badges++;
      }

      // ── Elite Four + Champion (map 8) ────────────────────────────────────────
      sandbox.state.currentMap = 8;
      const ELITE_4 = get('ELITE_4');
      for (let i = 0; i < ELITE_4.length; i++) {
        sandbox.state.eliteIndex = i;
        const boss = ELITE_4[i];
        const enemyTeam = boss.team.map(p => call('createInstance', p, p.level, false, 2));
        const battleResult = call(
          'runBattle',
          [...sandbox.state.team], enemyTeam, sandbox.state.items, [], null, null
        );
        sandbox._stats.battlesTotal++;
        this._applyBattleResult(sandbox, battleResult.pTeam, battleResult.playerParticipants,
          enemyTeam, battleResult.detailedLog);
        await this._checkEvolutions(ctx, sandbox, call, decide);
        if (nuzlocke) this._applyPermadeath(sandbox);
        if (!battleResult.playerWon || sandbox.state.team.length === 0) {
          return {
            outcome: 'loss', mapsCleared: 8, eliteDefeated: i,
            mode: nuzlocke ? 'nuzlocke' : 'normal',
            finalTeam: this._teamSummary(sandbox.state.team),
            stats: { ...sandbox._stats },
            decisions, seed,
          };
        }
      }

      return {
        outcome: 'win', mapsCleared: 9,
        mode: nuzlocke ? 'nuzlocke' : 'normal',
        finalTeam: this._teamSummary(sandbox.state.team),
        stats: { ...sandbox._stats },
        decisions, seed,
      };
    } catch (err) {
      return {
        outcome: 'error', error: err.message,
        mode: nuzlocke ? 'nuzlocke' : 'normal',
        finalTeam: this._teamSummary(sandbox.state.team),
        stats: sandbox._stats ? { ...sandbox._stats } : {},
        decisions, seed,
      };
    }
  }

  // ─── Navigate one map ───────────────────────────────────────────────────────
  async _playMap(ctx, sandbox, call, get, decide, mapIdx) {
    const map = sandbox.state.map;

    while (true) {
      const accessible = Object.values(map.nodes).filter(n => n.accessible && !n.visited);
      if (!accessible.length) break;

      let chosen;
      if (accessible.length === 1) {
        chosen = accessible[0];
      } else {
        const idx = await decide({ type: 'branch', options: accessible });
        chosen = accessible[idx] ?? accessible[0];
      }

      for (const n of Object.values(map.nodes)) {
        if (n.layer === chosen.layer && n.id !== chosen.id && n.accessible) {
          n.accessible = false;
        }
      }
      sandbox.state.currentNode = chosen;

      let resolvedType = chosen.type;
      if (resolvedType === 'question') {
        try { resolvedType = vm.runInContext('resolveQuestionMark()', ctx); }
        catch { resolvedType = this._resolveQuestion(sandbox); }
      }

      sandbox._stats.nodesVisited++;
      if (resolvedType === 'pokecenter') sandbox._stats.timesCured++;

      const nodeResult = await this._resolveNode(ctx, sandbox, call, get, decide, chosen, resolvedType, mapIdx);

      call('advanceFromNode', map, chosen.id);

      if (resolvedType === 'boss' && nodeResult && !nodeResult.won) return { won: false };
      if (resolvedType === 'boss' && nodeResult && nodeResult.won)  return { won: true };
    }

    return { won: false };
  }

  // ─── Resolve a single map node ─────────────────────────────────────────────
  async _resolveNode(ctx, sandbox, call, get, decide, node, type, mapIdx) {
    switch (type) {
      case 'start':
        return null;

      case 'pokecenter':
        for (const p of sandbox.state.team) p.currentHp = p.maxHp;
        sandbox.state.usedPokecenter = true;
        return null;

      case 'battle':
        return await this._doBattleNode(ctx, sandbox, call, get, decide, node);

      case 'trainer':
        return await this._doTrainerNode(ctx, sandbox, call, get, decide, node);

      case 'boss':
        return await this._doBossNode(ctx, sandbox, call, get, decide, mapIdx);

      case 'catch':
        return await this._doCatchNode(ctx, sandbox, call, get, decide, node, false);

      case 'shiny':
        return await this._doCatchNode(ctx, sandbox, call, get, decide, node, true);

      case 'item':
      case 'mega':
        return await this._doItemNode(ctx, sandbox, call, get, decide, node);

      case 'legendary':
        return await this._doLegendaryNode(ctx, sandbox, call, get, decide, node);

      case 'move_tutor':
        return await this._doMoveTutorNode(ctx, sandbox, call, decide, node);

      case 'trade':
        return await this._doTradeNode(ctx, sandbox, call, get, decide, node);

      default:
        return await this._doBattleNode(ctx, sandbox, call, get, decide, node);
    }
  }

  // ─── Wild battle ────────────────────────────────────────────────────────────
  async _doBattleNode(ctx, sandbox, call, get, decide, node) {
    // Mirror game.js doBattleNode: maps >= 1 fight one level below getLevelForNode
    const rawLevel = call('getLevelForNode', node);
    const level    = sandbox.state.currentMap >= 1 ? rawLevel - 1 : rawLevel;

    let choices = await call('getCatchChoices', sandbox.state.currentMap, 3, 151, true);
    if (!choices || !choices.length) return { won: true };

    const lvlFiltered = choices.filter(sp => call('minLevelForSpecies', sp.id ?? sp.speciesId) <= level);
    if (lvlFiltered.length > 0) choices = lvlFiltered;

    // Map 0 layer 1: exclude enemies super-effective against the starter
    if (sandbox.state.currentMap === 0 && node.layer === 1 && sandbox.state.team.length > 0) {
      const TYPE_CHART   = get('TYPE_CHART');
      const starterTypes = sandbox.state.team[0].types || [];
      const isSafe = sp => !(sp.types || []).some(et =>
        starterTypes.some(st => (TYPE_CHART[et]?.[st] || 1) >= 2)
      );
      const safe = choices.filter(isSafe);
      if (safe.length > 0) {
        choices = safe;
      } else {
        const eevee = await call('fetchPokemonById', 133);
        if (eevee) choices = [eevee];
      }
    }

    const rawSpecies = choices[Math.floor(call('rng') * choices.length)];
    if (!rawSpecies) return { won: true };

    const rawId = rawSpecies.id ?? rawSpecies.speciesId;
    const evoId = call('resolveEvoForLevel', rawId, level);
    const enemySpecies = evoId !== rawId ? (await call('fetchPokemonById', evoId) || rawSpecies) : rawSpecies;
    const enemy = call('createInstance', enemySpecies, level, false,
      get('getMoveТierForMap')(sandbox.state.currentMap));

    const battleResult = call(
      'runBattle',
      [...sandbox.state.team], [enemy], sandbox.state.items, [], null, null
    );
    sandbox._stats.battlesTotal++;
    this._applyBattleResult(sandbox, battleResult.pTeam, battleResult.playerParticipants,
      [enemy], battleResult.detailedLog);
    await this._checkEvolutions(ctx, sandbox, call, decide);
    if (sandbox.state.nuzlockeMode) this._applyPermadeath(sandbox);
    return { won: battleResult.playerWon && sandbox.state.team.length > 0 };
  }

  // ─── Trainer battle ─────────────────────────────────────────────────────────
  async _doTrainerNode(ctx, sandbox, call, get, decide, node) {
    const key    = node.trainerSprite || 'aceTrainer';
    const config = get(`TRAINER_BATTLE_CONFIG['${key}']`) ||
                   get(`TRAINER_BATTLE_CONFIG['aceTrainer']`);
    const teamSize = sandbox.state.currentMap === 0 ? 1
                   : sandbox.state.currentMap <= 2  ? 2 : 3;
    const level    = call('getLevelForNode', node);
    const moveTier = get('getMoveТierForMap')(sandbox.state.currentMap);

    let speciesList;
    if (config && config.pool) {
      const poolSet  = [...new Set(config.pool)];
      const eligible = poolSet.filter(id => call('minLevelForSpecies', id) <= level);
      const pool     = eligible.length ? eligible : poolSet;
      const shuffled = pool.slice().sort(() => call('rng') - 0.5);
      const ids      = Array.from(
        { length: teamSize },
        (_, i) => call('resolveEvoForLevel', shuffled[i % shuffled.length], level)
      );
      speciesList = (await Promise.all(ids.map(id => call('fetchPokemonById', id)))).filter(Boolean);
    } else {
      // aceTrainer / oldGuy: use getCatchChoices pool
      const rawChoices = await call('getCatchChoices', sandbox.state.currentMap, 3, 151, true);
      speciesList = (await Promise.all((rawChoices || []).slice(0, teamSize).map(async sp => {
        const rawId = sp.id ?? sp.speciesId;
        const evoId = call('resolveEvoForLevel', rawId, level);
        return evoId !== rawId ? (await call('fetchPokemonById', evoId) || sp) : sp;
      }))).filter(Boolean);
    }

    if (!speciesList.length) return { won: true };
    const enemyTeam = speciesList.map(sp => call('createInstance', sp, level, false, moveTier));

    const battleResult = call(
      'runBattle',
      [...sandbox.state.team], enemyTeam, sandbox.state.items, [], null, null
    );
    sandbox._stats.battlesTotal++;
    this._applyBattleResult(sandbox, battleResult.pTeam, battleResult.playerParticipants,
      enemyTeam, battleResult.detailedLog);
    await this._checkEvolutions(ctx, sandbox, call, decide);
    if (sandbox.state.nuzlockeMode) this._applyPermadeath(sandbox);
    return { won: battleResult.playerWon && sandbox.state.team.length > 0 };
  }

  // ─── Gym boss battle ────────────────────────────────────────────────────────
  async _doBossNode(ctx, sandbox, call, get, decide, mapIdx) {
    const GYM_LEADERS = get('GYM_LEADERS');
    const leader = GYM_LEADERS[mapIdx];
    if (!leader) return { won: true };

    const enemyTeam = leader.team.map(p => ({
      ...call('createInstance', p, p.level, false, leader.moveTier ?? 1),
      heldItem: p.heldItem || null,
    }));

    const battleResult = call(
      'runBattle',
      [...sandbox.state.team], enemyTeam, sandbox.state.items, [], null, null
    );
    sandbox._stats.battlesTotal++;
    this._applyBattleResult(sandbox, battleResult.pTeam, battleResult.playerParticipants,
      enemyTeam, battleResult.detailedLog);
    await this._checkEvolutions(ctx, sandbox, call, decide);
    if (sandbox.state.nuzlockeMode) this._applyPermadeath(sandbox);
    return { won: battleResult.playerWon && sandbox.state.team.length > 0 };
  }

  // ─── Catch node ─────────────────────────────────────────────────────────────
  async _doCatchNode(ctx, sandbox, call, get, decide, node, forceShiny) {
    let choices = await call('getCatchChoices', sandbox.state.currentMap, 18, 151, true);
    if (!choices || !choices.length) return null;

    // Map 0: floor level at 4
    const isFirstMap = sandbox.state.currentMap === 0;
    let level = call('getLevelForNode', node);
    if (isFirstMap) level = Math.max(4, level);

    // Level filter (pad below 3 to always offer 3 options)
    const lvlFiltered = choices.filter(sp => call('minLevelForSpecies', sp.id ?? sp.speciesId) <= level);
    if (lvlFiltered.length > 0) {
      choices = lvlFiltered.length < 3
        ? [...lvlFiltered, ...choices.filter(sp => !lvlFiltered.includes(sp))].slice(0, 3)
        : lvlFiltered;
    }

    // Nuzlocke map 0: curated 22-pokemon pool
    if (sandbox.state.nuzlockeMode && sandbox.state.currentMap === 0) {
      const nuzlockeIds = new Set([10,11,27,54,56,60,69,72,74,79,81,86,96,98,100,102,111,116,118,120,129,133]);
      const filtered = choices.filter(sp => nuzlockeIds.has(sp.id ?? sp.speciesId));
      if (filtered.length > 0) choices = filtered;
    }

    // Map 0 layer 1 (non-nuzlocke): guarantee at least one Grass AND one Water
    if (!sandbox.state.nuzlockeMode && sandbox.state.currentMap === 0 && node.layer === 1) {
      const grassIds = [43, 69, 102];
      const waterIds = [54, 60, 72, 79, 86, 98, 116, 118, 120, 129];
      if (!choices.some(p => p.types?.includes('Grass'))) {
        const id = grassIds[Math.floor(call('rng') * grassIds.length)];
        const r  = await call('fetchPokemonById', id);
        if (r) choices[0] = r;
      }
      if (!choices.some(p => p.types?.includes('Water'))) {
        const id = waterIds[Math.floor(call('rng') * waterIds.length)];
        const r  = await call('fetchPokemonById', id);
        if (r) {
          const slot = choices.findIndex(p => !p.types?.includes('Grass'));
          choices[slot === -1 ? 2 : slot] = r;
        }
      }
    }

    // Evo-line dedup: remove pokemon whose evo-line root is already on the team
    const teamRoots = new Set(sandbox.state.team.map(p => call('getEvoLineRoot', p.speciesId)));
    if (sandbox.state.nuzlockeMode) {
      // Nuzlocke: show only 1 pokemon, no evo-line duplicates
      const filtered = choices.filter(sp => !teamRoots.has(call('getEvoLineRoot', sp.id ?? sp.speciesId)));
      choices = (filtered.length > 0 ? filtered : choices).slice(0, 1);
    } else if (forceShiny) {
      // Shiny node: only the first candidate, forced shiny
      choices = choices.slice(0, 1);
    } else {
      choices = choices.slice(0, 3);
    }

    const moveTier  = get('getMoveТierForMap')(sandbox.state.currentMap);
    const instances = choices.map(sp =>
      call('createInstance', sp, sp._legendary ? level + 5 : level,
        forceShiny ? true : call('rng') < 0.01, moveTier)
    );

    const idx = await decide({ type: 'catch', options: instances, canSkip: true });
    if (idx === instances.length || idx === null || idx === undefined) return null;

    const chosen = instances[Math.min(idx, instances.length - 1)];
    await this._addToTeam(ctx, sandbox, call, decide, chosen, 'catch');
    return null;
  }

  // ─── Legendary encounter ────────────────────────────────────────────────────
  async _doLegendaryNode(ctx, sandbox, call, get, decide, node) {
    const LEGENDARY_IDS = get('LEGENDARY_IDS');
    const teamLegendIds = sandbox.state.team.map(p => p.speciesId);
    const available     = LEGENDARY_IDS.filter(id => id <= 151 && !teamLegendIds.includes(id));
    if (!available.length) return null;

    const legendId = available[Math.floor(call('rng') * available.length)];
    const species  = await call('fetchPokemonById', legendId);
    if (!species) return null;

    // Legendary level = max level for the current map (game.js line 1480)
    const MAP_LEVEL_RANGES = get('MAP_LEVEL_RANGES');
    const level    = MAP_LEVEL_RANGES[Math.min(sandbox.state.currentMap, 8)][1];
    const legendary = call('createInstance', species, level, call('rng') < 0.01, 2);

    const battleResult = call(
      'runBattle',
      [...sandbox.state.team], [legendary], sandbox.state.items, [], null, null
    );
    sandbox._stats.battlesTotal++;
    this._applyBattleResult(sandbox, battleResult.pTeam, battleResult.playerParticipants,
      [legendary], battleResult.detailedLog);
    await this._checkEvolutions(ctx, sandbox, call, decide);
    if (sandbox.state.nuzlockeMode) this._applyPermadeath(sandbox);

    if (!battleResult.playerWon || sandbox.state.team.length === 0) return { won: false };

    const idx = await decide({ type: 'catch', options: [legendary], canSkip: true });
    if (idx === 0) {
      await this._addToTeam(ctx, sandbox, call, decide, legendary, 'legendary');
    }
    return null;
  }

  // ─── Item node ──────────────────────────────────────────────────────────────
  async _doItemNode(ctx, sandbox, call, get, decide, node) {
    const ITEM_POOL        = get('ITEM_POOL');
    const USABLE_ITEM_POOL = get('USABLE_ITEM_POOL');

    const usedIds = new Set([
      ...sandbox.state.items.filter(it => !it.usable).map(it => it.id),
      ...sandbox.state.team.filter(p => p.heldItem).map(p => p.heldItem.id),
    ]);
    const heldAvailable = ITEM_POOL.filter(it =>
      !usedIds.has(it.id) &&
      (it.minMap === undefined || sandbox.state.currentMap >= it.minMap)
    );
    const canUseMaxRevive = sandbox.state.team.some(p => p.currentHp <= 0);
    const usableAvailable = USABLE_ITEM_POOL.filter(it => {
      if (it.id === 'max_revive') return canUseMaxRevive;
      return true;
    });

    const available = [...heldAvailable, ...usableAvailable];
    const shuffled  = [...available].sort(() => call('rng') - 0.5);
    const picks     = shuffled.slice(0, 3);
    if (!picks.length) return null;

    const idx = await decide({ type: 'item', options: picks, canSkip: true });
    if (idx === picks.length || idx === null || idx === undefined) return null;

    const item = picks[Math.min(idx, picks.length - 1)];
    sandbox._stats.itemsTaken++;
    if (item.usable) {
      sandbox.state.items.push({ ...item });
    } else {
      const assignIdx = await decide({
        type: 'item_assign', item, team: sandbox.state.team,
      });
      if (assignIdx < sandbox.state.team.length) {
        const p = sandbox.state.team[assignIdx];
        if (p.heldItem) sandbox.state.items.push(p.heldItem);
        p.heldItem = { ...item };
      } else {
        sandbox.state.items.push({ ...item });
      }
    }
    return null;
  }

  // ─── Move tutor node ────────────────────────────────────────────────────────
  async _doMoveTutorNode(ctx, sandbox, call, decide, node) {
    if (!sandbox.state.team.length) return null;
    const idx = await decide({ type: 'move_tutor', team: sandbox.state.team });
    if (idx < sandbox.state.team.length) {
      const p = sandbox.state.team[idx];
      p.moveTier = Math.min(2, (p.moveTier || 0) + 1);
      sandbox._stats.movesLearned++;
    }
    return null;
  }

  // ─── Trade node ─────────────────────────────────────────────────────────────
  async _doTradeNode(ctx, sandbox, call, get, decide, node) {
    if (!sandbox.state.team.length) return null;
    const idx = await decide({ type: 'trade', team: sandbox.state.team, canSkip: true });
    if (idx === sandbox.state.team.length || idx === null || idx === undefined) return null;

    const mine = sandbox.state.team[idx];
    if (!mine) return null;

    const choices = await call('getCatchChoices', sandbox.state.currentMap, 3, 151, true);
    if (!choices || !choices.length) return null;
    const species = choices[Math.floor(call('rng') * choices.length)];
    const level   = Math.min(100, mine.level + 3);
    const offer   = call('createInstance', species, level, call('rng') < 0.01,
      Math.max(get('getMoveТierForMap')(sandbox.state.currentMap), mine.moveTier ?? 0));

    if (mine._histId != null) {
      sandbox._stats.pokemonHistory[mine._histId].released    = true;
      sandbox._stats.pokemonHistory[mine._histId].releasedMap = sandbox.state.currentMap;
      sandbox._stats.pokemonHistory[mine._histId].releasedBy  = 'trade';
    }
    if (mine.heldItem) sandbox.state.items.push(mine.heldItem);

    const offerBst = offer.baseStats
      ? Object.values(offer.baseStats).reduce((a, b) => a + b, 0) : 0;
    const histEntry = {
      name: offer.name, species: offer.speciesId,
      level: offer.level, types: offer.types, bst: offerBst,
      acquired: 'trade', acquiredMap: sandbox.state.currentMap,
      released: false, releasedMap: null,
    };
    sandbox._stats.pokemonHistory.push(histEntry);
    offer._histId = sandbox._stats.pokemonHistory.length - 1;

    sandbox.state.team.splice(idx, 1, offer);
    return null;
  }

  // ─── Add a Pokemon to the team (swap if full) ────────────────────────────────
  async _addToTeam(ctx, sandbox, call, decide, pokemon, acquired = 'catch') {
    sandbox.state.catchesThisMap = (sandbox.state.catchesThisMap || 0) + 1;
    if (acquired === 'catch' || acquired === 'legendary') sandbox._stats.pokemonCaught++;

    const bst = pokemon.baseStats
      ? Object.values(pokemon.baseStats).reduce((a, b) => a + b, 0) : 0;
    const histEntry = {
      name: pokemon.name, species: pokemon.speciesId,
      level: pokemon.level, types: pokemon.types, bst,
      acquired, acquiredMap: sandbox.state.currentMap,
      released: false, releasedMap: null,
    };
    sandbox._stats.pokemonHistory.push(histEntry);
    pokemon._histId = sandbox._stats.pokemonHistory.length - 1;

    if (sandbox.state.team.length < 6) {
      sandbox.state.team.push(pokemon);
      if (sandbox.state.team.length > sandbox.state.maxTeamSize) {
        sandbox.state.maxTeamSize = sandbox.state.team.length;
      }
    } else {
      const swapIdx  = await decide({ type: 'swap', newPokemon: pokemon, team: sandbox.state.team });
      const safe     = Math.min(swapIdx, sandbox.state.team.length - 1);
      const released = sandbox.state.team[safe];
      if (released._histId != null) {
        sandbox._stats.pokemonHistory[released._histId].released    = true;
        sandbox._stats.pokemonHistory[released._histId].releasedMap = sandbox.state.currentMap;
      }
      if (released.heldItem) sandbox.state.items.push(released.heldItem);
      sandbox.state.team.splice(safe, 1, pokemon);
    }
  }

  // ─── Apply battle result to the team ────────────────────────────────────────
  _applyBattleResult(sandbox, resultP, playerParticipants, enemyTeam, detailedLog = []) {
    if (!resultP) return;

    if (detailedLog && sandbox._stats) {
      let rounds = 0;
      for (const e of detailedLog) {
        if (e && e.type === 'faint'  && e.side === 'player') sandbox._stats.pokemonFainted++;
        if (e && e.type === 'attack' && e.side === 'player') rounds++;
      }
      sandbox._stats.battleRounds += rounds;
    }
    for (let i = 0; i < sandbox.state.team.length; i++) {
      if (resultP[i]) sandbox.state.team[i].currentHp = resultP[i].currentHp;
    }
    const maxEnemyLevel = Math.max(...enemyTeam.map(p => p.level));
    for (const p of sandbox.state.team) {
      if (p.currentHp > 0 || (playerParticipants && playerParticipants.has(
        sandbox.state.team.indexOf(p)
      ))) {
        const newLevel = Math.min(p.level + 1, maxEnemyLevel + 5, 100);
        if (newLevel > p.level) {
          const oldMax = p.maxHp;
          p.level  = newLevel;
          p.maxHp  = Math.floor(p.baseStats.hp * newLevel / 50) + newLevel + 10;
          if (p.currentHp > 0) {
            p.currentHp = Math.min(p.currentHp + (p.maxHp - oldMax), p.maxHp);
          }
        }
      }
    }
  }

  // ─── Nuzlocke permadeath ─────────────────────────────────────────────────────
  _applyPermadeath(sandbox) {
    const before = sandbox.state.team.length;
    sandbox.state.team = sandbox.state.team.filter(p => {
      if (p.currentHp > 0) return true;
      if (p._histId != null) {
        const entry = sandbox._stats.pokemonHistory[p._histId];
        if (entry) { entry.dead = true; entry.diedMap = sandbox.state.currentMap; }
      }
      sandbox._stats.permadeaths++;
      return false;
    });
    return sandbox.state.team.length === 0 && before > 0;
  }

  // ─── Auto-evolve team after level ups ──────────────────────────────────────
  async _checkEvolutions(ctx, sandbox, call, decide) {
    try {
      const EVOLUTIONS          = vm.runInContext('EVOLUTIONS', ctx);
      const BRANCHING_EVOLUTIONS = vm.runInContext('BRANCHING_EVOLUTIONS', ctx);

      for (const p of sandbox.state.team) {
        if (p.heldItem?.id === 'eviolite') continue;

        const branching = BRANCHING_EVOLUTIONS[p.speciesId];
        if (branching) {
          const eligible = branching.filter(e => p.level >= e.level);
          if (eligible.length > 0) {
            const idx = await decide({ type: 'evolve_branch', pokemon: p, choices: eligible });
            const evo = eligible[Math.min(idx, eligible.length - 1)];
            await this._applyEvolution(sandbox, call, p, evo);
          }
          continue;
        }

        const evo = EVOLUTIONS[p.speciesId];
        if (evo && p.level >= evo.level) {
          await this._applyEvolution(sandbox, call, p, evo);
        }
      }
    } catch {
      // EVOLUTIONS may not be accessible — skip silently
    }
  }

  async _applyEvolution(sandbox, call, p, evo) {
    const newSpecies = await call('fetchPokemonById', evo.into);
    if (!newSpecies) return;
    const oldHpRatio = p.currentHp / p.maxHp;
    p.speciesId = evo.into;
    p.name      = evo.name || newSpecies.name;
    p.types     = newSpecies.types;
    p.baseStats = newSpecies.baseStats;
    p.maxHp     = Math.floor(newSpecies.baseStats.hp * p.level / 50) + p.level + 10;
    p.currentHp = Math.max(1, Math.floor(oldHpRatio * p.maxHp));
  }

  // ─── Fallback question-mark resolver (used only if prelude inject fails) ────
  _resolveQuestion(sandbox) {
    const r = Math.random();
    if (r < 0.22) return 'battle';
    if (r < 0.42) return 'trainer';
    if (r < 0.52) return sandbox.state.nuzlockeMode ? 'battle' : 'catch';
    if (r < 0.65) return 'item';
    if (r < 0.72) return 'shiny';
    return 'mega';
  }

  // ─── State summary for the agent ───────────────────────────────────────────
  _stateSummary(sandbox) {
    return {
      badges:         sandbox.state.badges,
      currentMap:     sandbox.state.currentMap,
      catchesThisMap: sandbox.state.catchesThisMap || 0,
      nuzlocke:       sandbox.state.nuzlockeMode || false,
      team:           this._teamSummary(sandbox.state.team),
      bagItems:       sandbox.state.items.map(it => ({ id: it.id, name: it.name })),
    };
  }

  _teamSummary(team) {
    return team.map(p => ({
      name:     p.name,
      species:  p.speciesId,
      level:    p.level,
      hp:       `${p.currentHp}/${p.maxHp}`,
      types:    p.types,
      bst:      p.baseStats ? Object.values(p.baseStats).reduce((a, b) => a + b, 0) : 0,
      item:     p.heldItem?.name || null,
      moveTier: p.moveTier ?? 1,
    }));
  }
}

module.exports = GameRunner;
