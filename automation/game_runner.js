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
  // In-memory localStorage backed by a plain object
  const storage = {};

  // Pre-populate with species-list stub (getCatchChoices calls getSpeciesPool()
  // but ignores the result — we just need the promise to resolve)
  storage['pkrl_species_list'] = JSON.stringify(
    Object.values(pokemonCache).map(p => ({ name: p.name.toLowerCase(), id: p.id }))
  );
  // Pre-populate each Pokemon entry so fetchPokemonById hits the cache immediately
  for (const [id, poke] of Object.entries(pokemonCache)) {
    // Store in the format getCached/setCached expect (matching fetchPokemonById output)
    storage[`pkrl_poke_${poke.id}`] = JSON.stringify(poke);
  }

  const localStorage = {
    getItem:    k => storage[k] ?? null,
    setItem:    (k, v) => { storage[k] = v; },
    removeItem: k => { delete storage[k]; },
  };

  // fetch mock: only Pokemon lookups are needed; everything else is pre-cached
  async function fetchMock(url) {
    const m = url.match(/\/pokemon\/([^/?]+)/);
    if (m) {
      const key = m[1];
      const entry = pokemonCache[key] || pokemonCache[parseInt(key)];
      if (entry) {
        // Return a fake Response whose .json() mirrors what fetchPokemonById parses
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
    // Species list URL — return empty list (not actually used)
    if (url.includes('/pokemon?limit=')) {
      return { ok: true, json: async () => ({ results: [] }) };
    }
    throw new Error(`[GameRunner] fetch not mocked for: ${url}`);
  }

  const sandbox = {
    // Standard JS globals
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

    // Browser globals the game files expect
    localStorage,
    fetch: fetchMock,
    document: makeDomStub(),
    window:   {},         // filled in below
    requestAnimationFrame() {},
    Image: function() {},

    // ── RNG (copied verbatim from game.js) ──────────────────────────────────
    _rngSeed: 0,

    // ── Game state (same shape as game.js) ──────────────────────────────────
    state: {
      currentMap: 0, currentNode: null, team: [], items: [], badges: 0,
      map: null, eliteIndex: 0, trainer: 'boy', starterSpeciesId: null,
      maxTeamSize: 1, nuzlockeMode: false, isEndlessMode: false,
      usedPokecenter: false,
    },

    // Endless-mode stub (unused in normal-mode runs)
    endlessState: { stageNumber: 1, regionNumber: 1, mapIndexInRegion: 0 },

    // ── Stubs for game.js UI functions referenced by data.js/map.js ─────────
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
    loadBuffsIntoPokemon()  {},      // no-op in normal mode
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

  // Inject the RNG and helper globals that data.js/battle.js/map.js reference
  // before they are loaded (these live in game.js normally)
  const prelude = `
    function rng() {
      _rngSeed = (_rngSeed + 0x6D2B79F5) | 0;
      let t = Math.imul(_rngSeed ^ (_rngSeed >>> 15), 1 | _rngSeed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function seedRng(seed) { _rngSeed = seed >>> 0; }
    function getRngSeed() { return _rngSeed >>> 0; }

    // battle.js uses calcHp which is defined in data.js — ensure it's hoisted
    // (data.js defines it as a plain function, so hoisting works within the context)
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
  /**
   * @param {Record<number, object>} pokemonCache  — output of build_cache.js
   */
  constructor(pokemonCache) {
    this._cache = pokemonCache;
  }

  /**
   * Play a full normal-mode run.
   *
   * @param {number}   seed       — RNG seed for this run
   * @param {Function} agentFn   — async (decision) => choiceIndex
   *   decision shapes:
   *     { type: 'starter',    options: PokemonSpecies[] }
   *     { type: 'branch',     options: MapNode[],   state: StateSummary }
   *     { type: 'catch',      options: Pokemon[],   canSkip: true, state }
   *     { type: 'swap',       newPokemon: Pokemon,  team: Pokemon[], state }
   *     { type: 'item',       options: Item[],      canSkip: true, state }
   *     { type: 'item_assign',item: Item,           team: Pokemon[], state }
   *     { type: 'evolve_branch', pokemon, choices: Evo[], state }
   *
   * @returns {{ outcome, mapsCleared, finalTeam, decisions, seed }}
   */
  async play(seed, agentFn) {
    const sandbox = buildSandbox(this._cache);
    const ctx     = loadGameFiles(sandbox);

    // Convenience: call a sandbox function by name with args
    const call = (name, ...args) => {
      sandbox.__args = args;
      return vm.runInContext(`${name}(...__args)`, ctx);
    };

    // Convenience: evaluate a sandbox expression
    const get = expr => vm.runInContext(expr, ctx);

    const decisions = [];

    // Helper to record and delegate a decision
    const decide = async (decision) => {
      const idx = await agentFn({ ...decision, state: this._stateSummary(sandbox) });
      decisions.push({ ...decision, choice: idx, state: undefined });
      return typeof idx === 'number' ? idx : 0;
    };

    try {
      // ── Initialise ──────────────────────────────────────────────────────────
      vm.runInContext(`seedRng(${seed >>> 0})`, ctx);
      sandbox.state = {
        currentMap: 0, currentNode: null, team: [], items: [], badges: 0,
        map: null, eliteIndex: 0, trainer: 'boy', starterSpeciesId: null,
        maxTeamSize: 1, nuzlockeMode: false, isEndlessMode: false,
        usedPokecenter: false,
      };

      // ── Starter selection ────────────────────────────────────────────────────
      const STARTER_IDS = [1, 4, 7];
      const starters = await Promise.all(
        STARTER_IDS.map(id => vm.runInContext(`fetchPokemonById(${id})`, ctx))
      );
      const starterIdx = await decide({ type: 'starter', options: starters });
      const starterSpecies = starters[starterIdx] || starters[0];
      const starter = call('createInstance', starterSpecies, 5, false, 0);

      sandbox.state.team            = [starter];
      sandbox.state.starterSpeciesId = starter.speciesId;
      sandbox.state.maxTeamSize      = 1;

      // ── Maps 0–7 (8 gym leaders) ─────────────────────────────────────────────
      for (let mapIdx = 0; mapIdx < 8; mapIdx++) {
        sandbox.state.currentMap = mapIdx;
        sandbox.state.map = call('generateMap', mapIdx, false);

        const mapResult = await this._playMap(ctx, sandbox, call, get, decide, mapIdx);
        if (!mapResult.won) {
          return {
            outcome: 'loss', mapsCleared: mapIdx,
            finalTeam: this._teamSummary(sandbox.state.team),
            decisions, seed,
          };
        }
        sandbox.state.badges++;
      }

      // ── Elite Four + Champion (map index 8) ──────────────────────────────────
      sandbox.state.currentMap = 8;
      const ELITE_4 = get('ELITE_4');
      for (let i = 0; i < ELITE_4.length; i++) {
        sandbox.state.eliteIndex = i;
        const boss = ELITE_4[i];
        const enemyTeam = boss.team.map(p => call('createInstance', p, p.level, false, 2));
        const { playerWon, pTeam: resultP, playerParticipants } = call(
          'runBattle',
          [...sandbox.state.team], enemyTeam, sandbox.state.items, [], null, null
        );
        this._applyBattleResult(sandbox, resultP, playerParticipants, enemyTeam);
        await this._checkEvolutions(ctx, sandbox, call, decide);
        if (!playerWon) {
          return {
            outcome: 'loss', mapsCleared: 8, eliteDefeated: i,
            finalTeam: this._teamSummary(sandbox.state.team),
            decisions, seed,
          };
        }
      }

      return {
        outcome: 'win', mapsCleared: 9,
        finalTeam: this._teamSummary(sandbox.state.team),
        decisions, seed,
      };
    } catch (err) {
      return {
        outcome: 'error', error: err.message,
        finalTeam: this._teamSummary(sandbox.state.team),
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

      // If only one accessible node, take it without asking the agent
      let chosen;
      if (accessible.length === 1) {
        chosen = accessible[0];
      } else {
        const idx = await decide({ type: 'branch', options: accessible });
        chosen = accessible[idx] ?? accessible[0];
      }

      // Lock siblings and mark chosen as current
      for (const n of Object.values(map.nodes)) {
        if (n.layer === chosen.layer && n.id !== chosen.id && n.accessible) {
          n.accessible = false;
        }
      }
      sandbox.state.currentNode = chosen;

      // Resolve question marks (resolveQuestionMark lives in game.js which isn't loaded)
      let resolvedType = chosen.type;
      if (resolvedType === 'question') {
        try { resolvedType = vm.runInContext('resolveQuestionMark()', ctx); }
        catch { resolvedType = this._resolveQuestion(sandbox); }
      }

      const nodeResult = await this._resolveNode(ctx, sandbox, call, get, decide, chosen, resolvedType, mapIdx);

      // Always advance after resolving
      call('advanceFromNode', map, chosen.id);

      if (resolvedType === 'boss' && nodeResult && !nodeResult.won) {
        return { won: false };
      }
      if (resolvedType === 'boss' && nodeResult && nodeResult.won) {
        return { won: true };
      }

      // Heal at pokecenter is instant
    }

    return { won: false }; // should not reach here normally
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
      case 'trainer':
        return await this._doBattleNode(ctx, sandbox, call, get, decide, node, false);

      case 'boss':
        return await this._doBossNode(ctx, sandbox, call, get, decide, mapIdx);

      case 'catch':
      case 'shiny':
        return await this._doCatchNode(ctx, sandbox, call, get, decide, node, type === 'shiny');

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
        return await this._doBattleNode(ctx, sandbox, call, get, decide, node, false);
    }
  }

  // ─── Wild / Trainer battle ──────────────────────────────────────────────────
  async _doBattleNode(ctx, sandbox, call, get, decide, node, isBoss) {
    const level = this._getLevelForNode(sandbox, node);
    const choices = await call('getCatchChoices', sandbox.state.currentMap, 3, 151, true);
    if (!choices || !choices.length) return { won: true };

    const species = choices[Math.floor(call('rng') * choices.length)] || choices[0];
    const enemy   = call('createInstance', species, level, false,
      get('getMoveТierForMap')(sandbox.state.currentMap));

    const { playerWon, pTeam: resultP, playerParticipants } = call(
      'runBattle',
      [...sandbox.state.team], [enemy], sandbox.state.items, [], null, null
    );

    this._applyBattleResult(sandbox, resultP, playerParticipants, [enemy]);
    await this._checkEvolutions(ctx, sandbox, call, decide);
    return { won: playerWon };
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

    const { playerWon, pTeam: resultP, playerParticipants } = call(
      'runBattle',
      [...sandbox.state.team], enemyTeam, sandbox.state.items, [], null, null
    );

    this._applyBattleResult(sandbox, resultP, playerParticipants, enemyTeam);
    await this._checkEvolutions(ctx, sandbox, call, decide);
    return { won: playerWon };
  }

  // ─── Catch node ─────────────────────────────────────────────────────────────
  async _doCatchNode(ctx, sandbox, call, get, decide, node, forceShiny) {
    const level = this._getLevelForNode(sandbox, node);
    const choices = await call(
      'getCatchChoices', sandbox.state.currentMap, 18, 151, true
    );
    if (!choices || !choices.length) return null;

    // Filter by min level requirement
    const lvlFiltered = choices.filter(sp =>
      call('minLevelForSpecies', sp.id ?? sp.speciesId) <= level
    );
    const pool = (lvlFiltered.length > 0 ? lvlFiltered : choices).slice(0, 3);

    const moveTier = get('getMoveТierForMap')(sandbox.state.currentMap);
    const instances = pool.map(sp =>
      call('createInstance', sp, forceShiny ? level : sp._legendary ? level + 5 : level,
        forceShiny, moveTier)
    );

    // options: instances + implicit "skip" at index instances.length
    const idx = await decide({ type: 'catch', options: instances, canSkip: true });
    if (idx === instances.length || idx === null || idx === undefined) return null; // skip

    const chosen = instances[Math.min(idx, instances.length - 1)];
    await this._addToTeam(ctx, sandbox, call, decide, chosen);
    return null;
  }

  // ─── Legendary encounter ────────────────────────────────────────────────────
  async _doLegendaryNode(ctx, sandbox, call, get, decide, node) {
    const level = this._getLevelForNode(sandbox, node);
    // Use a fixed legendary pool for gen 1
    const legendaryPool = [144, 145, 146];
    const id = legendaryPool[Math.floor(call('rng') * legendaryPool.length)];
    const species = await call('fetchPokemonById', id);
    if (!species) return null;

    const legendary = call('createInstance', species, level + 5, call('rng') < 0.01,
      get('getMoveТierForMap')(sandbox.state.currentMap));

    // Fight it first
    const { playerWon } = call(
      'runBattle',
      [...sandbox.state.team], [legendary], sandbox.state.items, [], null, null
    );

    // Even if you lose the fight in the original game you get a chance to catch,
    // but here we skip adding to team if the fight was lost (team may be weakened)
    if (!playerWon) return { won: false };

    // Offer to add legendary to team
    const idx = await decide({ type: 'catch', options: [legendary], canSkip: true });
    if (idx === 0) {
      await this._addToTeam(ctx, sandbox, call, decide, legendary);
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
    // Shuffle using RNG (match game logic)
    const shuffled = [...available].sort(() => call('rng') - 0.5);
    const picks = shuffled.slice(0, 3);
    if (!picks.length) return null;

    // options + implicit "skip" at index picks.length
    const idx = await decide({ type: 'item', options: picks, canSkip: true });
    if (idx === picks.length || idx === null || idx === undefined) return null; // skip

    const item = picks[Math.min(idx, picks.length - 1)];
    if (item.usable) {
      sandbox.state.items.push({ ...item });
    } else {
      // Ask agent which Pokemon to give it to (or put in bag at index team.length)
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
    // Ask which Pokemon should get an upgraded move tier
    const idx = await decide({ type: 'move_tutor', team: sandbox.state.team });
    if (idx < sandbox.state.team.length) {
      const p = sandbox.state.team[idx];
      p.moveTier = Math.min(2, (p.moveTier || 0) + 1);
    }
    return null;
  }

  // ─── Trade node ─────────────────────────────────────────────────────────────
  async _doTradeNode(ctx, sandbox, call, get, decide, node) {
    if (!sandbox.state.team.length) return null;
    // Ask agent whether to trade at all (skip = team.length, else index of Pokemon to trade)
    const idx = await decide({ type: 'trade', team: sandbox.state.team, canSkip: true });
    if (idx === sandbox.state.team.length || idx === null || idx === undefined) return null;

    const mine = sandbox.state.team[idx];
    if (!mine) return null;

    const choices = await call('getCatchChoices', sandbox.state.currentMap, 3, 151, true);
    if (!choices || !choices.length) return null;
    const species = choices[Math.floor(call('rng') * choices.length)];
    const level   = Math.min(100, mine.level + 3);
    const offer   = call('createInstance', species, level, false,
      Math.max(get('getMoveТierForMap')(sandbox.state.currentMap), mine.moveTier ?? 0));

    if (mine.heldItem) sandbox.state.items.push(mine.heldItem);
    sandbox.state.team.splice(idx, 1, offer);
    return null;
  }

  // ─── Add a Pokemon to the team, asking for swap if full ────────────────────
  async _addToTeam(ctx, sandbox, call, decide, pokemon) {
    if (sandbox.state.team.length < 6) {
      sandbox.state.team.push(pokemon);
      if (sandbox.state.team.length > sandbox.state.maxTeamSize) {
        sandbox.state.maxTeamSize = sandbox.state.team.length;
      }
    } else {
      // Team full — ask who to release
      const idx = await decide({ type: 'swap', newPokemon: pokemon, team: sandbox.state.team });
      const safe = Math.min(idx, sandbox.state.team.length - 1);
      const released = sandbox.state.team[safe];
      if (released.heldItem) sandbox.state.items.push(released.heldItem);
      sandbox.state.team.splice(safe, 1, pokemon);
    }
  }

  // ─── Apply battle result to the team ────────────────────────────────────────
  _applyBattleResult(sandbox, resultP, playerParticipants, enemyTeam) {
    if (!resultP) return;
    // Sync HP from battle result
    for (let i = 0; i < sandbox.state.team.length; i++) {
      if (resultP[i]) sandbox.state.team[i].currentHp = resultP[i].currentHp;
    }
    // Level gain (1 level per battle in normal mode, capped)
    const maxEnemyLevel = Math.max(...enemyTeam.map(p => p.level));
    for (const p of sandbox.state.team) {
      if (p.currentHp > 0 || (playerParticipants && playerParticipants.has(
        sandbox.state.team.indexOf(p)
      ))) {
        const newLevel = Math.min(p.level + 1, maxEnemyLevel + 5, 100);
        if (newLevel > p.level) {
          const oldMax = p.maxHp;
          p.level = newLevel;
          p.maxHp = Math.floor(p.baseStats.hp * newLevel / 50) + newLevel + 10;
          if (p.currentHp > 0) {
            p.currentHp = Math.min(p.currentHp + (p.maxHp - oldMax), p.maxHp);
          }
        }
      }
    }
  }

  // ─── Auto-evolve team after level ups ──────────────────────────────────────
  async _checkEvolutions(ctx, sandbox, call, decide) {
    try {
      const EVOLUTIONS         = vm.runInContext('EVOLUTIONS', ctx);
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
    const oldHpRatio  = p.currentHp / p.maxHp;
    p.speciesId  = evo.into;
    p.name       = evo.name || newSpecies.name;
    p.types      = newSpecies.types;
    p.baseStats  = newSpecies.baseStats;
    p.maxHp      = Math.floor(newSpecies.baseStats.hp * p.level / 50) + p.level + 10;
    p.currentHp  = Math.max(1, Math.floor(oldHpRatio * p.maxHp));
  }

  // ─── resolveQuestionMark fallback (in case game.js isn't loaded) ────────────
  _resolveQuestion(sandbox) {
    const r = Math.random();
    if (r < 0.22) return 'battle';
    if (r < 0.42) return 'trainer';
    if (r < 0.52) return 'catch';
    if (r < 0.65) return 'item';
    return 'battle';
  }

  // ─── Level helper (mirrors getLevelForNode from game.js) ───────────────────
  _getLevelForNode(sandbox, node) {
    const MAP_LEVEL_RANGES = [
      [1, 5], [8, 15], [14, 21], [21, 29],
      [29, 37], [37, 43], [43, 47], [47, 52], [53, 64],
    ];
    const [minL, maxL] = MAP_LEVEL_RANGES[Math.min(sandbox.state.currentMap, 8)];
    const t    = Math.min(1, Math.max(0, ((node.layer || 1) - 1) / 5));
    const base = Math.round(minL + t * (maxL - minL));
    const spread = Math.max(1, Math.round((maxL - minL) / 8));
    return Math.min(maxL, Math.max(minL, base + Math.floor(Math.random() * spread)));
  }

  // ─── Summarise current state for the agent ─────────────────────────────────
  _stateSummary(sandbox) {
    return {
      badges:    sandbox.state.badges,
      currentMap: sandbox.state.currentMap,
      team:      this._teamSummary(sandbox.state.team),
      bagItems:  sandbox.state.items.map(it => ({ id: it.id, name: it.name })),
    };
  }

  _teamSummary(team) {
    return team.map(p => ({
      name:    p.name,
      species: p.speciesId,
      level:   p.level,
      hp:      `${p.currentHp}/${p.maxHp}`,
      types:   p.types,
      bst:     p.baseStats ? Object.values(p.baseStats).reduce((a, b) => a + b, 0) : 0,
      item:    p.heldItem?.name || null,
      moveTier: p.moveTier ?? 1,
    }));
  }
}

module.exports = GameRunner;
