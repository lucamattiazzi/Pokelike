// battle.js - Auto-battle engine (1v1: active pokemon only)

// Stage multiplier: +10 = 4x, -10 = 0.25x, 0 = 1x (linear between)
// Formula: (10 + 3n) / 10 for n >= 0, 10 / (10 + 3|n|) for n < 0
function stageMultiplier(n) {
  return n >= 0 ? (10 + 3 * n) / 10 : 10 / (10 + 3 * Math.abs(n));
}

// Attach per-battle mutable state to a pokemon copy
function initBattleState(p) {
  p.stages = { atk: 0, def: 0, speed: 0, special: 0, spdef: 0 };
  p.status = null; // null | 'poison' | 'freeze'
  // Loaded Dice: roll once at battle start; the stages are applied below in
  // runBattle via applyStageChange so the +N/−N arrow animation plays (same
  // infrastructure as Battle Tower traits and Adrenaline Orb).
  if (p.heldItem?.id === 'loaded_dice') {
    p._loadedDiceRoll = rng() < 0.37 ? 2 : -1;
  }
  return p;
}

// Push a stat_change event and clamp stages to [-10, +10]
function applyStageChange(pokemon, stat, delta, side, idx, log) {
  const prev = pokemon.stages[stat];
  const newStage = Math.max(-10, Math.min(10, prev + delta));
  if (newStage === prev) return;
  pokemon.stages[stat] = newStage;
  log.push({ type: 'stat_change', side, idx,
    name: pokemon.nickname || pokemon.name, stat, change: delta, newStage });
}

// Apply a status condition (poison/freeze) — no-op if already has one
function applyStatus(pokemon, status, side, idx, log) {
  if (pokemon.status) return;
  pokemon.status = status;
  log.push({ type: 'status_apply', side, idx, name: pokemon.nickname || pokemon.name, status });
}

function calcDamage(attacker, defender, move, items, defItems = []) {
  const lvl = attacker.level;
  const isSpecial = (attacker.baseStats?.special || 0) >= (attacker.baseStats?.atk || 0);
  const atk = getEffectiveStat(attacker, isSpecial ? 'special' : 'atk', items, attacker.stages);
  const def = getEffectiveStat(defender, isSpecial ? 'spdef' : 'def', defItems, defender.stages);
  const power = move.power || 40;
  const moveType = move.type || 'Normal';

  let damage = Math.floor(((2 * lvl / 5 + 2) * power * atk / def / 50 + 2));

  const typeEff = move.typeless ? 1 : getTypeEffectiveness(moveType, defender.types || ['Normal']);
  damage = Math.floor(damage * typeEff);

  // STAB
  if (attacker.types && attacker.types.some(t => t.toLowerCase() === moveType.toLowerCase())) {
    damage = Math.floor(damage * 1.5);
  }

  const typeBoostItem = getTypeBoostItem(moveType, items);
  if (typeBoostItem) damage = Math.floor(damage * 1.5);

  if (hasItem(items, 'life_orb'))    damage = Math.floor(damage * 1.3);
  if (hasItem(items, 'wide_lens'))   damage = Math.floor(damage * 1.2);
  if (hasItem(items, 'metronome'))   damage = Math.floor(damage * 1.20);

  // Physical/special split items
  if (isSpecial) {
    if (hasItem(items, 'choice_specs')) damage = Math.floor(damage * 1.3);
  } else {
    if (hasItem(items, 'choice_band')) damage = Math.floor(damage * 1.4);
  }

  if (hasItem(items, 'lagging_tail')) damage = Math.floor(damage * 2.0);
  if (hasItem(items, 'expert_belt') && typeEff >= 2) damage = Math.floor(damage * 2.0);
  // Red Card: defender takes half damage from super-effective hits
  if (hasItem(defItems, 'red_card') && typeEff >= 2) damage = Math.floor(damage * 0.5);

  // Crit chance: 6.25% base, +20% with scope_lens or razor_claw
  let critChance = 0.0625;
  if (hasItem(items, 'scope_lens')) critChance = 0.20;
  const crit = rng() < critChance;
  if (crit) damage = Math.floor(damage * 1.5);

  const dmgVariance = 0.85 + rng() * 0.15;
  damage = typeEff === 0 ? 0 : Math.max(1, Math.floor(damage * dmgVariance));

  return { damage, typeEff, moveType, crit };
}

function getEffectiveStat(pokemon, stat, items, stages = null) {
  // spdef falls back to special for Gen 1 hardcoded teams that don't have it
  const rawStat = stat === 'spdef'
    ? (pokemon.baseStats?.spdef ?? pokemon.baseStats?.special ?? 50)
    : (pokemon.baseStats?.[stat] ?? 50);
  const buffCount = pokemon.statBuffs?.[stat] ?? 0;
  let val = Math.floor((rawStat || 50) * pokemon.level / 50) + 5;
  if (buffCount !== 0) val = Math.max(1, Math.floor(val * Math.max(0.1, 1 + 0.1 * buffCount)));

  if (stat === 'def') {
    if (hasItem(items, 'eviolite') && canEvolve(pokemon.speciesId)) val = Math.floor(val * 1.5);
    if (hasItem(items, 'choice_band'))                   val = Math.floor(val * 0.8);
  }
  if (stat === 'spdef') {
    if (hasItem(items, 'eviolite') && canEvolve(pokemon.speciesId)) val = Math.floor(val * 1.5);
    if (hasItem(items, 'assault_vest'))                  val = Math.floor(val * 1.5);
  }
  if (stat === 'speed') {
    if (hasItem(items, 'choice_scarf')) val = Math.floor(val * 1.5);
  }

  // Apply stat stage multiplier if present
  if (stages && stages[stat] !== undefined && stages[stat] !== 0) {
    val = Math.floor(val * stageMultiplier(stages[stat]));
  }

  return Math.max(1, val);
}

function hasItem(items, id) {
  return items && items.some(it => it.id === id);
}

function getTypeBoostItem(moveType, items) {
  if (!items) return false;
  const cap = moveType.charAt(0).toUpperCase() + moveType.slice(1).toLowerCase();
  const needed = TYPE_ITEM_MAP[cap];
  if (!needed) return false;
  return items.some(it => it.id === needed);
}

function runBattle(playerTeam, enemyTeam, bagItems, enemyItems, onLog, traitsConfig = null) {
  const items = bagItems; // bag — only used for Lucky Egg check in level gain
  const pTeam = playerTeam.map(p => initBattleState({ ...p }));
  const eTeam = enemyTeam.map(p => initBattleState({
    ...p,
    currentHp: p.currentHp !== undefined ? p.currentHp : calcHp(p.baseStats.hp, p.level),
    maxHp:     p.maxHp     !== undefined ? p.maxHp     : calcHp(p.baseStats.hp, p.level),
  }));

  const log = [];
  const detailedLog = [];
  const addLog = (msg, cls = '') => { log.push({ msg, cls }); if (onLog) onLog(msg, cls); };
  const playerParticipants = new Set();

  // Announce initial send-outs
  const firstP = pTeam[0];
  const firstE = eTeam[0];
  if (firstP.currentHp > 0) playerParticipants.add(0);
  detailedLog.push({ type: 'send_out', side: 'player', idx: 0, name: firstP.nickname || firstP.name });
  detailedLog.push({ type: 'send_out', side: 'enemy',  idx: 0, name: firstE.name });

  // Loaded Dice: announce the roll and apply stages via applyStageChange so the
  // +N/−N arrow animation plays (same path Fire trait / Adrenaline Orb use).
  for (const [team, side] of [[pTeam, 'player'], [eTeam, 'enemy']]) {
    for (let i = 0; i < team.length; i++) {
      const dice = team[i]._loadedDiceRoll;
      if (dice === undefined) continue;
      const name = team[i].nickname || team[i].name;
      const msg = dice > 0
        ? `🎲 ${name}'s Loaded Dice rolled high — +${dice} to all stats!`
        : `🎲 ${name}'s Loaded Dice rolled low — ${dice} to all stats!`;
      addLog(msg, side === 'player' ? 'log-player' : 'log-enemy');
      for (const stat of ['atk', 'def', 'speed', 'special', 'spdef']) {
        applyStageChange(team[i], stat, dice, side, i, detailedLog);
      }
    }
  }

  // Start-of-fight trait hooks (Fire, Ground, Normal)
  if (traitsConfig?.onStartFight) {
    traitsConfig.onStartFight(pTeam, eTeam, detailedLog);
  }

  let rounds = 0;
  const MAX_ROUNDS = 300;
  const OVERTIME_ROUND = 100;
  let overtimeMult = 1;

  while (pTeam.some(p => p.currentHp > 0) && eTeam.some(p => p.currentHp > 0) && rounds < MAX_ROUNDS) {
    rounds++;
    if (rounds === OVERTIME_ROUND + 1) {
      overtimeMult = 3;
      addLog('⚡ OVERTIME! All attacks deal 3× damage!', 'log-system');
      detailedLog.push({ type: 'overtime_start' });
    }

    // Active = first alive on each side
    const pEntry = pTeam.map((p, i) => ({ p, idx: i })).find(x => x.p.currentHp > 0);
    const eEntry = eTeam.map((p, i) => ({ p, idx: i })).find(x => x.p.currentHp > 0);
    if (!pEntry || !eEntry) break;

    const { p: pActive, idx: pIdx } = pEntry;
    const { p: eActive, idx: eIdx } = eEntry;

    // Ditto: Transform into the active enemy pokemon (once per send-out)
    if (pActive.speciesId === 132 && !pActive._transformed) {
      pActive._transformed = true;
      pActive.types     = [...(eActive.types || ['Normal'])];
      pActive.baseStats = { ...eActive.baseStats };
      pActive.spriteUrl = eActive.spriteUrl || '';
      const dName = pActive.nickname || pActive.name;
      addLog(`${dName} transformed into ${eActive.name}!`, 'log-player');
      detailedLog.push({ type: 'transform', side: 'player', idx: pIdx,
        name: dName, intoName: eActive.name, spriteUrl: pActive.spriteUrl,
        types: pActive.types });
    }

    // Per-Pokemon held items for this round
    const pActiveItems = pActive.heldItem ? [pActive.heldItem] : [];
    const eActiveItems = eActive.heldItem ? [eActive.heldItem] : [];

    // Speed determines turn order (stages applied)
    const pSpeed = getEffectiveStat(pActive, 'speed', pActiveItems, pActive.stages);
    const eSpeed = getEffectiveStat(eActive, 'speed', eActiveItems, eActive.stages);

    // If both active Pokemon can only use noDamage moves, force Struggle to break the stalemate
    const pMove = getBestMove(pActive.types || ['Normal'], pActive.baseStats, pActive.speciesId, pActive.moveTier ?? 1, pActive.heldItem);
    const eMove = getBestMove(eActive.types || ['Normal'], eActive.baseStats, eActive.speciesId, eActive.moveTier ?? 1, eActive.heldItem);
    const bothUseless = pMove.noDamage && eMove.noDamage;

    // Quick Claw: 50% chance to attack first regardless of speed. If both
    // sides roll, fall back to normal speed comparison.
    const pQuick = pActive.heldItem?.id === 'quick_claw' && rng() < 0.5;
    const eQuick = eActive.heldItem?.id === 'quick_claw' && rng() < 0.5;
    // Lagging Tail: holder always moves last. If both sides have it, it cancels.
    const pLagging = pActive.heldItem?.id === 'lagging_tail';
    const eLagging = eActive.heldItem?.id === 'lagging_tail';
    let playerFirst;
    if (pLagging && !eLagging)      playerFirst = false;
    else if (eLagging && !pLagging) playerFirst = true;
    else if (pQuick && !eQuick)     playerFirst = true;
    else if (eQuick && !pQuick)     playerFirst = false;
    else                             playerFirst = pSpeed >= eSpeed;
    const turns = playerFirst
      ? [{ attacker: pActive, aIdx: pIdx, side: 'player', target: eActive, tIdx: eIdx, tSide: 'enemy' },
         { attacker: eActive, aIdx: eIdx, side: 'enemy',  target: pActive, tIdx: pIdx, tSide: 'player' }]
      : [{ attacker: eActive, aIdx: eIdx, side: 'enemy',  target: pActive, tIdx: pIdx, tSide: 'player' },
         { attacker: pActive, aIdx: pIdx, side: 'player', target: eActive, tIdx: eIdx, tSide: 'enemy' }];

    for (const { attacker, aIdx, side, target, tIdx, tSide } of turns) {
      if (attacker.currentHp <= 0 || target.currentHp <= 0) continue;

      // King's Rock flinch: skip attacker's turn if it was flinched this round
      if (attacker.flinch) {
        addLog(`${attacker.nickname || attacker.name} flinched!`, side === 'player' ? 'log-player' : 'log-enemy');
        detailedLog.push({ type: 'status_tick', side, idx: aIdx,
          name: attacker.nickname || attacker.name, status: 'flinch',
          hpChange: 0, hpAfter: attacker.currentHp });
        attacker.flinch = false;
        continue;
      }

      // Frozen pokemon skip their attack turn
      if (attacker.status === 'freeze') {
        detailedLog.push({ type: 'status_tick', side, idx: aIdx,
          name: attacker.nickname || attacker.name, status: 'freeze_skip',
          hpChange: 0, hpAfter: attacker.currentHp });
        continue;
      }

      // Dark trait: chance for attacker to hit themselves in confusion
      if (traitsConfig?.onBeforeAttack) {
        const confused = traitsConfig.onBeforeAttack(attacker, aIdx, side, target, tIdx, tSide, detailedLog, pTeam, eTeam);
        if (confused) {
          // If confusion killed the attacker, send out the next Pokemon on that side
          if (attacker.currentHp <= 0) {
            const nextTeam = side === 'player' ? pTeam : eTeam;
            const next = nextTeam.map((p, i) => ({ p, idx: i })).find(x => x.p.currentHp > 0);
            if (next) {
              if (side === 'player') playerParticipants.add(next.idx);
              const nName = next.p.nickname || next.p.name;
              addLog(`${nName} was sent out!`, side === 'player' ? 'log-player' : 'log-enemy');
              detailedLog.push({ type: 'send_out', side, idx: next.idx, name: nName });
            }
          }
          continue;
        }
      }

      let move = getBestMove(attacker.types || ['Normal'], attacker.baseStats, attacker.speciesId, attacker.moveTier ?? 1, attacker.heldItem);
      // If both sides are stuck with useless moves, force Struggle on both
      if (bothUseless) {
        move = { name: 'Struggle', power: 50, type: 'Normal', isSpecial: false, typeless: true };
      }
      // If the attacker's best move has no effect on the target, use Struggle (typeless)
      if (!move.noDamage && getTypeEffectiveness(move.type, target.types || ['Normal']) === 0) {
        move = { name: 'Struggle', power: 50, type: 'Normal', isSpecial: false, typeless: true };
      }
      const attackerItems = side === 'player' ? pActiveItems : eActiveItems;
      const defenderItems = side === 'player' ? eActiveItems : pActiveItems;

      if (move.noDamage) {
        const aName = attacker.nickname || attacker.name;
        addLog(`${side === 'player' ? '' : '(enemy) '}${aName} used ${move.name}! But nothing happened!`,
               side === 'player' ? 'log-player' : 'log-enemy');
        detailedLog.push({
          type: 'attack', side, attackerIdx: aIdx, attackerName: aName,
          targetSide: tSide, targetIdx: tIdx, targetName: target.nickname || target.name,
          moveName: move.name, moveType: move.type, damage: 0, typeEff: 1, crit: false, isSpecial: false,
          attackerHpAfter: attacker.currentHp, targetHpAfter: target.currentHp,
        });
        continue;
      }

      const { damage: rawDamage, typeEff, moveType, crit } = calcDamage(attacker, target, move, attackerItems, defenderItems);
      const damage = overtimeMult * (traitsConfig?.beforeDamage
        ? traitsConfig.beforeDamage(target, tIdx, tSide, attacker, aIdx, side, rawDamage, detailedLog)
        : rawDamage);

      const targetPreHp = target.currentHp;
      target.currentHp = Math.max(0, target.currentHp - damage);

      // Focus Sash: guaranteed survive from full HP
      if (target.currentHp === 0 && targetPreHp === target.maxHp && tSide === 'player' && target.heldItem?.id === 'focus_sash') {
        target.currentHp = 1;
      }

      // King's Rock: 30% chance to flinch the target on a hit (only if target is still alive)
      if (target.currentHp > 0 && hasItem(attackerItems, 'kings_rock') && rng() < 0.3) {
        target.flinch = true;
      }

      // Adrenaline Orb: when the holder lands a super-effective hit, gain +1
      // ATK / +1 Sp.Atk battle stages (resets after the fight, like Battle
      // Tower trait buffs). Stacks with subsequent SE hits up to the +10 cap.
      if (typeEff >= 2 && attacker.heldItem?.id === 'adrenaline_orb') {
        applyStageChange(attacker, 'atk',     1, side, aIdx, detailedLog);
        applyStageChange(attacker, 'special', 1, side, aIdx, detailedLog);
      }

      const aName = attacker.nickname || attacker.name;
      const tName = target.nickname || target.name;

      let effText = '';
      if (typeEff >= 2)   effText = ' Super effective!';
      else if (typeEff === 0) effText = ' No effect!';
      else if (typeEff < 1)  effText = ' Not very effective...';

      addLog(`${side === 'player' ? '' : '(enemy) '}${aName} used ${move.name} → ${tName} took ${damage} dmg.${effText}`,
             side === 'player' ? 'log-player' : 'log-enemy');

      // Push attack event FIRST so whenAttacked hooks (Flying dodge etc.) appear after it in the log
      detailedLog.push({
        type: 'attack', side, attackerIdx: aIdx, attackerName: aName,
        targetSide: tSide, targetIdx: tIdx, targetName: tName,
        moveName: move.name, moveType, damage, typeEff, crit, isSpecial: move.isSpecial,
        attackerHpAfter: attacker.currentHp, targetHpAfter: target.currentHp,
      });

      // whenAttacked hook — events pushed here appear after the attack event in the log.
      // Called even on a KO so traits like Flying can retroactively revive/heal.
      if (traitsConfig?.whenAttacked) {
        traitsConfig.whenAttacked(target, tIdx, tSide, attacker, aIdx, side, damage, detailedLog);
      }

      // afterAttack hook (Grass, Ghost, Electric, Ice, Poison, Rock, Water, Psychic)
      // Use net HP lost after whenAttacked (e.g. Flying dodge heals back) so dodged attacks don't trigger splash effects
      const actualDamage = targetPreHp - target.currentHp;
      if (actualDamage > 0 && traitsConfig?.afterAttack) {
        traitsConfig.afterAttack(attacker, aIdx, side, target, tIdx, tSide, actualDamage, detailedLog, pTeam, eTeam);
      }

      // Life Orb recoil
      if (side === 'player' && attacker.heldItem?.id === 'life_orb') {
        const recoil = Math.max(1, Math.floor(attacker.maxHp * 0.1));
        attacker.currentHp = Math.max(0, attacker.currentHp - recoil);
        addLog(`${aName} lost ${recoil} HP from Life Orb!`, 'log-item');
        detailedLog.push({ type: 'effect', side: 'player', idx: aIdx, name: aName,
          hpChange: -recoil, hpAfter: attacker.currentHp, reason: `${aName} lost ${recoil} HP from Life Orb!` });
      }

      // Rocky Helmet
      if (target.heldItem?.id === 'rocky_helmet') {
        const helmet = Math.max(1, Math.floor(attacker.maxHp * 0.12));
        attacker.currentHp = Math.max(0, attacker.currentHp - helmet);
        addLog(`Rocky Helmet hurt ${aName} for ${helmet} HP!`, 'log-item');
        detailedLog.push({ type: 'effect', side, idx: aIdx, name: aName,
          hpChange: -helmet, hpAfter: attacker.currentHp, reason: `Rocky Helmet hurt ${aName} for ${helmet} HP!` });
      }

      // Shell Bell
      if (side === 'player' && attacker.heldItem?.id === 'shell_bell') {
        const heal   = Math.max(1, Math.floor(damage * 0.15));
        const actual = Math.min(heal, attacker.maxHp - attacker.currentHp);
        if (actual > 0) {
          attacker.currentHp += actual;
          addLog(`Shell Bell restored ${actual} HP to ${aName}!`, 'log-item');
          detailedLog.push({ type: 'effect', side: 'player', idx: aIdx, name: aName,
            hpChange: actual, hpAfter: attacker.currentHp, reason: `Shell Bell restored ${actual} HP to ${aName}!` });
        }
      }

      // Faint checks
      if (target.currentHp <= 0) {
        addLog(`${tName} fainted!`, 'log-faint');
        detailedLog.push({ type: 'faint', side: tSide, idx: tIdx, name: tName });
        if (traitsConfig?.onKO) {
          traitsConfig.onKO(target, tIdx, tSide, attacker, aIdx, side, detailedLog, pTeam, eTeam);
        }
        const nextTeam = tSide === 'player' ? pTeam : eTeam;
        const next = nextTeam.map((p, i) => ({ p, idx: i })).find(x => x.p.currentHp > 0);
        if (next) {
          if (tSide === 'player') playerParticipants.add(next.idx);
          const nName = next.p.nickname || next.p.name;
          addLog(`${nName} was sent out!`, tSide === 'player' ? 'log-player' : 'log-enemy');
          detailedLog.push({ type: 'send_out', side: tSide, idx: next.idx, name: nName });
        }
      }

      if (attacker.currentHp <= 0) {
        addLog(`${aName} fainted!`, 'log-faint');
        detailedLog.push({ type: 'faint', side, idx: aIdx, name: aName });
        const nextTeam = side === 'player' ? pTeam : eTeam;
        const next = nextTeam.map((p, i) => ({ p, idx: i })).find(x => x.p.currentHp > 0);
        if (next) {
          if (side === 'player') playerParticipants.add(next.idx);
          const nName = next.p.nickname || next.p.name;
          addLog(`${nName} was sent out!`, side === 'player' ? 'log-player' : 'log-enemy');
          detailedLog.push({ type: 'send_out', side, idx: next.idx, name: nName });
        }
      }
    }

    // Leftovers: heal active player pokemon 10% maxHP each round (if they hold it)
    const active = pTeam.map((p, i) => ({ p, i })).find(x => x.p.currentHp > 0);
    if (active?.p.heldItem?.id === 'leftovers') {
      {
        const heal = Math.max(1, Math.floor(active.p.maxHp * 0.10));
        const actual = Math.min(heal, active.p.maxHp - active.p.currentHp);
        if (actual > 0) {
          active.p.currentHp += actual;
          const n = active.p.nickname || active.p.name;
          addLog(`Leftovers restored ${actual} HP to ${n}!`, 'log-item');
          detailedLog.push({ type: 'effect', side: 'player', idx: active.i, name: n,
            hpChange: actual, hpAfter: active.p.currentHp, reason: `Leftovers restored ${actual} HP to ${n}!` });
        }
      }
    }

    // Status ticks at end of each round
    for (const [team, teamSide] of [[pTeam, 'player'], [eTeam, 'enemy']]) {
      for (let i = 0; i < team.length; i++) {
        const p = team[i];
        if (p.currentHp <= 0 || !p.status) continue;

        if (p.status === 'poison') {
          const tick = Math.max(1, Math.floor(p.maxHp / 8));
          p.currentHp = Math.max(0, p.currentHp - tick);
          detailedLog.push({ type: 'status_tick', side: teamSide, idx: i,
            name: p.nickname || p.name, status: 'poison', hpChange: -tick, hpAfter: p.currentHp });
          if (p.currentHp === 0) {
            addLog(`${p.nickname || p.name} fainted from poison!`, 'log-faint');
            detailedLog.push({ type: 'faint', side: teamSide, idx: i, name: p.nickname || p.name });
          } else if (traitsConfig?.afterStatusTick) {
            traitsConfig.afterStatusTick(p, i, teamSide, detailedLog, pTeam, eTeam);
          }
        }

        if (p.status === 'freeze') {
          if (rng() < 0.2) {
            p.status = null;
            detailedLog.push({ type: 'status_tick', side: teamSide, idx: i,
              name: p.nickname || p.name, status: 'freeze_thaw', hpChange: 0, hpAfter: p.currentHp });
          }
        }
      }
    }
  }

  const playerWon = pTeam.some(p => p.currentHp > 0) && !eTeam.some(p => p.currentHp > 0);
  addLog(playerWon ? '--- Victory! ---' : '--- Defeat! ---', playerWon ? 'log-win' : 'log-lose');
  detailedLog.push({ type: 'result', playerWon });

  return { playerWon, log, detailedLog, pTeam, eTeam, playerParticipants };
}

function getLevelGain(team, bagItems) {
  return 2;
}

// Applies level gains and returns an array of level-up events for animation.
// Each entry: { idx, pokemon, oldLevel, newLevel, preHp }
// baseGainOverride: if set, uses this as the base gain (e.g. 1 for wild battles)
function applyLevelGain(team, bagItems, participantIdxs, maxEnemyLevel = 0, hardMode = false, baseGainOverride = null, levelCap = Infinity) {
  const isWild = baseGainOverride !== null;
  const baseGain = isWild ? baseGainOverride : (hardMode ? 1 : getLevelGain(team, bagItems));
  const levelUps = [];

  for (let i = 0; i < team.length; i++) {
    const p = team[i];
    const getsXp = p.currentHp > 0 || (participantIdxs && participantIdxs.has(i));
    if (!getsXp) continue;

    const luckyBonus = p.heldItem?.id === 'lucky_egg' && rng() < 0.30 ? 1 : 0;
    const gain = baseGain + luckyBonus;
    const oldLevel = p.level;
    const newLevel = Math.min(oldLevel + gain, levelCap);
    if (newLevel === oldLevel) continue; // already at cap

    const preHp = p.currentHp;
    p.level = newLevel;
    const hpBuff = p.statBuffs?.hp ?? 0;
    const newMaxHp = Math.floor(calcHp(p.baseStats.hp, newLevel) * (1 + 0.1 * hpBuff));
    if (p.currentHp > 0) {
      p.currentHp = Math.min(p.currentHp + (newMaxHp - p.maxHp), newMaxHp);
    }
    p.maxHp = newMaxHp;

    levelUps.push({ idx: i, pokemon: p, oldLevel, newLevel, preHp });
  }

  return levelUps;
}
