// endless.js - Endless mode state, archetype pool, trait system, region/stage management

let endlessState = {
  active: false,
  stageNumber: 1,
  regionNumber: 1,
  mapIndexInRegion: 0,  // 0-1 = map bosses, 2 = Big Boss
  currentRegion: null,  // { stageNum, regionNum, levelRange, trainers[] }
  traitTiers: {},       // { Fire: 2, Water: 1, ... } — recomputed before each fight
};

// ── Trait descriptions (per tier) ─────────────────────────────────────────────

const TRAIT_DESCRIPTIONS = {
  Bug:     ['20% chance: +1 Level after fight',           '40% chance: +1 Level after fight',           '80% chance: +1 Level after fight'],
  Dark:    ['5% chance: enemy hurts itself in confusion',  '10% chance: enemy hurts itself in confusion', '15% chance: enemy hurts itself in confusion'],
  Dragon:  ['+1 Spd/ATK/SpATK on KO', '+2 Spd/ATK/SpATK on KO', '+3 Spd/ATK/SpATK on KO',
            '+4 Spd/ATK/SpATK on KO', '+5 Spd/ATK/SpATK on KO', '+6 Spd/ATK/SpATK on KO',
            '+7 Spd/ATK/SpATK on KO', '+8 Spd/ATK/SpATK on KO', '+9 Spd/ATK/SpATK on KO',
            '+10 Spd/ATK/SpATK on KO'],
  Electric:['15% chance to attack again',                 '30% chance to attack again',                 '45% chance to attack again'],
  Fairy:   ['Enemy: -1 ATK & Sp.ATK at fight start',     'Enemy: -2 ATK & Sp.ATK at fight start',     'Enemy: -3 ATK & Sp.ATK at fight start'],
  Fighting:['When a pokemon faints, survivors get +1 ATK & Sp.ATK', 'When a pokemon faints, survivors get +2 ATK & Sp.ATK', 'When a pokemon faints, survivors get +3 ATK & Sp.ATK'],
  Fire:    ['+1 ATK & Sp.ATK stages at fight start',     '+2 ATK & Sp.ATK stages at fight start',     '+3 ATK & Sp.ATK stages at fight start'],
  Flying:  ['10% chance to dodge incoming attacks',       '15% chance to dodge incoming attacks',       '20% chance to dodge incoming attacks'],
  Ghost:   ['Execute enemies below 15% HP',               'Execute enemies below 30% HP',               'Execute enemies below 50% HP'],
  Grass:   ['Heal 5% of damage dealt',                    'Heal 10% of damage dealt',                   'Heal 15% of damage dealt'],
  Ground:  ['+2 DEF stages at fight start',               '+4 DEF stages at fight start',               '+6 DEF stages at fight start'],
  Ice:     ['15% chance to freeze on hit',                '30% chance to freeze on hit',                '45% chance to freeze on hit'],
  Normal:  ['+25% max HP at fight start',                 '+50% max HP at fight start',                 '+100% max HP at fight start'],
  Poison:  ['33% chance to poison on hit',                '66% chance to poison on hit',                '100% chance to poison on hit'],
  Psychic: ['10% of damage splashes to all enemies',      '20% of damage splashes to all enemies',      '30% of damage splashes to all enemies'],
  Rock:    ['33% chance: +1 DEF & Sp.DEF after attack',   '66% chance: +2 DEF & Sp.DEF after attack',   '100% chance: +3 DEF & Sp.DEF after attack'],
  Steel:   ['Reduce incoming damage by 15%',              'Reduce incoming damage by 30%',              'Reduce incoming damage by 45%',              'Reduce incoming damage by 60%',              'Reduce incoming damage by 75%'],
  Water:   ['33% chance: Enemy -1 Spd/ATK/SpATK on hit', '66% chance: Enemy -2 Spd/ATK/SpATK on hit', '100% chance: Enemy -3 Spd/ATK/SpATK on hit'],
};

// Returns sorted type count data for the trait display panel.
// Each entry: { type, count, tier, nextThreshold, description, active }
function getTraitDisplayData(team) {
  const counts = {};
  for (const p of team) {
    const mult = p.isShiny ? 2 : 1;
    for (const t of (p.types || [])) {
      counts[t] = (counts[t] || 0) + mult;
    }
  }
  // Include all types that appear in TRAIT_DESCRIPTIONS
  const allTypes = Object.keys(TRAIT_DESCRIPTIONS);
  const entries = allTypes
    .map(type => {
      const count = counts[type] || 0;
      const maxTier = TRAIT_DESCRIPTIONS[type]?.length ?? 3;
      const tier = count >= 6 ? 3 : count >= 4 ? 2 : count >= 2 ? 1 : 0;
      const nextThreshold = count < 2 ? 2 : count < 4 ? 4 : 6;
      const description = TRAIT_DESCRIPTIONS[type]?.[tier > 0 ? tier - 1 : 0] || '';
      const nextTier = Math.min(tier + 1, maxTier);
      const nextDescription = tier < maxTier ? TRAIT_DESCRIPTIONS[type]?.[nextTier - 1] || null : null;
      return { type, count, tier, nextThreshold, description, nextDescription, active: tier > 0 };
    })
    .filter(e => e.count > 0) // only show types the player actually has
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  return entries;
}

// ── Level scaling ─────────────────────────────────────────────────────────────

// Slot 0-8: max = gym leader's highest pokemon level - 2 (Brock→12, Misty→18, Surge→24,
// Erika→30, Koga→42, Sabrina→42, Blaine→51, Giovanni→58, Champion→63).
const ENDLESS_LEVEL_SLOTS = [
  [1, 7], [12, 18], [18, 24], [24, 30], [35, 42],
  [42, 46], [46, 51], [52, 58], [57, 63],
];
const ENDLESS_TEAM_SIZES = [2, 2, 3, 3, 4, 4, 5, 5, 6];

function getEndlessLevelRange(stageNum, regionNum, mapIndex) {
  // R1M1 (slot 0) is identical every stage. Every subsequent slot gains
  // floor(0.5 * slot * (stage - 1)) levels so later maps scale harder in higher stages.
  const localSlot = (regionNum - 1) * 3 + mapIndex;  // 0-8 within the stage
  const stageBonus = Math.floor(1.5 * localSlot * (stageNum - 1));
  if (localSlot < ENDLESS_LEVEL_SLOTS.length) {
    const [min, max] = ENDLESS_LEVEL_SLOTS[localSlot];
    return [min + stageBonus, max + stageBonus];
  }
  const extra = localSlot - (ENDLESS_LEVEL_SLOTS.length - 1);
  return [53 + stageBonus + extra * 8, 64 + stageBonus + extra * 8];
}

// ── Gen gating ────────────────────────────────────────────────────────────────

// Max Pokémon ID allowed per stage (stages 6+ use 649 = all gens)
const STAGE_MAX_GEN_ID = [0, 151, 251, 386, 493, 649];
function getEndlessMaxGenId(stageNum) {
  return STAGE_MAX_GEN_ID[Math.min(stageNum, 5)];
}

// ── Archetype pool ────────────────────────────────────────────────────────────

const ENDLESS_ARCHETYPES = [
  { id: 'fire_ace',         name: 'Fire Ace',         type: 'Fire',     sprite: 'aceTrainer',
    pool: [4,5,6,58,59,77,78,126,136,38,250,157,156,467,499,500,554,555,636,637] },
  { id: 'psychic_sage',     name: 'Psychic Sage',     type: 'Psychic',  sprite: 'scientist',
    pool: [63,64,65,79,80,96,97,102,103,122,196,475,576,578,579,605,606] },
  { id: 'water_lord',       name: 'Water Lord',       type: 'Water',    sprite: 'fisherman',
    pool: [54,55,60,61,62,72,73,86,87,90,91,98,99,116,117,118,119,129,130,134,418,419,456,457,502,503,580,581,592,593] },
  { id: 'rock_titan',       name: 'Rock Titan',       type: 'Rock',     sprite: 'hiker',
    pool: [74,75,76,95,111,112,138,139,140,141,142,248,213,408,409,410,411,524,525,526,557,558] },
  { id: 'bug_queen',        name: 'Bug Queen',         type: 'Bug',      sprite: 'bugcatcher',
    pool: [10,11,12,13,14,15,46,47,48,49,123,127,165,166,212,469,540,541,542,543,544,545,595,596,616,617,636,637] },
  { id: 'ghost_lord',       name: 'Ghost Lord',       type: 'Ghost',    sprite: 'scientist',
    pool: [92,93,94,200,292,356,477,302,354,355,562,563,607,608,609] },
  { id: 'electric_sage',    name: 'Electric Sage',    type: 'Electric', sprite: 'aceTrainer',
    pool: [25,26,81,82,100,101,125,135,466,522,523,587,595,596,602,603,604] },
  { id: 'ice_master',       name: 'Ice Master',       type: 'Ice',      sprite: 'aceTrainer',
    pool: [87,91,124,131,215,220,221,361,362,471,473,459,460,582,583,584,613,614] },
  { id: 'ground_giant',     name: 'Ground Giant',     type: 'Ground',   sprite: 'hiker',
    pool: [27,28,50,51,74,75,76,104,105,111,112,194,195,449,450,529,530,551,552,553] },
  { id: 'poison_witch',     name: 'Poison Witch',     type: 'Poison',   sprite: 'teamrocket',
    pool: [23,24,29,30,31,32,33,34,41,42,43,44,45,88,89,109,110,169,434,435,453,454,568,569] },
  { id: 'normal_champion',  name: 'Normal Champion',  type: 'Normal',   sprite: 'aceTrainer',
    pool: [19,20,52,53,55,83,84,85,128,133,143,163,164,241,235,446,424,504,505,506,507,508,572,573] },
  { id: 'flying_master',    name: 'Flying Master',    type: 'Flying',   sprite: 'aceTrainer',
    pool: [16,17,18,21,22,83,84,85,123,142,149,469,227,396,397,398,519,520,521,627,628] },
  { id: 'grass_druid',      name: 'Grass Druid',      type: 'Grass',    sprite: 'aceTrainer',
    pool: [1,2,3,43,44,45,69,70,71,102,103,114,182,187,188,189,357,406,407,495,496,497,546,547,548,549] },
  { id: 'dragon_lord',      name: 'Dragon Lord',      type: 'Dragon',   sprite: 'aceTrainer',
    pool: [147,148,149,230,329,330,334,373,443,444,445,610,611,612,633,634,635] },
  { id: 'dark_shadow',      name: 'Dark Shadow',      type: 'Dark',     sprite: 'teamrocket',
    pool: [197,198,215,228,229,248,261,302,359,461,509,510,570,571,624,625,629,630] },
  { id: 'steel_guard',      name: 'Steel Guard',      type: 'Steel',    sprite: 'aceTrainer',
    pool: [81,82,208,212,227,302,303,304,305,306,385,436,437,476,597,598,599,600,601,622,623] },
  { id: 'fighting_dojo',    name: 'Fighting Master',  type: 'Fighting', sprite: 'hiker',
    pool: [56,57,62,66,67,68,106,107,214,237,286,447,448,532,533,534,538,539,619,620] },
  // Per-stage final bosses (region 3 map 2 for stages 1-5)
  { id: 'stage1_boss', name: 'Ash Ketchum', type: null, sprite: 'aceTrainer',
    pool: [25,6,1,7,18,143] },
  { id: 'stage2_boss', name: 'Champion Lance', type: null, sprite: 'aceTrainer',
    pool: [149,148,142,6,130,248] },
  { id: 'stage3_boss', name: 'Steven Stone', type: null, sprite: 'aceTrainer',
    pool: [376,373,227,302,306,308] },
  { id: 'stage4_boss', name: 'Cynthia', type: null, sprite: 'aceTrainer',
    pool: [445,448,350,430,460,468] },
  { id: 'stage5_boss', name: 'N', type: null, sprite: 'aceTrainer',
    pool: [571,600,584,565,537,635] },
  // Stages 6+ final boss — mixed elite team
  { id: 'elite_alltype', name: 'Elite Master', type: null, sprite: 'aceTrainer',
    pool: [130,149,59,65,94,143,6,131,248,376,373,445,380,381,384,385,448,571,635,637] },
];

const STAGE_BOSS_ARCHETYPE = ['', 'stage1_boss', 'stage2_boss', 'stage3_boss', 'stage4_boss', 'stage5_boss'];

// ── Fixed stage teams ─────────────────────────────────────────────────────────

// Hand-crafted trainer teams per stage+region. Each trainer spec:
//   { name, type, sprite, ids[], extraLevels?: { pokemonIndex: extraLvl } }
// Level per pokemon = baseLevel + positionIndex + (extraLevels[index] ?? 0)
const FIXED_STAGE_REGIONS = {
  1: [
    [ // Region 1
      { name: 'Erika',  type: 'Grass', sprite: 'erika-lgpe',   ids: [69, 1] },
      { name: 'Misty',  type: 'Water', sprite: 'misty-lgpe',   ids: [61, 8] },
      { name: 'Flint',  type: 'Fire',  sprite: 'flint',        ids: [126, 58, 5] },
    ],
    [ // Region 2
      { name: 'Falkner', type: 'Flying',       sprite: 'falkner',      ids: [85, 22, 18] },
      { name: 'Bugsy',   type: 'Bug',          sprite: 'bugsy',        ids: [12, 15, 127, 123] },
      { name: 'Lorelei', type: 'Ice/Electric', sprite: 'lorelei-lgpe', ids: [124, 125, 131, 101, 135] },
    ],
    [ // Region 3
      { name: 'Sabrina',    type: 'Psychic/Grass', sprite: 'sabrina-gen3', ids: [71, 103, 121, 80, 122, 65] },
      { name: 'Agatha',     type: 'Ghost/Poison',  sprite: 'agatha-lgpe',  ids: [89, 73, 71, 45, 93, 94] },
      // Ash: Pikachu (last slot) gets +5 extra levels; traitBonus=1 means 1 less Pokémon needed per trait tier
      { name: 'Ash Ketchum', type: null, sprite: 'ash-johto', ids: [143, 196, 3, 9, 6, 25], extraLevels: { 5: 5 }, traitBonus: 1 },
    ],
  ],
  2: [
    [ // Region 1
      { name: 'Volkner', type: 'Electric',      sprite: 'volkner',      ids: [172, 180, 239] },
      { name: 'Janine',  type: 'Poison',        sprite: 'janine',       ids: [211, 167, 41] },
      { name: 'Jasmine', type: 'Steel',         sprite: 'jasmine',      ids: [205, 227, 208, 212] },
    ],
    [ // Region 2
      { name: 'Whitney', type: 'Normal',        sprite: 'whitney',      ids: [241, 162, 164, 217, 203, 242] },
      { name: 'Brock',   type: 'Rock',          sprite: 'brock-lgpe',   ids: [185, 219, 222, 112, 95, 248] },
      { name: 'Sabrina', type: 'Grass/Psychic', sprite: 'sabrina-lgpe', ids: [102, 154, 192, 65, 196, 251] },
    ],
    [ // Region 3
      { name: 'Blaine',  type: 'Fire/Flying',   sprite: 'blaine',       ids: [157, 219, 38, 6, 244, 250] },
      { name: 'Eusine',  type: 'Water/Flying',  sprite: 'eusine',       ids: [184, 178, 176, 199, 245, 249] },
      // Silver: Crobat (last slot) gets +5 extra levels
      { name: 'Silver',  type: null,            sprite: 'silver-masters', ids: [215, 160, 82, 94, 65, 169], extraLevels: { 5: 5 }, traitBonus: 1 },
    ],
  ],
  3: [
    [ // Region 1
      { name: 'Gardenia', type: 'Grass',       sprite: 'gardenia-masters', ids: [252, 315] },
      { name: 'Glacia',   type: 'Ice/Water',   sprite: 'glacia',           ids: [87, 131, 365] },
      { name: 'Brawly',   type: 'Fighting',    sprite: 'brawly',           ids: [257, 297, 214, 308] },
    ],
    [ // Region 2
      { name: 'Wattson',  type: 'Electric',    sprite: 'wattson',          ids: [239, 25, 181, 135, 310] },
      { name: 'Phoebe',   type: 'Ghost',       sprite: 'phoebe-masters',   ids: [354, 302, 353, 200, 356, 94] },
      { name: 'Juan',     type: 'Water/Rock',  sprite: 'juan',             ids: [340, 222, 141, 260, 139, 369] },
    ],
    [ // Region 3
      { name: 'Drake',    type: 'Dragon',      sprite: 'drake-gen3',       ids: [334, 149, 330, 230, 373, 384] },
      { name: 'Anabel',   type: 'Psychic',     sprite: 'anabel-gen7',      ids: ['deoxys-attack', 'deoxys-speed', 386, 'deoxys-defense', 380, 381] },
      // Steven: 6 Steel Pokémon + traitBonus 2 = T5 Steel (75% damage reduction)
      { name: 'Steven Stone', type: 'Steel',   sprite: 'steven-gen6',      ids: [376, 376, 376, 306, 212, 385], traitBonus: 2 },
    ],
  ],
  4: [
    [ // Region 1
      { name: 'Koga',     type: 'Poison',   sprite: 'koga',             ids: [92, 93, 41, 42, 315, 2] },
      // Aaron: Bug team with +3 extra levels across all members
      { name: 'Aaron',    type: 'Bug',      sprite: 'aaron',            ids: [267, 12, 123, 291, 416, 469], levelBonus: 3 },
      { name: 'Clemont',  type: 'Electric', sprite: 'clemont',          ids: [417, 172, 179, 403, 312, 311] },
    ],
    [ // Region 2
      { name: 'Bertha',   type: 'Ground',   sprite: 'bertha',           ids: [323, 472, 464, 330, 450, 383] },
      { name: 'Gardenia', type: 'Grass',    sprite: 'gardenia-masters', ids: [492, 470, 357, 389, 251, 'shaymin-sky'] },
      { name: 'Lucian',   type: 'Psychic',  sprite: 'lucian',           ids: [482, 480, 481, 282, 475, 488] },
    ],
    [ // Region 3
      { name: 'Cyrus',        type: 'Dragon/Steel', sprite: 'cyrus',   ids: [395, 485, 483, 484, 487, 'charizard-mega-x'] },
      // Arceus: 1 Pokémon +20 levels, every trait in the game at T1
      { name: 'Arceus',       type: 'Normal',       sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/493.png', ids: [493], levelBonus: 20, allTraits: 1 },
      // Cynthia: mixed champion, traitBonus 1, +10 levels
      { name: 'Cynthia',      type: null,           sprite: 'cynthia', ids: [442, 407, 468, 448, 350, 445], levelBonus: 10, traitBonus: 1 },
    ],
  ],
  5: [
    [ // Region 1
      { name: 'Roark',   type: 'Rock',         sprite: 'roark',   ids: [138, 140, 408, 410, 564, 566] },
      { name: 'Marshal', type: 'Fire/Fighting', sprite: 'marshal', ids: [256, 391, 499, 257, 392, 500] },
      { name: 'Clay',    type: 'Ground/Water',  sprite: 'clay',    ids: [445, 472, 260, 537, 423, 340] },
    ],
    [ // Region 2
      { name: 'Grimsley', type: 'Dark',  sprite: 'grimsley',     ids: [359, 248, 319, 635, 553, 491] },
      { name: 'Colress',  type: 'Steel', sprite: 'colress',      ids: [448, 376, 485, 483, 638, 649] },
      // Iris: Dragon specialist, Rayquaza as +10 ace
      { name: 'Iris',     type: 'Dragon', sprite: 'iris-gen5bw2', ids: [334, 330, 230, 148, 484, 384], extraLevels: { 5: 10 } },
    ],
    [ // Region 3
      // Benga: Fire specialist, +3 levels across all members
      { name: 'Benga',   type: 'Fire', sprite: 'benga',   ids: [59, 6, 244, 250, 494, 637], levelBonus: 3 },
      // Ghetsis: Dragon T10 only, Black Kyurem +10 extra levels
      { name: 'Ghetsis', type: 'Dragon',      sprite: 'ghetsis', ids: [635, 621, 487, 373, 483, 'kyurem-black'], extraLevels: { 5: 10 }, specificTraits: { Dragon: 10 } },
      // N: +15 levels, Reshiram +9 extra to reach level 140, copies and upgrades player traits
      { name: 'N',       type: null,          sprite: 'n',       ids: [571, 584, 567, 609, 612, 643], levelBonus: 15, extraLevels: { 5: 9 }, copyPlayerTraits: true },
    ],
  ],
};

// Merge player and enemy base trait tiers for N's copyPlayerTraits mechanic.
// Each type gets max(playerTier, enemyTier) + 1, capped at that type's maxTier.
function computeMirroredTraits(playerTiers, enemyBaseTiers) {
  const result = {};
  const allTypes = new Set([...Object.keys(playerTiers), ...Object.keys(enemyBaseTiers)]);
  for (const type of allTypes) {
    const p = playerTiers[type] || 0;
    const e = enemyBaseTiers[type] || 0;
    const maxTier = TRAIT_DESCRIPTIONS[type]?.length ?? 3;
    const merged = Math.min(maxTier, Math.max(p, e) + 1);
    if (merged > 0) result[type] = merged;
  }
  return result;
}

function buildFixedRegion(stageNum, regionNum, fixedTrainers) {
  const moveTier = stageNum <= 1 ? 1 : 2;
  const trainers = fixedTrainers.map((spec, i) => {
    const isBigBoss = i === 2;
    const [, maxL] = getEndlessLevelRange(stageNum, regionNum, i);
    const levelOffsets = spec.ids.map((_, j) => j + (spec.levelBonus ?? 0) + ((spec.extraLevels && spec.extraLevels[j]) || 0));
    // Display the actual highest team level (ace), not just the floor's max —
    // levelBonus / extraLevels are applied per slot in battle.
    const displayLevel = maxL + Math.max(0, ...levelOffsets);
    // For the region panel tooltip, resolve form slugs to their numeric sprite IDs
    const displayIds = spec.ids.map(id =>
      typeof id === 'string' ? (POKEMON_FORM_SPRITE_IDS[id] ?? POKEMON_FORM_SLUGS[id] ?? id) : id
    );
    return {
      archetype: { id: `fixed_${stageNum}_${regionNum}_${i}`, name: spec.name, type: spec.type, sprite: spec.sprite },
      level: maxL,
      displayLevel,
      moveTier: isBigBoss ? moveTier + 1 : moveTier,
      teamSize: spec.ids.length,
      speciesIds: displayIds,  // numeric IDs for tooltip sprites
      fetchIds: spec.ids,      // original slugs/IDs for fetchPokemonById
      levelOffsets,
      traitBonus: spec.traitBonus ?? 0,
      allTraits: spec.allTraits ?? null,
      specificTraits: spec.specificTraits ?? null,
      copyPlayerTraits: spec.copyPlayerTraits ?? false,
    };
  });
  return { stageNum, regionNum, trainers };
}

// ── Region rolling ────────────────────────────────────────────────────────────

// Simple seeded RNG (mulberry32) — deterministic per stage+region so layouts never change.
function seededRng(seed) {
  let s = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

function rollRegion(stageNum, regionNum) {
  // Stage 1 (and future fixed stages) use hand-crafted teams
  const fixedRegionSpecs = FIXED_STAGE_REGIONS[stageNum]?.[regionNum - 1];
  if (fixedRegionSpecs) return buildFixedRegion(stageNum, regionNum, fixedRegionSpecs);

  const moveTier = stageNum <= 1 ? 1 : 2;
  const srng = seededRng(stageNum * 1000 + regionNum);
  const maxGenId = getEndlessMaxGenId(stageNum);

  // Shuffle all regular archetypes deterministically (exclude boss/elite entries)
  const bossIds = new Set(['elite_alltype', 'stage1_boss', 'stage2_boss', 'stage3_boss', 'stage4_boss', 'stage5_boss']);
  const regularPool = ENDLESS_ARCHETYPES.filter(a => !bossIds.has(a.id));
  const shuffled = [...regularPool].sort(() => srng() - 0.5);

  const slotBase = (regionNum - 1) * 3;
  const noLegend = id => !LEGENDARY_ID_SET.has(id);

  const regularBosses = shuffled.slice(0, 2).map((arch, i) => {
    const [, maxL] = getEndlessLevelRange(stageNum, regionNum, i);
    const level = maxL;
    const teamSize = ENDLESS_TEAM_SIZES[slotBase + i] ?? 4;
    const eligible = arch.pool.filter(id => id <= maxGenId && noLegend(id) && minLevelForSpecies(id) <= level);
    const fallback = arch.pool.filter(id => id <= maxGenId && noLegend(id));
    const srcPool = eligible.length ? eligible : (fallback.length ? fallback : arch.pool.filter(id => id <= maxGenId && noLegend(id)).concat(arch.pool.filter(noLegend)).slice(0, 6));
    const ids = [...srcPool].sort(() => srng() - 0.5).slice(0, teamSize);
    const levelOffsets = ids.map((_, j) => j);
    return { archetype: arch, level, moveTier, teamSize, speciesIds: ids, levelOffsets };
  });

  // Region 3 big boss: use stage-specific boss for stages 1-5, elite_alltype for 6+
  const isFinalRegion = regionNum === 3;
  let bigBossArch;
  if (isFinalRegion) {
    const stageBossId = STAGE_BOSS_ARCHETYPE[stageNum];
    bigBossArch = stageBossId
      ? ENDLESS_ARCHETYPES.find(a => a.id === stageBossId)
      : ENDLESS_ARCHETYPES.find(a => a.id === 'elite_alltype');
  } else {
    bigBossArch = shuffled[2] || regularPool[0];
  }
  const [, bigMaxL] = getEndlessLevelRange(stageNum, regionNum, 2);
  const bigBossLevel = bigMaxL;
  const bigBossTeamSize = ENDLESS_TEAM_SIZES[slotBase + 2] ?? 6;
  // Stage bosses (1-5) skip gen and legendary filters (hand-curated pools).
  // Elite (6+) allows legendaries but still caps at gen 5.
  const isStageBoss = isFinalRegion && stageNum <= 5;
  const bigBossFilter = id =>
    minLevelForSpecies(id) <= bigBossLevel &&
    (isFinalRegion || noLegend(id)) &&
    (isStageBoss || id <= maxGenId);
  const bigBossEligible = bigBossArch.pool.filter(bigBossFilter);
  const bigBossSrcPool = bigBossEligible.length ? bigBossEligible : bigBossArch.pool;
  const bigBossIds = [...bigBossSrcPool].sort(() => srng() - 0.5).slice(0, bigBossTeamSize);
  const bigBossLevelOffsets = bigBossIds.map((_, j) => j);
  const bigBoss = {
    archetype: bigBossArch,
    level: bigBossLevel,
    moveTier: moveTier + 1,
    teamSize: bigBossTeamSize,
    speciesIds: bigBossIds,
    levelOffsets: bigBossLevelOffsets,
  };

  return {
    stageNum,
    regionNum,
    trainers: [...regularBosses, bigBoss],
  };
}

// ── Trait computation ─────────────────────────────────────────────────────────

// Returns { Fire: 2, Water: 1, ... } — tier per type (1/2/3), omits inactive types.
// Shiny pokemon count as 2 of each of their types.
function computeTraitTiers(team, tierBonus = 0) {
  const counts = {};
  for (const p of team) {
    const multiplier = p.isShiny ? 2 : 1;
    for (const t of (p.types || [])) {
      counts[t] = (counts[t] || 0) + multiplier;
    }
  }
  const tiers = {};
  for (const [type, count] of Object.entries(counts)) {
    if (count === 0) continue;
    const maxTier = TRAIT_DESCRIPTIONS[type]?.length ?? 3;
    const tier = Math.min(maxTier, Math.floor(count / 2) + tierBonus);
    if (tier > 0) tiers[type] = tier;
  }
  return tiers;
}

// ── Trait config builder ──────────────────────────────────────────────────────

// Returns a traitsConfig object to pass to runBattle, or null if no active traits.
// enemyTiers is optional — pass it for boss fights so the enemy also benefits from type traits.
function buildTraitsConfig(playerTiers, enemyTiers = {}) {
  playerTiers = playerTiers || {};
  enemyTiers  = enemyTiers  || {};
  if (!Object.keys(playerTiers).length && !Object.keys(enemyTiers).length) return null;

  const tierFor   = (type, side) => ((side === 'player' ? playerTiers : enemyTiers)[type] || 0);
  const activeFor = (type, side) => tierFor(type, side) >= 1;
  const sc = v => v;
  const sp = v => v;
  const sf = v => v;

  return {

    onStartFight(pTeam, eTeam, log) {
      for (const [side, myTeam, theirTeam] of [['player', pTeam, eTeam], ['enemy', eTeam, pTeam]]) {
        const oppSide = side === 'player' ? 'enemy' : 'player';

        // Fire: +tier ATK and Sp.ATK to whole team
        if (activeFor('Fire', side)) {
          const tier = tierFor('Fire', side);
          const boost = sc(tier);
          const alive = myTeam.map((p, i) => ({ p, i })).filter(x => x.p.currentHp > 0);
          for (const { p, i } of alive)
            log.push({ type: 'trait_trigger', traitType: 'Fire', side, idx: i,
              name: p.nickname || p.name, description: `Fire Trait T${tier}: +ATK & Sp.ATK!` });
          for (const { p, i } of alive) {
            applyStageChange(p, 'atk',     boost, side, i, log);
            applyStageChange(p, 'special', boost, side, i, log);
          }
        }

        // Ground: +tier*2 DEF to whole team
        if (activeFor('Ground', side)) {
          const tier = tierFor('Ground', side);
          const boost = sc(tier * 2);
          const alive = myTeam.map((p, i) => ({ p, i })).filter(x => x.p.currentHp > 0);
          for (const { p, i } of alive)
            log.push({ type: 'trait_trigger', traitType: 'Ground', side, idx: i,
              name: p.nickname || p.name, description: `Ground Trait T${tier}: +DEF!` });
          for (const { p, i } of alive)
            applyStageChange(p, 'def', boost, side, i, log);
        }

        // Fairy: opposing team gets -tier ATK and Sp.ATK
        if (activeFor('Fairy', side)) {
          const tier = tierFor('Fairy', side);
          const boost = sc(tier);
          const myAlive    = myTeam.map((p, i) => ({ p, i })).filter(x => x.p.currentHp > 0);
          const theirAlive = theirTeam.map((p, i) => ({ p, i })).filter(x => x.p.currentHp > 0);
          for (const { p, i } of myAlive)
            log.push({ type: 'trait_trigger', traitType: 'Fairy', side, idx: i,
              name: p.nickname || p.name, description: `Fairy Trait T${tier}: Charmed enemies!` });
          for (const { p, i } of theirAlive) {
            applyStageChange(p, 'atk',     -boost, oppSide, i, log);
            applyStageChange(p, 'special', -boost, oppSide, i, log);
          }
        }

        // Normal: +25/50/100% max HP bonus to whole team
        if (activeFor('Normal', side)) {
          const tier = tierFor('Normal', side);
          const pct = sf([0, 0.25, 0.50, 1.00][tier]);
          const alive = myTeam.map((p, i) => ({ p, i })).filter(x => x.p.currentHp > 0);
          for (const { p, i } of alive)
            log.push({ type: 'trait_trigger', traitType: 'Normal', side, idx: i,
              name: p.nickname || p.name, description: `Normal Trait T${tier}: +${Math.round(pct*100)}% HP!` });
          for (const { p, i } of alive) {
            const bonus = Math.floor(p.maxHp * pct);
            p.maxHp += bonus;
            p.currentHp = Math.min(p.currentHp + bonus, p.maxHp);
            log.push({ type: 'effect', side, idx: i, name: p.nickname || p.name,
              hpChange: bonus, hpAfter: p.currentHp, newMaxHp: p.maxHp, reason: `Normal Trait: +${bonus} max HP!` });
          }
        }
      }
    },

    onBeforeAttack(attacker, aIdx, aSide, target, tIdx, tSide, log, pTeam, eTeam) {
      // Dark: enemy has a chance to hurt itself in confusion instead of attacking
      if (activeFor('Dark', 'player') && aSide === 'enemy' && attacker.currentHp > 0) {
        const tier = tierFor('Dark', 'player');
        const chance = [0, 0.05, 0.10, 0.15][tier];
        if (rng() < chance) {
          const selfDmg = Math.max(1, Math.floor(attacker.maxHp * 0.10));
          attacker.currentHp = Math.max(0, attacker.currentHp - selfDmg);
          log.push({ type: 'confusion', side: aSide, idx: aIdx,
            name: attacker.nickname || attacker.name,
            hpChange: -selfDmg, hpAfter: attacker.currentHp });
          if (attacker.currentHp === 0) {
            log.push({ type: 'faint', side: aSide, idx: aIdx, name: attacker.nickname || attacker.name });
          } else if (activeFor('Ghost', 'player')) {
            const ghostTier = tierFor('Ghost', 'player');
            const threshold = sp([0, 0.15, 0.30, 0.50][ghostTier]);
            if (attacker.currentHp / attacker.maxHp < threshold) {
              const execDmg = attacker.currentHp;
              attacker.currentHp = 0;
              const ghostActive = pTeam.map((p, i) => ({ p, i })).find(x => x.p.currentHp > 0);
              if (ghostActive) {
                log.push({ type: 'trait_trigger', traitType: 'Ghost', side: 'player', idx: ghostActive.i,
                  name: ghostActive.p.nickname || ghostActive.p.name, description: `Ghost Trait T${ghostTier}: Execute!` });
              }
              log.push({ type: 'effect', side: aSide, idx: aIdx, name: attacker.nickname || attacker.name,
                hpChange: -execDmg, hpAfter: 0, reason: `Ghost Trait: executed!` });
              log.push({ type: 'faint', side: aSide, idx: aIdx, name: attacker.nickname || attacker.name });
            }
          }
          return true;
        }
      }
      return false;
    },

    afterAttack(attacker, aIdx, aSide, target, tIdx, tSide, damage, log, pTeam, eTeam) {
      if (damage <= 0) return;

      // Collect triggers and effects separately so all trait_triggers are consecutive
      // in the log (enabling simultaneous batch animation), matching onStartFight pattern.
      const triggers = [];
      const efx = [];

      // Electric: 15/30/45% chance to deal the same damage again
      if (activeFor('Electric', aSide) && !attacker._electricBonusFired) {
        const tier = tierFor('Electric', aSide);
        const chance = sp([0, 0.15, 0.30, 0.45][tier]);
        if (rng() < chance) {
          attacker._electricBonusFired = true;
          target.currentHp = Math.max(0, target.currentHp - damage);
          triggers.push({ type: 'trait_trigger', traitType: 'Electric', side: aSide, idx: aIdx,
            name: attacker.nickname || attacker.name, description: `Electric Trait T${tier}: Second hit!` });
          efx.push({ type: 'effect', side: tSide, idx: tIdx, name: target.nickname || target.name,
            hpChange: -damage, hpAfter: target.currentHp, reason: `Electric Trait: −${damage} HP` });
          attacker._electricBonusFired = false;
        }
      }

      // Ghost: execute target below HP threshold
      if (activeFor('Ghost', aSide) && tSide !== aSide && target.currentHp > 0) {
        const tier = tierFor('Ghost', aSide);
        const threshold = sp([0, 0.15, 0.30, 0.50][tier]);
        if (target.currentHp / target.maxHp < threshold) {
          const execDmg = target.currentHp;
          target.currentHp = 0;
          triggers.push({ type: 'trait_trigger', traitType: 'Ghost', side: aSide, idx: aIdx,
            name: attacker.nickname || attacker.name, description: `Ghost Trait T${tier}: Execute!` });
          efx.push({ type: 'effect', side: tSide, idx: tIdx, name: target.nickname || target.name,
            hpChange: -execDmg, hpAfter: 0, reason: `Ghost Trait: executed!` });
        }
      }

      // Grass: heal % of dealt damage
      if (activeFor('Grass', aSide) && attacker.currentHp > 0) {
        const tier = tierFor('Grass', aSide);
        const pct = sf([0, 0.05, 0.10, 0.15][tier]);
        const heal = Math.max(1, Math.floor(damage * pct));
        const actual = Math.min(heal, attacker.maxHp - attacker.currentHp);
        if (actual > 0) {
          attacker.currentHp += actual;
          triggers.push({ type: 'trait_trigger', traitType: 'Grass', side: aSide, idx: aIdx,
            name: attacker.nickname || attacker.name, description: `Grass Trait T${tier}: healed ${actual}!` });
          efx.push({ type: 'effect', side: aSide, idx: aIdx, name: attacker.nickname || attacker.name,
            hpChange: actual, hpAfter: attacker.currentHp, reason: `Grass Trait: +${actual} HP` });
        }
      }

      // Ice: chance to freeze target
      if (activeFor('Ice', aSide) && tSide !== aSide && target.currentHp > 0 && !target.status) {
        const tier = tierFor('Ice', aSide);
        const chance = sp([0, 0.15, 0.30, 0.45][tier]);
        if (rng() < chance) {
          applyStatus(target, 'freeze', tSide, tIdx, efx);
          triggers.push({ type: 'trait_trigger', traitType: 'Ice', side: aSide, idx: aIdx,
            name: attacker.nickname || attacker.name, description: `Ice Trait T${tier}: Froze enemy!` });
        }
      }

      // Poison: chance to poison target
      if (activeFor('Poison', aSide) && tSide !== aSide && target.currentHp > 0 && !target.status) {
        const tier = tierFor('Poison', aSide);
        const chance = sp([0, 0.33, 0.66, 1.00][tier]);
        if (rng() < chance) {
          applyStatus(target, 'poison', tSide, tIdx, efx);
          triggers.push({ type: 'trait_trigger', traitType: 'Poison', side: aSide, idx: aIdx,
            name: attacker.nickname || attacker.name, description: `Poison Trait T${tier}: Poisoned!` });
        }
      }

      // Rock: 33/66/100% chance of +1/+2/+3 DEF and Sp.DEF to attacker after each attack
      if (activeFor('Rock', aSide) && attacker.currentHp > 0) {
        const rockTier = tierFor('Rock', aSide);
        if (rng() < sp(rockTier / 3)) {
          const boost = sc(rockTier);
          triggers.push({ type: 'trait_trigger', traitType: 'Rock', side: aSide, idx: aIdx,
            name: attacker.nickname || attacker.name, description: `Rock Trait: +${boost} DEF, +${boost} Sp.DEF!` });
          applyStageChange(attacker, 'def',   boost, aSide, aIdx, efx);
          applyStageChange(attacker, 'spdef', boost, aSide, aIdx, efx);
        }
      }

      // Water: 33/66/100% chance to apply -tier Speed, ATK, Sp.ATK to target
      if (activeFor('Water', aSide) && tSide !== aSide && target.currentHp > 0) {
        const tier = tierFor('Water', aSide);
        if (rng() < sp(tier / 3)) {
          const boost = sc(tier);
          triggers.push({ type: 'trait_trigger', traitType: 'Water', side: aSide, idx: aIdx,
            name: attacker.nickname || attacker.name, description: `Water Trait T${tier}: debuffed enemy!` });
          applyStageChange(target, 'speed',   -boost, tSide, tIdx, efx);
          applyStageChange(target, 'atk',     -boost, tSide, tIdx, efx);
          applyStageChange(target, 'special', -boost, tSide, tIdx, efx);
        }
      }

      // Psychic: 10/20/30% splash to all other members of target's team
      if (activeFor('Psychic', aSide) && tSide !== aSide) {
        const tier = tierFor('Psychic', aSide);
        const targetTeam = tSide === 'enemy' ? eTeam : pTeam;
        const splash = Math.max(1, Math.floor(damage * sf([0, 0.10, 0.20, 0.30][tier])));
        for (let i = 0; i < targetTeam.length; i++) {
          if (i === tIdx || targetTeam[i].currentHp <= 0) continue;
          targetTeam[i].currentHp = Math.max(0, targetTeam[i].currentHp - splash);
          triggers.push({ type: 'trait_trigger', traitType: 'Psychic', side: tSide, idx: i,
            name: targetTeam[i].nickname || targetTeam[i].name, description: `Psychic Trait: ${splash} splash!` });
          efx.push({ type: 'effect', side: tSide, idx: i, name: targetTeam[i].nickname || targetTeam[i].name,
            hpChange: -splash, hpAfter: targetTeam[i].currentHp, reason: `Psychic Trait: −${splash} HP` });
          if (targetTeam[i].currentHp === 0)
            efx.push({ type: 'faint', side: tSide, idx: i, name: targetTeam[i].nickname || targetTeam[i].name });
          // Ghost: execute splashed target below threshold
          if (activeFor('Ghost', aSide) && targetTeam[i].currentHp > 0) {
            const ghostTier = tierFor('Ghost', aSide);
            const threshold = sp([0, 0.15, 0.30, 0.50][ghostTier]);
            if (targetTeam[i].currentHp / targetTeam[i].maxHp < threshold) {
              const execDmg = targetTeam[i].currentHp;
              targetTeam[i].currentHp = 0;
              triggers.push({ type: 'trait_trigger', traitType: 'Ghost', side: aSide, idx: aIdx,
                name: attacker.nickname || attacker.name, description: `Ghost Trait T${ghostTier}: Execute!` });
              efx.push({ type: 'effect', side: tSide, idx: i, name: targetTeam[i].nickname || targetTeam[i].name,
                hpChange: -execDmg, hpAfter: 0, reason: `Ghost Trait: executed!` });
              efx.push({ type: 'faint', side: tSide, idx: i, name: targetTeam[i].nickname || targetTeam[i].name });
            }
          }
          // Grass trait heals off splash damage dealt
          if (activeFor('Grass', aSide) && attacker.currentHp > 0) {
            const grassTier = tierFor('Grass', aSide);
            const heal = Math.max(1, Math.floor(splash * sf([0, 0.05, 0.10, 0.15][grassTier])));
            const actual = Math.min(heal, attacker.maxHp - attacker.currentHp);
            if (actual > 0) {
              attacker.currentHp += actual;
              efx.push({ type: 'effect', side: aSide, idx: aIdx, name: attacker.nickname || attacker.name,
                hpChange: actual, hpAfter: attacker.currentHp, reason: `Grass Trait: +${actual} HP (splash)` });
            }
          }
        }
      }

      for (const e of triggers) log.push(e);
      for (const e of efx) log.push(e);
    },

    afterStatusTick(target, tIdx, tSide, log, pTeam, eTeam) {
      // Ghost: execute target below threshold after a poison tick
      const oppSide = tSide === 'player' ? 'enemy' : 'player';
      if (!activeFor('Ghost', oppSide) || target.currentHp <= 0) return;
      const tier = tierFor('Ghost', oppSide);
      const threshold = sp([0, 0.15, 0.30, 0.50][tier]);
      if (target.currentHp / target.maxHp < threshold) {
        const execDmg = target.currentHp;
        target.currentHp = 0;
        const oppTeam = oppSide === 'player' ? pTeam : eTeam;
        const activeOpp = oppTeam.map((p, i) => ({ p, i })).find(x => x.p.currentHp > 0);
        if (activeOpp) {
          log.push({ type: 'trait_trigger', traitType: 'Ghost', side: oppSide, idx: activeOpp.i,
            name: activeOpp.p.nickname || activeOpp.p.name, description: `Ghost Trait T${tier}: Execute!` });
        }
        log.push({ type: 'effect', side: tSide, idx: tIdx, name: target.nickname || target.name,
          hpChange: -execDmg, hpAfter: 0, reason: `Ghost Trait: executed!` });
        log.push({ type: 'faint', side: tSide, idx: tIdx, name: target.nickname || target.name });
      }
    },

    beforeDamage(defender, dIdx, dSide, attacker, aIdx, aSide, damage, log) {
      // Steel: reduce damage before it's applied
      if (activeFor('Steel', dSide) && damage > 0) {
        const tier = tierFor('Steel', dSide);
        const reduction = Math.floor(damage * sf([0, 0.15, 0.30, 0.45, 0.60, 0.75][tier]));
        if (reduction > 0) {
          log.push({ type: 'trait_trigger', traitType: 'Steel', side: dSide, idx: dIdx,
            name: defender.nickname || defender.name, description: `Steel Trait T${tier}: −${reduction} damage!` });
          return damage - reduction;
        }
      }
      return damage;
    },

    whenAttacked(defender, dIdx, dSide, attacker, aIdx, aSide, damage, log) {
      // Flying: chance to retroactively dodge — heals back the damage taken
      // (capped at maxHp). Fires even on a KO from full HP, and even if the
      // defender is already at full HP (the log+animation still play).
      if (activeFor('Flying', dSide)) {
        const tier = tierFor('Flying', dSide);
        const chance = sp([0, 0.10, 0.15, 0.20][tier]);
        if (rng() < chance) {
          const hpBefore = defender.currentHp;
          defender.currentHp = Math.min(defender.maxHp, defender.currentHp + damage);
          const recovered = defender.currentHp - hpBefore;
          log.push({ type: 'trait_trigger', traitType: 'Flying', side: dSide, idx: dIdx,
            name: defender.nickname || defender.name, description: `Flying Trait T${tier}: Dodged!` });
          if (recovered > 0) {
            log.push({ type: 'effect', side: dSide, idx: dIdx, name: defender.nickname || defender.name,
              hpChange: recovered, hpAfter: defender.currentHp, reason: `Flying Trait: dodged! +${recovered} HP` });
          }
        }
      }
    },

    onKO(fainted, fIdx, fSide, killer, kIdx, kSide, log, pTeam, eTeam) {
      // Fighting: when a pokemon faints, surviving teammates on the same side get ATK boost
      if (activeFor('Fighting', fSide)) {
        const tier = tierFor('Fighting', fSide);
        const boost = sc(tier);
        const fTeam = fSide === 'player' ? pTeam : eTeam;
        const survivors = fTeam.map((p, i) => ({ p, i })).filter(x => x.p.currentHp > 0);
        const triggers = [];
        const efx = [];
        for (const { p, i } of survivors) {
          triggers.push({ type: 'trait_trigger', traitType: 'Fighting', side: fSide, idx: i,
            name: p.nickname || p.name, description: `Fighting Trait T${tier}: Rally!` });
          applyStageChange(p, 'atk',     boost, fSide, i, efx);
          applyStageChange(p, 'special', boost, fSide, i, efx);
        }
        for (const e of triggers) log.push(e);
        for (const e of efx) log.push(e);
      }

      // Dragon: killer gets +tier Speed, ATK, Sp.ATK on KO
      if (activeFor('Dragon', kSide) && killer.currentHp > 0) {
        const boost = sc(tierFor('Dragon', kSide));
        log.push({ type: 'trait_trigger', traitType: 'Dragon', side: kSide, idx: kIdx,
          name: killer.nickname || killer.name, description: `Dragon Trait T${tierFor('Dragon', kSide)}: +${boost} on KO!` });
        applyStageChange(killer, 'speed',   boost, kSide, kIdx, log);
        applyStageChange(killer, 'atk',     boost, kSide, kIdx, log);
        applyStageChange(killer, 'special', boost, kSide, kIdx, log);
      }
    },
  };
}

// ── Bug trait level bonus (applied post-fight in game.js) ─────────────────────

function getBugLevelBonus(tiers) {
  const tier = tiers['Bug'] || 0;
  if (tier === 0) return 0;
  const chance = [0, 0.20, 0.40, 0.80][tier];
  return rng() < chance ? 1 : 0;
}

// ── Persistence ───────────────────────────────────────────────────────────────

function saveEndlessState() {
  try { localStorage.setItem('poke_endless_state', JSON.stringify(endlessState)); } catch {}
}

function loadEndlessState() {
  try {
    const raw = localStorage.getItem('poke_endless_state');
    if (!raw) return false;
    endlessState = JSON.parse(raw);
    return true;
  } catch { return false; }
}

function clearEndlessState() {
  localStorage.removeItem('poke_endless_state');
}
