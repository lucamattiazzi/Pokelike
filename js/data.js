// data.js - Pokemon data, gym leaders, items, type chart

const TYPE_CHART = {
  //          Defending type →
  Normal:   { Normal:1,   Fire:1,   Water:1,   Electric:1,   Grass:1,   Ice:1,   Fighting:1,   Poison:1,   Ground:1, Flying:1,   Psychic:1,   Bug:1,   Rock:0.5, Ghost:0,   Dragon:1,   Dark:1,   Steel:0.5 },
  Fire:     { Normal:1,   Fire:0.5, Water:0.5, Electric:1,   Grass:2,   Ice:2,   Fighting:1,   Poison:1,   Ground:1, Flying:1,   Psychic:1,   Bug:2,   Rock:0.5, Ghost:1,   Dragon:0.5, Dark:1,   Steel:2   },
  Water:    { Normal:1,   Fire:2,   Water:0.5, Electric:1,   Grass:0.5, Ice:1,   Fighting:1,   Poison:1,   Ground:2, Flying:1,   Psychic:1,   Bug:1,   Rock:2,   Ghost:1,   Dragon:0.5, Dark:1,   Steel:1   },
  Electric: { Normal:1,   Fire:1,   Water:2,   Electric:0.5, Grass:0.5, Ice:1,   Fighting:1,   Poison:1,   Ground:0, Flying:2,   Psychic:1,   Bug:1,   Rock:1,   Ghost:1,   Dragon:0.5, Dark:1,   Steel:1   },
  Grass:    { Normal:1,   Fire:0.5, Water:2,   Electric:1,   Grass:0.5, Ice:1,   Fighting:1,   Poison:0.5, Ground:2, Flying:0.5, Psychic:1,   Bug:0.5, Rock:2,   Ghost:1,   Dragon:0.5, Dark:1,   Steel:0.5 },
  Ice:      { Normal:1,   Fire:0.5, Water:0.5, Electric:1,   Grass:2,   Ice:0.5, Fighting:1,   Poison:1,   Ground:2, Flying:2,   Psychic:1,   Bug:1,   Rock:1,   Ghost:1,   Dragon:2,   Dark:1,   Steel:0.5 },
  Fighting: { Normal:2,   Fire:1,   Water:1,   Electric:1,   Grass:1,   Ice:2,   Fighting:1,   Poison:0.5, Ground:1, Flying:0.5, Psychic:0.5, Bug:0.5, Rock:2,   Ghost:0,   Dragon:1,   Dark:2,   Steel:2   },
  Poison:   { Normal:1,   Fire:1,   Water:1,   Electric:1,   Grass:2,   Ice:1,   Fighting:1,   Poison:0.5, Ground:0.5, Flying:1, Psychic:1,   Bug:1,   Rock:0.5, Ghost:0.5, Dragon:1,   Dark:1,   Steel:0   },
  Ground:   { Normal:1,   Fire:2,   Water:1,   Electric:2,   Grass:0.5, Ice:1,   Fighting:1,   Poison:2,   Ground:1, Flying:0,   Psychic:1,   Bug:0.5, Rock:2,   Ghost:1,   Dragon:1,   Dark:1,   Steel:2   },
  Flying:   { Normal:1,   Fire:1,   Water:1,   Electric:0.5, Grass:2,   Ice:1,   Fighting:2,   Poison:1,   Ground:1, Flying:1,   Psychic:1,   Bug:2,   Rock:0.5, Ghost:1,   Dragon:1,   Dark:1,   Steel:0.5 },
  Psychic:  { Normal:1,   Fire:1,   Water:1,   Electric:1,   Grass:1,   Ice:1,   Fighting:2,   Poison:2,   Ground:1, Flying:1,   Psychic:0.5, Bug:1,   Rock:1,   Ghost:1,   Dragon:1,   Dark:0,   Steel:0.5 },
  Bug:      { Normal:1,   Fire:0.5, Water:1,   Electric:1,   Grass:2,   Ice:1,   Fighting:0.5, Poison:0.5, Ground:1, Flying:0.5, Psychic:2,   Bug:1,   Rock:1,   Ghost:0.5, Dragon:1,   Dark:2,   Steel:0.5 },
  Rock:     { Normal:1,   Fire:2,   Water:1,   Electric:1,   Grass:1,   Ice:2,   Fighting:0.5, Poison:1,   Ground:0.5, Flying:2, Psychic:1,   Bug:2,   Rock:1,   Ghost:1,   Dragon:1,   Dark:1,   Steel:0.5 },
  Ghost:    { Normal:0,   Fire:1,   Water:1,   Electric:1,   Grass:1,   Ice:1,   Fighting:1,   Poison:1,   Ground:1, Flying:1,   Psychic:2,   Bug:1,   Rock:1,   Ghost:2,   Dragon:1,   Dark:0.5, Steel:0.5 },
  Dragon:   { Normal:1,   Fire:1,   Water:1,   Electric:1,   Grass:1,   Ice:1,   Fighting:1,   Poison:1,   Ground:1, Flying:1,   Psychic:1,   Bug:1,   Rock:1,   Ghost:1,   Dragon:2,   Dark:1,   Steel:0.5 },
  Dark:     { Normal:1,   Fire:1,   Water:1,   Electric:1,   Grass:1,   Ice:1,   Fighting:0.5, Poison:1,   Ground:1, Flying:1,   Psychic:2,   Bug:1,   Rock:1,   Ghost:2,   Dragon:1,   Dark:0.5, Steel:0.5 },
  Steel:    { Normal:1,   Fire:0.5, Water:0.5, Electric:0.5, Grass:1,   Ice:2,   Fighting:1,   Poison:1,   Ground:1, Flying:1,   Psychic:1,   Bug:1,   Rock:2,   Ghost:1,   Dragon:1,   Dark:1,   Steel:0.5 },
};

function getTypeEffectiveness(attackType, defenderTypes) {
  let mult = 1;
  for (const dt of defenderTypes) {
    const cap = dt.charAt(0).toUpperCase() + dt.slice(1).toLowerCase();
    const atCap = attackType.charAt(0).toUpperCase() + attackType.slice(1).toLowerCase();
    if (TYPE_CHART[atCap] && TYPE_CHART[atCap][cap] !== undefined) {
      mult *= TYPE_CHART[atCap][cap];
    }
  }
  return mult;
}

// PokeAPI type ID map for type icon sprites
const TYPE_IDS = {
  Normal:1, Fighting:2, Flying:3, Poison:4, Ground:5, Rock:6, Bug:7, Ghost:8, Steel:9,
  Fire:10, Water:11, Grass:12, Electric:13, Psychic:14, Ice:15, Dragon:16, Dark:17, Steel:9, Fairy:18,
};

// Move pools by type — each has physical/special arrays of [tier0, tier1, tier2]
// Tier 0: weak early moves (~35–60 power), Tier 1: standard moves (~65–100), Tier 2: powerful moves (~100–150)
const MOVE_POOL = {
  Normal:   { physical: [{name:'Tackle',           power:40,  desc:'Charges the foe with a full-body tackle.'},
                         {name:'Body Slam',         power:85,  desc:'Slams the foe with the full weight of the body.'},
                         {name:'Giga Impact',       power:150, desc:'Charges the foe using every bit of its power.'}],
              special:  [{name:'Swift',             power:60,  desc:'Star-shaped rays that never miss the target.'},
                         {name:'Hyper Voice',       power:90,  desc:'Emits a piercing cry to strike the foe.'},
                         {name:'Boomburst',         power:140, desc:'Attacks everything with a destructive sound wave.'}] },
  Fire:     { physical: [{name:'Ember',             power:60,  desc:'A small flame scorches the foe.'},
                         {name:'Fire Punch',        power:75,  desc:'An incandescent punch that sears the foe.'},
                         {name:'Flare Blitz',       power:120, desc:'A full-force charge cloaked in searing flames.'}],
              special:  [{name:'Incinerate',        power:60,  desc:'Scorches the foe with an intense burst of fire.'},
                         {name:'Flamethrower',      power:90,  desc:'A scorching stream of fire engulfs the foe.'},
                         {name:'Fire Blast',        power:110, desc:'A fiery blast that scorches everything in its path.'}] },
  Water:    { physical: [{name:'Water Gun',         power:50,  desc:'Squirts water to attack the foe.'},
                         {name:'Waterfall',         power:80,  desc:'Charges the foe with tremendous force.'},
                         {name:'Aqua Tail',         power:110, desc:'Attacks by swinging its tail as if it were a wave.'}],
              special:  [{name:'Bubble',            power:50,  desc:'Fires a barrage of bubbles at the foe.'},
                         {name:'Surf',              power:80,  desc:'A giant wave crashes over the foe.'},
                         {name:'Hydro Pump',        power:110, desc:'Blasts the foe with a high-powered blast of water.'}] },
  Electric: { physical: [{name:'Spark',             power:40,  desc:'An electrified tackle that crackles with voltage.'},
                         {name:'Thunder Punch',     power:75,  desc:'An electrified punch that crackles with voltage.'},
                         {name:'Bolt Strike',       power:130, desc:'The user strikes the foe with a massive jolt of electricity.'}],
              special:  [{name:'Thunder Shock',     power:40,  desc:'A jolt of electricity zaps the foe.'},
                         {name:'Thunderbolt',       power:90,  desc:'A strong bolt of lightning strikes the foe.'},
                         {name:'Thunder',           power:110, desc:'A wicked thunderbolt is dropped on the foe.'}] },
  Grass:    { physical: [{name:'Vine Whip',         power:40,  desc:'Strikes the foe with slender, whiplike vines.'},
                         {name:'Razor Leaf',        power:65,  desc:'Sharp-edged leaves slice the foe to ribbons.'},
                         {name:'Power Whip',        power:120, desc:'The user violently whirls its vines to strike the foe.'}],
              special:  [{name:'Magical Leaf',      power:40,  desc:'A strange, mystical leaf that always hits the foe.'},
                         {name:'Energy Ball',       power:90,  desc:'Draws power from nature and fires it at the foe.'},
                         {name:'Solar Beam',        power:120, desc:'A full-power blast of concentrated solar energy.'}] },
  Ice:      { physical: [{name:'Powder Snow',       power:40,  desc:'Blows a chilling gust of powdery snow at the foe.'},
                         {name:'Ice Punch',         power:75,  desc:'An ice-cold punch that may freeze the foe.'},
                         {name:'Icicle Crash',      power:110, desc:'Large icicles crash down on the foe.'}],
              special:  [{name:'Icy Wind',          power:40,  desc:'A chilling attack that also lowers the foe\'s Speed.'},
                         {name:'Ice Beam',          power:90,  desc:'A frigid ray of ice that may freeze the foe.'},
                         {name:'Blizzard',          power:110, desc:'Summons a howling blizzard to strike the foe.'}] },
  Fighting: { physical: [{name:'Karate Chop',       power:50,  desc:'A precise chopping strike to the foe.'},
                         {name:'Cross Chop',        power:100, desc:'Delivers a double chop with crossed forearms.'},
                         {name:'Close Combat',      power:120, desc:'An all-out brawl unleashing maximum power.'}],
              special:  [{name:'Force Palm',        power:60,  desc:'Fires a shock wave from the user\'s palm.'},
                         {name:'Aura Sphere',       power:80,  desc:'Focuses aura energy into a perfect, unavoidable sphere.'},
                         {name:'Focus Blast',       power:120, desc:'Hurls a concentrated blast of energy at the foe.'}] },
  Poison:   { physical: [{name:'Poison Sting',      power:40,  desc:'Stabs the foe with a venomous stinger.'},
                         {name:'Poison Jab',        power:90,  desc:'Stabs the foe with a toxic spike.'},
                         {name:'Gunk Shot',         power:130, desc:'Hurls garbage at the foe to inflict damage.'}],
              special:  [{name:'Acid',              power:40,  desc:'Sprays the foe with a toxic acid liquid.'},
                         {name:'Sludge Bomb',       power:100, desc:'Hurls unsanitary sludge at the foe.'},
                         {name:'Acid Spray',        power:120, desc:'Spits fluid that corrodes and eats away at the foe.'}] },
  Ground:   { physical: [{name:'Mud Shot',           power:55,  desc:'Hurls a blob of mud at the foe.'},
                         {name:'Earthquake',        power:100, desc:'A massive quake shakes everything around.'},
                         {name:'Precipice Blades',  power:120, desc:'Controls the power of nature to attack with sharp blades.'}],
              special:  [{name:'Bulldoze',          power:60,  desc:'Stomps down on the ground and attacks everything nearby.'},
                         {name:'Earth Power',       power:90,  desc:'The earth erupts with force from directly below.'},
                         {name:'Land\'s Wrath',     power:110, desc:'Gathers the energy of the land and uses it to attack.'}] },
  Flying:   { physical: [{name:'Peck',              power:50,  desc:'Jabs the foe with a sharply pointed beak.'},
                         {name:'Aerial Ace',        power:60,  desc:'An extremely fast attack that never misses.'},
                         {name:'Sky Attack',        power:140, desc:'A swooping high-speed attack from above.'}],
              special:  [{name:'Gust',              power:40,  desc:'Strikes the foe with a gust of wind.'},
                         {name:'Air Slash',         power:75,  desc:'Slashes with a blade of pressurized air.'},
                         {name:'Hurricane',         power:110, desc:'Whips up a hurricane to slam the foe.'}] },
  Psychic:  { physical: [{name:'Confusion',         power:50,  desc:'A telekinetic attack that may cause confusion.'},
                         {name:'Zen Headbutt',      power:80,  desc:'Focuses willpower and charges headfirst.'},
                         {name:'Psycho Boost',      power:140, desc:'Attacks the foe at full power. Sharply lowers the user\'s Sp. Atk.'}],
              special:  [{name:'Psybeam',           power:65,  desc:'Fires a peculiar ray that may leave the foe confused.'},
                         {name:'Psychic',           power:90,  desc:'A powerful psychic force attacks the foe\'s mind.'},
                         {name:'Psystrike',         power:100, desc:'Materializes a peculiar psychic wave to attack the foe\'s physical bulk.'}] },
  Bug:      { physical: [{name:'Bug Bite',          power:60,  desc:'Bites the foe with powerful mandibles.'},
                         {name:'X-Scissor',         power:80,  desc:'Slashes the foe with crossed, scissor-like claws.'},
                         {name:'Megahorn',          power:120, desc:'Using its tough and impressive horn, the user rams the foe.'}],
              special:  [{name:'Struggle Bug',      power:50,  desc:'The user struggles against the foe with bug energy.'},
                         {name:'Bug Buzz',          power:90,  desc:'Vibrates wings to generate a damaging buzz.'},
                         {name:'Pollen Puff',       power:110, desc:'Attacks the foe with an explosive pollen bomb.'}] },
  Rock:     { physical: [{name:'Rock Throw',        power:50,  desc:'Picks up and throws a small rock at the foe.'},
                         {name:'Rock Slide',        power:75,  desc:'Large boulders are hurled at the foe.'},
                         {name:'Stone Edge',        power:100, desc:'Stabs the foe with a sharpened stone.'}],
              special:  [{name:'Smack Down',        power:50,  desc:'The user throws a stone to knock the foe down.'},
                         {name:'Power Gem',         power:80,  desc:'Attacks with rays of light generated by gems.'},
                         {name:'Rock Wrecker',      power:150, desc:'Hurls a large boulder at the foe with enormous force.'}] },
  Ghost:    { physical: [{name:'Astonish',          power:40,  desc:'Attacks by astonishing the foe to make it flinch.'},
                         {name:'Shadow Claw',       power:70,  desc:'Slashes with a wicked claw made of shadows.'},
                         {name:'Phantom Force',     power:90,  desc:'Vanishes, then strikes the foe on the next turn.'}],
              special:  [{name:'Lick',              power:40,  desc:'Licks the foe with a long tongue to inflict damage.'},
                         {name:'Shadow Ball',       power:80,  desc:'Hurls a blob of dark energy at the foe.'},
                         {name:'Shadow Force',      power:100, desc:'Disappears, then strikes everything on the next turn.'}] },
  Dragon:   { physical: [{name:'Twister',           power:40,  desc:'Whips up a powerful twister of draconic energy.'},
                         {name:'Dragon Claw',       power:80,  desc:'Slashes the foe with razor-sharp dragon claws.'},
                         {name:'Outrage',           power:120, desc:'Rampages and attacks the foe with intense dragon fury.'}],
              special:  [{name:'Dragon Breath',     power:60,  desc:'Exhales a scorching gust of dragon energy.'},
                         {name:'Dragon Pulse',      power:85,  desc:'Fires a shockwave of draconic energy.'},
                         {name:'Draco Meteor',      power:130, desc:'Comets are rained down on the foe. Sharply lowers the user\'s Sp. Atk.'}] },
  Dark:     { physical: [{name:'Bite',              power:40,  desc:'Bites the foe with viciously sharp fangs.'},
                         {name:'Crunch',            power:80,  desc:'Crunches with sharp fangs. May lower the foe\'s Defense.'},
                         {name:'Knock Off',         power:120, desc:'Knocks down the foe\'s held item to boost damage.'}],
              special:  [{name:'Snarl',             power:40,  desc:'Yells and snarls at the foe to lower its Sp. Atk.'},
                         {name:'Dark Pulse',        power:80,  desc:'Fires a horrible aura of dark energy at the foe.'},
                         {name:'Night Daze',        power:110, desc:'Lets loose a pitch-black shockwave of dark energy.'}] },
  Steel:    { physical: [{name:'Metal Claw',        power:50,  desc:'Attacks with steel-hard claws. May raise the user\'s Attack.'},
                         {name:'Iron Tail',         power:100, desc:'Slams the foe with a hard-as-steel tail.'},
                         {name:'Heavy Slam',        power:130, desc:'Slams into the foe with its heavy body.'}],
              special:  [{name:'Steel Wing',        power:60,  desc:'Strikes the foe with hard, steel-edged wings.'},
                         {name:'Flash Cannon',      power:90,  desc:'Fires a flash of steel-type energy at the foe.'},
                         {name:'Doom Desire',       power:140, desc:'Stores power for two turns, then fires a concentrated bundle of light.'}] },
  Fairy:    { physical: [{name:'Fairy Wind',        power:40,  desc:'Stirs up a fairy-type breeze and attacks the foe.'},
                         {name:'Play Rough',        power:90,  desc:'Plays rough with the foe, tossing it around wildly.'},
                         {name:'Spirit Break',      power:130, desc:'Attacks the foe with such force it crushes their fighting spirit.'}],
              special:  [{name:'Disarming Voice',   power:40,  desc:'Lets out a charming cry that never misses its mark.'},
                         {name:'Dazzling Gleam',    power:80,  desc:'Emits a powerful flash of brilliant fairy light.'},
                         {name:'Moonblast',         power:130, desc:'Borrows the overwhelming power of the moon to blast the foe.'}] },
};

function getMoveТierForMap(mapIndex) {
  return mapIndex <= 2 ? 0 : 1;
}

function getBestMove(types, baseStats, speciesId, moveTier = 1, heldItem = null) {
  if (speciesId === 129) return { name: 'Splash',   power: 0, type: 'Normal', isSpecial: false, noDamage: true };
  if (speciesId === 63)  return { name: 'Teleport', power: 0, type: 'Normal', isSpecial: false, noDamage: true };
  const isSpecial = (baseStats?.special || 0) >= (baseStats?.atk || 0);
  const tier = Math.max(0, Math.min(2, moveTier ?? 1));
  // Metronome: dual-type holder uses an attack of the same tier from its OTHER
  // type — the one the default picker would skip (e.g. Normal in Normal/X, or
  // the second type in non-Normal pairs).
  if (heldItem?.id === 'metronome' && types && types.length >= 2) {
    const defaultIdx = (types[0].toLowerCase() === 'normal' && types.length > 1) ? 1 : 0;
    const otherIdx   = defaultIdx === 0 ? 1 : 0;
    const cap = types[otherIdx].charAt(0).toUpperCase() + types[otherIdx].slice(1).toLowerCase();
    if (MOVE_POOL[cap]) {
      const move = isSpecial ? MOVE_POOL[cap].special[tier] : MOVE_POOL[cap].physical[tier];
      return { ...move, type: cap, isSpecial };
    }
  }
  if ([74, 75, 76, 95].includes(speciesId)) {
    const move = MOVE_POOL['Rock'][isSpecial ? 'special' : 'physical'][tier];
    return { ...move, type: 'Rock', isSpecial };
  }
  if ([170, 171].includes(speciesId)) {
    const move = MOVE_POOL['Electric'][isSpecial ? 'special' : 'physical'][tier];
    return { ...move, type: 'Electric', isSpecial };
  }
  for (const t of types) {
    // Skip Normal if the Pokémon also has a more specific type (e.g. Normal/Flying → use Flying)
    if (t.toLowerCase() === 'normal' && types.length > 1) continue;
    const cap = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    if (MOVE_POOL[cap]) {
      const move = isSpecial ? MOVE_POOL[cap].special[tier] : MOVE_POOL[cap].physical[tier];
      return { ...move, type: cap, isSpecial };
    }
  }
  return { name: 'Tackle', power: 40, type: 'Normal', isSpecial: false };
}

// Gym leader teams (hardcoded)
const GYM_LEADERS = [
  {
    name: 'Brock', badge: 'Boulder Badge', type: 'Rock', moveTier: 0,
    team: [
      { speciesId: 74, name: 'Geodude', types: ['Rock','Ground'], baseStats: { hp:40,atk:80,def:100,speed:20,special:30 }, level: 12 },
      { speciesId: 95, name: 'Onix',    types: ['Rock','Ground'], baseStats: { hp:35,atk:45,def:160,speed:70,special:30 }, level: 14 },
    ]
  },
  {
    name: 'Misty', badge: 'Cascade Badge', type: 'Water', moveTier: 0,
    team: [
      { speciesId: 120, name: 'Staryu',  types: ['Water'], baseStats: { hp:30,atk:45,def:55,speed:85,special:70 }, level: 18 },
      { speciesId: 121, name: 'Starmie', types: ['Water','Psychic'], baseStats: { hp:60,atk:75,def:85,speed:115,special:100 }, level: 20 },
    ]
  },
  {
    name: 'Lt. Surge', badge: 'Thunder Badge', type: 'Electric', moveTier: 1,
    team: [
      { speciesId: 25,  name: 'Pikachu',  types: ['Electric'], baseStats: { hp:35,atk:55,def:40,speed:90,special:50 },  level: 20, heldItem: { id: 'eviolite', name: 'Eviolite', icon: '💎' } },
      { speciesId: 100, name: 'Voltorb',  types: ['Electric'], baseStats: { hp:40,atk:30,def:50,speed:100,special:55 }, level: 23, heldItem: { id: 'magnet',   name: 'Magnet',   icon: '🧲' } },
      { speciesId: 26,  name: 'Raichu',   types: ['Electric'], baseStats: { hp:60,atk:90,def:55,speed:110,special:90 }, level: 25, heldItem: { id: 'life_orb', name: 'Life Orb', icon: '🔮' } },
    ]
  },
  {
    name: 'Erika', badge: 'Rainbow Badge', type: 'Grass', moveTier: 1,
    team: [
      { speciesId: 114, name: 'Tangela',     types: ['Grass'], baseStats: { hp:65,atk:55,def:115,speed:60,special:100 }, level: 26, heldItem: { id: 'leftovers',     name: 'Leftovers',    icon: '🍃' } },
      { speciesId: 71,  name: 'Victreebel',  types: ['Grass','Poison'], baseStats: { hp:80,atk:105,def:65,speed:70,special:100 }, level: 31, heldItem: { id: 'poison_barb',   name: 'Poison Barb',  icon: '☠️' } },
      { speciesId: 45,  name: 'Vileplume',   types: ['Grass','Poison'], baseStats: { hp:75,atk:80,def:85,speed:50,special:110 }, level: 32, heldItem: { id: 'miracle_seed',  name: 'Miracle Seed', icon: '🌱' } },
    ]
  },
  {
    name: 'Koga', badge: 'Soul Badge', type: 'Poison', moveTier: 1,
    team: [
      { speciesId: 109, name: 'Koffing',  types: ['Poison'], baseStats: { hp:40,atk:65,def:95,speed:35,special:60 },  level: 38, heldItem: { id: 'rocky_helmet', name: 'Rocky Helmet', icon: '⛑️' } },
      { speciesId: 109, name: 'Koffing',  types: ['Poison'], baseStats: { hp:40,atk:65,def:95,speed:35,special:60 },  level: 38, heldItem: { id: 'rocky_helmet', name: 'Rocky Helmet', icon: '⛑️' } },
      { speciesId: 89,  name: 'Muk',      types: ['Poison'], baseStats: { hp:105,atk:105,def:75,speed:50,special:65 }, level: 40, heldItem: { id: 'poison_barb',  name: 'Poison Barb',  icon: '☠️' } },
      { speciesId: 110, name: 'Weezing',  types: ['Poison'], baseStats: { hp:65,atk:90,def:120,speed:60,special:85 },  level: 44, heldItem: { id: 'leftovers',    name: 'Leftovers',    icon: '🍃' } },
    ]
  },
  {
    name: 'Sabrina', badge: 'Marsh Badge', type: 'Psychic', moveTier: 1,
    team: [
      { speciesId: 122, name: 'Mr. Mime', types: ['Psychic'], baseStats: { hp:40,atk:45,def:65,speed:90,special:100 }, level: 40, heldItem: { id: 'twisted_spoon', name: 'Twisted Spoon', icon: '🥄' } },
      { speciesId: 49,  name: 'Venomoth', types: ['Bug','Poison'], baseStats: { hp:70,atk:65,def:60,speed:90,special:90 }, level: 41, heldItem: { id: 'silver_powder', name: 'Silver Powder', icon: '🐛' } },
      { speciesId: 64,  name: 'Kadabra',  types: ['Psychic'], baseStats: { hp:40,atk:35,def:30,speed:105,special:120 }, level: 42, heldItem: { id: 'eviolite', name: 'Eviolite', icon: '💎' } },
      { speciesId: 65,  name: 'Alakazam', types: ['Psychic'], baseStats: { hp:55,atk:50,def:45,speed:120,special:135 }, level: 44, heldItem: { id: 'scope_lens', name: 'Scope Lens', icon: '🔭' } },
    ]
  },
  {
    name: 'Blaine', badge: 'Volcano Badge', type: 'Fire', moveTier: 2,
    team: [
      { speciesId: 77,  name: 'Ponyta',   types: ['Fire'], baseStats: { hp:50,atk:85,def:55,speed:90,special:65 }, level: 47, heldItem: { id: 'charcoal', name: 'Charcoal', icon: '🔥' } },
      { speciesId: 58,  name: 'Growlithe',types: ['Fire'], baseStats: { hp:55,atk:70,def:45,speed:60,special:50 }, level: 47, heldItem: { id: 'eviolite', name: 'Eviolite', icon: '💎' } },
      { speciesId: 78,  name: 'Rapidash', types: ['Fire'], baseStats: { hp:65,atk:100,def:70,speed:105,special:80 }, level: 48, heldItem: { id: 'charcoal', name: 'Charcoal', icon: '🔥' } },
      { speciesId: 59,  name: 'Arcanine', types: ['Fire'], baseStats: { hp:90,atk:110,def:80,speed:95,special:100 }, level: 53, heldItem: { id: 'life_orb', name: 'Life Orb', icon: '🔮' } },
    ]
  },
  {
    name: 'Giovanni', badge: 'Earth Badge', type: 'Ground', moveTier: 2,
    team: [
      { speciesId: 51,  name: 'Dugtrio',  types: ['Ground'], baseStats: { hp:35,atk:100,def:50,speed:120,special:50 }, level: 55, heldItem: { id: 'soft_sand', name: 'Soft Sand', icon: '🏖️' } },
      { speciesId: 31,  name: 'Nidoqueen',types: ['Poison','Ground'], baseStats: { hp:90,atk:82,def:87,speed:76,special:75 }, level: 53, heldItem: { id: 'poison_barb', name: 'Poison Barb', icon: '☠️' } },
      { speciesId: 34,  name: 'Nidoking', types: ['Poison','Ground'], baseStats: { hp:81,atk:92,def:77,speed:85,special:75 }, level: 54, heldItem: { id: 'soft_sand', name: 'Soft Sand', icon: '🏖️' } },
      { speciesId: 111, name: 'Rhyhorn',  types: ['Ground','Rock'], baseStats: { hp:80,atk:85,def:95,speed:25,special:30 }, level: 56, heldItem: { id: 'hard_stone', name: 'Hard Stone', icon: '🪨' } },
      { speciesId: 112, name: 'Rhydon',   types: ['Ground','Rock'], baseStats: { hp:105,atk:130,def:120,speed:40,special:45 }, level: 60, heldItem: { id: 'rocky_helmet', name: 'Rocky Helmet', icon: '⛑️' } },
    ]
  },
];

const ELITE_4 = [
  {
    name: 'Lorelei', title: 'Elite Four', type: 'Ice',
    team: [
      { speciesId: 87,  name: 'Dewgong',   types: ['Water','Ice'], baseStats: { hp:90,atk:70,def:80,speed:70,special:95 }, level: 54, heldItem: { id: 'mystic_water', name: 'Mystic Water', icon: '💧' } },
      { speciesId: 91,  name: 'Cloyster',  types: ['Water','Ice'], baseStats: { hp:50,atk:95,def:180,speed:70,special:85 }, level: 53, heldItem: { id: 'rocky_helmet', name: 'Rocky Helmet', icon: '⛑️' } },
      { speciesId: 80,  name: 'Slowbro',   types: ['Water','Psychic'], baseStats: { hp:95,atk:75,def:110,speed:30,special:100 }, level: 54, heldItem: { id: 'leftovers', name: 'Leftovers', icon: '🍃' } },
      { speciesId: 124, name: 'Jynx',      types: ['Ice','Psychic'], baseStats: { hp:65,atk:50,def:35,speed:95,special:95 }, level: 56, heldItem: { id: 'wise_glasses', name: 'Wise Glasses', icon: '🔬' } },
      { speciesId: 131, name: 'Lapras',    types: ['Water','Ice'], baseStats: { hp:130,atk:85,def:80,speed:60,special:95 }, level: 56, heldItem: { id: 'shell_bell', name: 'Shell Bell', icon: '🐚' } },
    ]
  },
  {
    name: 'Bruno', title: 'Elite Four', type: 'Fighting',
    team: [
      { speciesId: 95,  name: 'Onix',      types: ['Rock','Ground'], baseStats: { hp:35,atk:45,def:160,speed:70,special:30 }, level: 53, heldItem: { id: 'rocky_helmet', name: 'Rocky Helmet', icon: '⛑️' } },
      { speciesId: 107, name: 'Hitmonchan',types: ['Fighting'], baseStats: { hp:50,atk:105,def:79,speed:76,special:35 }, level: 55, heldItem: { id: 'black_belt', name: 'Black Belt', icon: '🥋' } },
      { speciesId: 106, name: 'Hitmonlee', types: ['Fighting'], baseStats: { hp:50,atk:120,def:53,speed:87,special:35 }, level: 55, heldItem: { id: 'muscle_band', name: 'Muscle Band', icon: '💪' } },
      { speciesId: 95,  name: 'Onix',      types: ['Rock','Ground'], baseStats: { hp:35,atk:45,def:160,speed:70,special:30 }, level: 54, heldItem: { id: 'hard_stone', name: 'Hard Stone', icon: '🪨' } },
      { speciesId: 68,  name: 'Machamp',   types: ['Fighting'], baseStats: { hp:90,atk:130,def:80,speed:55,special:65 }, level: 58, heldItem: { id: 'choice_band', name: 'Choice Band', icon: '🎀' } },
    ]
  },
  {
    name: 'Agatha', title: 'Elite Four', type: 'Ghost',
    team: [
      { speciesId: 94,  name: 'Gengar',    types: ['Ghost','Poison'], baseStats: { hp:60,atk:65,def:60,speed:110,special:130 }, level: 54, heldItem: { id: 'spell_tag', name: 'Spell Tag', icon: '👻' } },
      { speciesId: 42,  name: 'Golbat',    types: ['Poison','Flying'], baseStats: { hp:75,atk:80,def:70,speed:90,special:75 }, level: 54, heldItem: { id: 'poison_barb', name: 'Poison Barb', icon: '☠️' } },
      { speciesId: 93,  name: 'Haunter',   types: ['Ghost','Poison'], baseStats: { hp:45,atk:50,def:45,speed:95,special:115 }, level: 56, heldItem: { id: 'life_orb', name: 'Life Orb', icon: '🔮' } },
      { speciesId: 42,  name: 'Golbat',    types: ['Poison','Flying'], baseStats: { hp:75,atk:80,def:70,speed:90,special:75 }, level: 56, heldItem: { id: 'sharp_beak', name: 'Sharp Beak', icon: '🦅' } },
      { speciesId: 94,  name: 'Gengar',    types: ['Ghost','Poison'], baseStats: { hp:60,atk:65,def:60,speed:110,special:130 }, level: 58, heldItem: { id: 'scope_lens', name: 'Scope Lens', icon: '🔭' } },
    ]
  },
  {
    name: 'Lance', title: 'Elite Four', type: 'Dragon',
    team: [
      { speciesId: 130, name: 'Gyarados',  types: ['Water','Flying'], baseStats: { hp:95,atk:125,def:79,speed:81,special:100 }, level: 56, heldItem: { id: 'mystic_water', name: 'Mystic Water', icon: '💧' } },
      { speciesId: 149, name: 'Dragonite', types: ['Dragon','Flying'], baseStats: { hp:91,atk:134,def:95,speed:80,special:100 }, level: 56, heldItem: { id: 'dragon_fang', name: 'Dragon Fang', icon: '🐉' } },
      { speciesId: 148, name: 'Dragonair', types: ['Dragon'], baseStats: { hp:61,atk:84,def:65,speed:70,special:70 }, level: 58, heldItem: { id: 'eviolite', name: 'Eviolite', icon: '💎' } },
      { speciesId: 148, name: 'Dragonair', types: ['Dragon'], baseStats: { hp:61,atk:84,def:65,speed:70,special:70 }, level: 60, heldItem: { id: 'dragon_fang', name: 'Dragon Fang', icon: '🐉' } },
      { speciesId: 149, name: 'Dragonite', types: ['Dragon','Flying'], baseStats: { hp:91,atk:134,def:95,speed:80,special:100 }, level: 62, heldItem: { id: 'choice_band', name: 'Choice Band', icon: '🎀' } },
    ]
  },
  {
    name: 'Gary', title: 'Champion', type: 'Mixed',
    team: [
      { speciesId: 18,  name: 'Pidgeot',   types: ['Normal','Flying'], baseStats: { hp:83,atk:80,def:75,speed:101,special:70 }, level: 61, heldItem: { id: 'sharp_beak', name: 'Sharp Beak', icon: '🦅' } },
      { speciesId: 65,  name: 'Alakazam',  types: ['Psychic'], baseStats: { hp:55,atk:50,def:45,speed:120,special:135 }, level: 59, heldItem: { id: 'twisted_spoon', name: 'Twisted Spoon', icon: '🥄' } },
      { speciesId: 112, name: 'Rhydon',    types: ['Ground','Rock'], baseStats: { hp:105,atk:130,def:120,speed:40,special:45 }, level: 61, heldItem: { id: 'soft_sand', name: 'Soft Sand', icon: '🏖️' } },
      { speciesId: 103, name: 'Exeggutor', types: ['Grass','Psychic'], baseStats: { hp:95,atk:95,def:85,speed:55,special:125 }, level: 61, heldItem: { id: 'miracle_seed', name: 'Miracle Seed', icon: '🌱' } },
      { speciesId: 6,   name: 'Charizard', types: ['Fire','Flying'], baseStats: { hp:78,atk:84,def:78,speed:100,special:109 }, level: 65, heldItem: { id: 'charcoal', name: 'Charcoal', icon: '🔥' } },
    ]
  },
];

const GEN2_ELITE_4 = [
  { name: 'Will', title: 'Elite Four', type: 'Psychic',
    team: [
      { speciesId: 178, name: 'Xatu',      types: ['Psychic','Flying'], baseStats: { hp:65,  atk:75,  def:70,  speed:95,  special:95  }, level: 80 },
      { speciesId: 178, name: 'Xatu',      types: ['Psychic','Flying'], baseStats: { hp:65,  atk:75,  def:70,  speed:95,  special:95  }, level: 80 },
      { speciesId: 80,  name: 'Slowbro',   types: ['Water','Psychic'],  baseStats: { hp:95,  atk:75,  def:110, speed:30,  special:100 }, level: 82 },
      { speciesId: 124, name: 'Jynx',      types: ['Ice','Psychic'],    baseStats: { hp:65,  atk:50,  def:35,  speed:95,  special:95  }, level: 82 },
      { speciesId: 103, name: 'Exeggutor', types: ['Grass','Psychic'],  baseStats: { hp:95,  atk:95,  def:85,  speed:55,  special:125 }, level: 84 },
    ]
  },
  { name: 'Koga', title: 'Elite Four', type: 'Poison',
    team: [
      { speciesId: 168, name: 'Ariados',   types: ['Bug','Poison'],    baseStats: { hp:70,  atk:90,  def:70,  speed:40,  special:60  }, level: 84 },
      { speciesId: 49,  name: 'Venomoth',  types: ['Bug','Poison'],    baseStats: { hp:70,  atk:65,  def:60,  speed:90,  special:90  }, level: 84 },
      { speciesId: 205, name: 'Forretress',types: ['Bug','Steel'],     baseStats: { hp:75,  atk:90,  def:140, speed:40,  special:60  }, level: 84 },
      { speciesId: 89,  name: 'Muk',       types: ['Poison'],          baseStats: { hp:105, atk:105, def:75,  speed:50,  special:65  }, level: 84 },
      { speciesId: 169, name: 'Crobat',    types: ['Poison','Flying'], baseStats: { hp:85,  atk:90,  def:80,  speed:130, special:70  }, level: 88 },
    ]
  },
  { name: 'Bruno', title: 'Elite Four', type: 'Fighting',
    team: [
      { speciesId: 237, name: 'Hitmontop', types: ['Fighting'],        baseStats: { hp:50,  atk:95,  def:95,  speed:70,  special:35  }, level: 90 },
      { speciesId: 106, name: 'Hitmonlee', types: ['Fighting'],        baseStats: { hp:50,  atk:120, def:53,  speed:87,  special:35  }, level: 90 },
      { speciesId: 107, name: 'Hitmonchan',types: ['Fighting'],        baseStats: { hp:50,  atk:105, def:79,  speed:76,  special:35  }, level: 90 },
      { speciesId: 95,  name: 'Onix',      types: ['Rock','Ground'],   baseStats: { hp:35,  atk:45,  def:160, speed:70,  special:30  }, level: 90 },
      { speciesId: 68,  name: 'Machamp',   types: ['Fighting'],        baseStats: { hp:90,  atk:130, def:80,  speed:55,  special:65  }, level: 90 },
    ]
  },
  { name: 'Karen', title: 'Elite Four', type: 'Dark',
    team: [
      { speciesId: 197, name: 'Umbreon',   types: ['Dark'],            baseStats: { hp:95,  atk:65,  def:110, speed:65,  special:60  }, level: 88 },
      { speciesId: 45,  name: 'Vileplume', types: ['Grass','Poison'],  baseStats: { hp:75,  atk:80,  def:85,  speed:50,  special:100 }, level: 88 },
      { speciesId: 94,  name: 'Gengar',    types: ['Ghost','Poison'],  baseStats: { hp:60,  atk:65,  def:60,  speed:110, special:130 }, level: 90 },
      { speciesId: 198, name: 'Murkrow',   types: ['Dark','Flying'],   baseStats: { hp:60,  atk:85,  def:42,  speed:91,  special:85  }, level: 90 },
      { speciesId: 229, name: 'Houndoom',  types: ['Dark','Fire'],     baseStats: { hp:75,  atk:90,  def:50,  speed:95,  special:110 }, level: 92 },
    ]
  },
  { name: 'Lance', title: 'Champion', type: 'Dragon',
    team: [
      { speciesId: 130, name: 'Gyarados',  types: ['Water','Flying'],  baseStats: { hp:95,  atk:125, def:79,  speed:81,  special:60  }, level: 90 },
      { speciesId: 142, name: 'Aerodactyl',types: ['Rock','Flying'],   baseStats: { hp:80,  atk:105, def:65,  speed:130, special:60  }, level: 91 },
      { speciesId: 149, name: 'Dragonite', types: ['Dragon','Flying'], baseStats: { hp:91,  atk:134, def:95,  speed:80,  special:100 }, level: 92 },
      { speciesId: 149, name: 'Dragonite', types: ['Dragon','Flying'], baseStats: { hp:91,  atk:134, def:95,  speed:80,  special:100 }, level: 93 },
      { speciesId: 149, name: 'Dragonite', types: ['Dragon','Flying'], baseStats: { hp:91,  atk:134, def:95,  speed:80,  special:100 }, level: 94 },
    ]
  },
];

const JOHTO_GYM_LEADERS = [
  { name: 'Falkner', badge: 'Zephyr Badge', type: 'Flying', moveTier: 0,
    team: [
      { speciesId: 16,  name: 'Pidgey',    types: ['Normal','Flying'], baseStats: { hp:40,  atk:45,  def:40,  speed:56,  special:35  }, level: 9 },
      { speciesId: 17,  name: 'Pidgeotto', types: ['Normal','Flying'], baseStats: { hp:63,  atk:60,  def:55,  speed:71,  special:50  }, level: 10 },
    ]
  },
  { name: 'Bugsy', badge: 'Hive Badge', type: 'Bug', moveTier: 0,
    team: [
      { speciesId: 11,  name: 'Metapod',  types: ['Bug'],          baseStats: { hp:50,  atk:20,  def:55,  speed:30,  special:25  }, level: 19 },
      { speciesId: 14,  name: 'Kakuna',   types: ['Bug','Poison'], baseStats: { hp:45,  atk:25,  def:50,  speed:35,  special:25  }, level: 20 },
      { speciesId: 123, name: 'Scyther',  types: ['Bug','Flying'], baseStats: { hp:70,  atk:110, def:80,  speed:105, special:55  }, level: 21 },
    ]
  },
  { name: 'Whitney', badge: 'Plain Badge', type: 'Normal', moveTier: 0,
    team: [
      { speciesId: 35,  name: 'Clefairy', types: ['Normal'], baseStats: { hp:70,  atk:45,  def:48,  speed:35,  special:60  }, level: 29 },
      { speciesId: 241, name: 'Miltank',  types: ['Normal'], baseStats: { hp:95,  atk:80,  def:105, speed:100, special:60  }, level: 32 },
    ]
  },
  { name: 'Morty', badge: 'Fog Badge', type: 'Ghost', moveTier: 1,
    team: [
      { speciesId: 92,  name: 'Gastly',  types: ['Ghost','Poison'], baseStats: { hp:30,  atk:35,  def:30,  speed:80,  special:100 }, level: 38 },
      { speciesId: 93,  name: 'Haunter', types: ['Ghost','Poison'], baseStats: { hp:45,  atk:50,  def:45,  speed:95,  special:115 }, level: 39 },
      { speciesId: 93,  name: 'Haunter', types: ['Ghost','Poison'], baseStats: { hp:45,  atk:50,  def:45,  speed:95,  special:115 }, level: 40 },
      { speciesId: 94,  name: 'Gengar',  types: ['Ghost','Poison'], baseStats: { hp:60,  atk:65,  def:60,  speed:110, special:130 }, level: 42 },
    ]
  },
  { name: 'Chuck', badge: 'Storm Badge', type: 'Fighting', moveTier: 1,
    team: [
      { speciesId: 57,  name: 'Primeape',  types: ['Fighting'],         baseStats: { hp:65,  atk:105, def:60,  speed:95,  special:60  }, level: 50 },
      { speciesId: 62,  name: 'Poliwrath', types: ['Water','Fighting'], baseStats: { hp:90,  atk:95,  def:95,  speed:70,  special:70  }, level: 55 },
    ]
  },
  { name: 'Jasmine', badge: 'Mineral Badge', type: 'Steel', moveTier: 1,
    team: [
      { speciesId: 81,  name: 'Magnemite', types: ['Electric','Steel'], baseStats: { hp:25,  atk:35,  def:70,  speed:45,  special:95  }, level: 60 },
      { speciesId: 81,  name: 'Magnemite', types: ['Electric','Steel'], baseStats: { hp:25,  atk:35,  def:70,  speed:45,  special:95  }, level: 60 },
      { speciesId: 208, name: 'Steelix',   types: ['Steel','Ground'],   baseStats: { hp:75,  atk:85,  def:200, speed:30,  special:55  }, level: 65 },
    ]
  },
  { name: 'Pryce', badge: 'Glacier Badge', type: 'Ice', moveTier: 2,
    team: [
      { speciesId: 86,  name: 'Seel',      types: ['Water'],        baseStats: { hp:65,  atk:45,  def:55,  speed:45,  special:70  }, level: 70 },
      { speciesId: 87,  name: 'Dewgong',   types: ['Water','Ice'],  baseStats: { hp:90,  atk:70,  def:80,  speed:70,  special:95  }, level: 73 },
      { speciesId: 221, name: 'Piloswine', types: ['Ice','Ground'], baseStats: { hp:100, atk:100, def:80,  speed:50,  special:60  }, level: 75 },
    ]
  },
  { name: 'Clair', badge: 'Rising Badge', type: 'Dragon', moveTier: 2,
    team: [
      { speciesId: 130, name: 'Gyarados',  types: ['Water','Flying'], baseStats: { hp:95,  atk:125, def:79,  speed:81,  special:60  }, level: 80 },
      { speciesId: 148, name: 'Dragonair', types: ['Dragon'],         baseStats: { hp:61,  atk:84,  def:65,  speed:70,  special:70  }, level: 80 },
      { speciesId: 148, name: 'Dragonair', types: ['Dragon'],         baseStats: { hp:61,  atk:84,  def:65,  speed:70,  special:70  }, level: 80 },
      { speciesId: 230, name: 'Kingdra',   types: ['Water','Dragon'], baseStats: { hp:75,  atk:95,  def:95,  speed:85,  special:95  }, level: 80 },
    ]
  },
];

const SILVER_ENCOUNTERS = [
  // Map 1 — enc 0: starter 1st evo replaces last slot; map max=20, Silver ace=18
  { team: [
    { speciesId: 92,  name: 'Gastly',    types: ['Ghost','Poison'],  baseStats: { hp:30, atk:35, def:30, speed:80,  special:100 }, level: 13 },
    { speciesId: 41,  name: 'Zubat',     types: ['Poison','Flying'], baseStats: { hp:40, atk:45, def:35, speed:55,  special:40  }, level: 16 },
    { speciesId: 155, name: 'Cyndaquil', types: ['Fire'],            baseStats: { hp:39, atk:52, def:43, speed:65,  special:60  }, level: 16 },
  ]},
  // Map 3 — enc 1: starter evo replaces last slot; map max=40, Silver ace=38
  { team: [
    { speciesId: 93,  name: 'Haunter',   types: ['Ghost','Poison'],  baseStats: { hp:45, atk:50, def:45,  speed:95,  special:115 }, level: 34 },
    { speciesId: 169, name: 'Crobat',    types: ['Poison','Flying'], baseStats: { hp:85, atk:90, def:80,  speed:130, special:70  }, level: 34 },
    { speciesId: 82,  name: 'Magneton',  types: ['Electric','Steel'],baseStats: { hp:50, atk:60, def:95,  speed:70,  special:120 }, level: 32 },
    { speciesId: 93,  name: 'Haunter',   types: ['Ghost','Poison'],  baseStats: { hp:45, atk:50, def:45,  speed:95,  special:115 }, level: 34 },
    { speciesId: 155, name: 'Cyndaquil', types: ['Fire'],            baseStats: { hp:39, atk:52, def:43,  speed:65,  special:60  }, level: 38 },
  ]},
  // Map 5 — enc 2: starter evo replaces last slot; map max=60, Silver ace=58
  { team: [
    { speciesId: 169, name: 'Crobat',    types: ['Poison','Flying'], baseStats: { hp:85, atk:90, def:80, speed:130, special:70  }, level: 53 },
    { speciesId: 462, name: 'Magnezone', types: ['Electric','Steel'],baseStats: { hp:70, atk:70, def:115,speed:60,  special:130 }, level: 56 },
    { speciesId: 94,  name: 'Gengar',    types: ['Ghost','Poison'],  baseStats: { hp:60, atk:65, def:60, speed:110, special:130 }, level: 53 },
    { speciesId: 461, name: 'Weavile',   types: ['Dark','Ice'],      baseStats: { hp:70, atk:120,def:65, speed:125, special:45  }, level: 56 },
    { speciesId: 155, name: 'Cyndaquil', types: ['Fire'],            baseStats: { hp:39, atk:52, def:43, speed:65,  special:60  }, level: 58 },
  ]},
  // Map 7 — enc 3: starter evo replaces last slot; map max=80, Silver ace=78
  { team: [
    { speciesId: 169, name: 'Crobat',    types: ['Poison','Flying'], baseStats: { hp:85, atk:90, def:80, speed:130, special:70  }, level: 74 },
    { speciesId: 462, name: 'Magnezone', types: ['Electric','Steel'],baseStats: { hp:70, atk:70, def:115,speed:60,  special:130 }, level: 72 },
    { speciesId: 94,  name: 'Gengar',    types: ['Ghost','Poison'],  baseStats: { hp:60, atk:65, def:60, speed:110, special:130 }, level: 74 },
    { speciesId: 461, name: 'Weavile',   types: ['Dark','Ice'],      baseStats: { hp:70, atk:120,def:65, speed:125, special:45  }, level: 76 },
    { speciesId: 155, name: 'Cyndaquil', types: ['Fire'],            baseStats: { hp:39, atk:52, def:43, speed:65,  special:60  }, level: 78 },
  ]},
];

// Silver always carries the starter that counters the player's choice.
// Indexed by player's starterSpeciesId; stages = [base, 1st evo, final evo].
const SILVER_STARTER_LINES = {
  152: [ // Player: Chikorita (Grass) → Silver: Cyndaquil line (Fire beats Grass)
    { speciesId: 155, name: 'Cyndaquil',  types: ['Fire'], baseStats: { hp:39, atk:52,  def:43,  speed:65,  special:60  } },
    { speciesId: 156, name: 'Quilava',    types: ['Fire'], baseStats: { hp:58, atk:64,  def:58,  speed:80,  special:80  } },
    { speciesId: 157, name: 'Typhlosion', types: ['Fire'], baseStats: { hp:78, atk:84,  def:78,  speed:100, special:109 } },
  ],
  155: [ // Player: Cyndaquil (Fire) → Silver: Totodile line (Water beats Fire)
    { speciesId: 158, name: 'Totodile',   types: ['Water'], baseStats: { hp:50, atk:65,  def:64,  speed:43,  special:44 } },
    { speciesId: 159, name: 'Croconaw',   types: ['Water'], baseStats: { hp:65, atk:80,  def:80,  speed:58,  special:59 } },
    { speciesId: 160, name: 'Feraligatr', types: ['Water'], baseStats: { hp:85, atk:105, def:100, speed:78,  special:79 } },
  ],
  158: [ // Player: Totodile (Water) → Silver: Chikorita line (Grass beats Water)
    { speciesId: 152, name: 'Chikorita',  types: ['Grass'], baseStats: { hp:45, atk:49,  def:65,  speed:45,  special:65 } },
    { speciesId: 153, name: 'Bayleef',    types: ['Grass'], baseStats: { hp:60, atk:62,  def:80,  speed:60,  special:63 } },
    { speciesId: 154, name: 'Meganium',   types: ['Grass'], baseStats: { hp:80, atk:82,  def:100, speed:80,  special:83 } },
  ],
};

// Item pool
const ITEM_POOL = [
  { id: 'lucky_egg',          name: 'Lucky Egg',          desc: '30% chance: holder gains +1 extra level after each battle',        icon: '🥚', minMap: 4 },
  { id: 'life_orb',           name: 'Life Orb',           desc: '+30% damage; holder loses 10% max HP per hit',                       icon: '🔮' },
  { id: 'choice_band',        name: 'Choice Band',        desc: '+40% physical damage, -20% DEF',                                     icon: '🎀' },
  { id: 'choice_specs',       name: 'Choice Specs',       desc: '+30% special damage',                                                icon: '👓' },
  { id: 'muscle_band',         name: 'Muscle Band',        desc: '+30% physical damage',                                              icon: '💪' },
  { id: 'wise_glasses',       name: 'Wise Glasses',       desc: '+50% Sp.Atk & Sp.Def if 4+ Pokémon on your team are special attackers', icon: '🔍' },
  { id: 'metronome',          name: 'Metronome',          desc: 'Dual-type holder uses an attack of the same tier from its OTHER type', icon: '🎵' },
  { id: 'scope_lens',         name: 'Scope Lens',         desc: '20% crit chance (+50% damage on crit)',                              icon: '🔭' },
  { id: 'rocky_helmet',       name: 'Rocky Helmet',       desc: 'Attacker takes 12% of their max HP on each hit',                     icon: '⛑️' },
  { id: 'shell_bell',         name: 'Shell Bell',         desc: 'Heal 15% of damage dealt',                                           icon: '🐚' },
  { id: 'eviolite',           name: 'Eviolite',           desc: 'stops evolutions, if the pokemon is not the final stage it gets +50% DEF & +50% Sp. DEF', icon: '💎' },
  { id: 'sharp_beak',         name: 'Sharp Beak',         desc: '+50% Flying move damage',                                            icon: '🦅' },
  { id: 'charcoal',           name: 'Charcoal',           desc: '+50% Fire move damage',                                              icon: '🔥' },
  { id: 'mystic_water',       name: 'Mystic Water',       desc: '+50% Water move damage',                                             icon: '💧' },
  { id: 'magnet',             name: 'Magnet',             desc: '+50% Electric move damage',                                          icon: '🧲', minMap: 4 },
  { id: 'miracle_seed',       name: 'Miracle Seed',       desc: '+50% Grass move damage',                                             icon: '🌱' },
  { id: 'twisted_spoon',      name: 'Twisted Spoon',      desc: '+50% Psychic move damage',                                           icon: '🥄', minMap: 4 },
  { id: 'black_belt',         name: 'Black Belt',         desc: '+50% Fighting move damage',                                          icon: '🥋' },
  { id: 'soft_sand',          name: 'Soft Sand',          desc: '+50% Ground move damage',                                            icon: '🏖️', minMap: 4 },
  { id: 'silver_powder',      name: 'Silver Powder',      desc: '+50% Bug move damage',                                               icon: '🐛' },
  { id: 'hard_stone',         name: 'Hard Stone',         desc: '+50% Rock move damage',                                              icon: '🪨', minMap: 4 },
  { id: 'dragon_fang',        name: 'Dragon Fang',        desc: '+50% Dragon move damage',                                            icon: '🐉', minMap: 6 },
  { id: 'poison_barb',        name: 'Poison Barb',        desc: '+50% Poison move damage',                                            icon: '☠️', minMap: 4 },
  { id: 'spell_tag',          name: 'Spell Tag',          desc: '+50% Ghost move damage',                                             icon: '👻', minMap: 4 },
  { id: 'silk_scarf',         name: 'Silk Scarf',         desc: '+50% Normal move damage',                                            icon: '🤍' },
  { id: 'metal_coat',         name: 'Metal Coat',         desc: '+50% Steel move damage',                                             icon: '🔩', minMap: 4 },
  { id: 'black_glasses',      name: 'Black Glasses',      desc: '+50% Dark move damage',                                              icon: '🕶️', minMap: 4 },
  { id: 'pixie_plate',        name: 'Pixie Plate',        desc: '+50% Fairy move damage',                                             icon: '🧚', minMap: 4 },
  // Stat items
  { id: 'assault_vest',       name: 'Assault Vest',       desc: '+50% Sp.Def',                                                        icon: '🦺' },
  { id: 'choice_scarf',       name: 'Choice Scarf',       desc: '+50% Speed',                                                         icon: '🧣' },
  // Battle effect items
  { id: 'leftovers',          name: 'Leftovers',          desc: 'Restore 10% max HP each round',                                      icon: '🍃' },
  { id: 'expert_belt',        name: 'Expert Belt',        desc: '+100% damage on super effective hits',                                icon: '🥊' },
  { id: 'focus_sash',         name: 'Focus Sash',         desc: 'If at full HP, guaranteed to survive any hit with 1 HP',             icon: '🎗️' },
  { id: 'wide_lens',          name: 'Wide Lens',          desc: '+20% damage on all moves',                                            icon: '🔎' },
  { id: 'quick_claw',         name: 'Quick Claw',         desc: '50% chance to attack first regardless of speed',                     icon: '🪝' },
  { id: 'kings_rock',         name: "King's Rock",         desc: '30% chance to flinch the target on a hit',                          icon: '👑' },
  { id: 'lagging_tail',       name: 'Lagging Tail',       desc: 'Always moves last, but +100% move damage',                            icon: '🐌' },
  { id: 'adrenaline_orb',     name: 'Adrenaline Orb',     desc: 'When YOU land a SUPER-EFFECTIVE hit (×2+): +1 ATK / +1 Sp.Atk this battle', icon: '⚡' },
  { id: 'red_card',           name: 'Red Card',           desc: 'Take 50% less damage from super-effective hits',                      icon: '🟥' },
];

const USABLE_ITEM_POOL = [
  { id: 'max_revive',   name: 'Max Revive',  desc: 'Fully revives a fainted Pokémon',                          icon: '💊', usable: true },
  { id: 'full_restore', name: 'Full Restore',desc: 'Fully restores HP of a Pokémon',                           icon: '🍶', usable: true },
  { id: 'rare_candy',   name: 'Rare Candy',  desc: 'Gives a Pokémon +3 levels',                                icon: '🍬', usable: true },
  { id: 'moon_stone',   name: 'Moon Stone',  desc: 'Force evolves a Pokémon regardless of level',              icon: '🌙', usable: true },
  { id: 'tm_normal',    name: 'TM',          desc: "Upgrades a Pokémon's move tier by 1",                      icon: '💿', usable: true },
  { id: 'escape_rope',  name: 'Escape Rope', desc: 'Survive a non-boss loss with 1 HP instead of game over',   icon: '🪢', usable: true },
];

const TYPE_ITEM_MAP = {
  Flying: 'sharp_beak', Fire: 'charcoal', Water: 'mystic_water', Electric: 'magnet',
  Grass: 'miracle_seed', Psychic: 'twisted_spoon', Fighting: 'black_belt',
  Ground: 'soft_sand', Bug: 'silver_powder', Rock: 'hard_stone', Dragon: 'dragon_fang',
  Poison: 'poison_barb', Ghost: 'spell_tag', Normal: 'silk_scarf',
  Steel: 'metal_coat', Dark: 'black_glasses', Fairy: 'pixie_plate',
};

// Bust stale pokemon species cache entries missing the 'special' stat
(function bustStaleCache() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith('pkrl_poke_')) continue;
      const val = getCached(key);
      if (val && val.baseStats && (val.baseStats.special === undefined || val.baseStats.spdef === undefined)) {
        localStorage.removeItem(key);
      }
    }
  } catch {}
})();

// Settings (persisted across runs)
function getSettings() {
  const defaults = { autoSkipBattles: false, autoSkipAllBattles: false, autoSkipEvolve: false, darkMode: false };
  return Object.assign({}, defaults, getCached('poke_settings') || {});
}
function saveSettings(s) { setCached('poke_settings', s); }

// BST ranges per map
const MAP_BST_RANGES = [
  { min: 200, max: 310 },   // Map 1
  { min: 280, max: 360 },   // Map 2
  { min: 340, max: 420 },   // Map 3
  { min: 340, max: 420 },   // Map 4
  { min: 400, max: 480 },   // Map 5
  { min: 400, max: 480 },   // Map 6
  { min: 460, max: 530 },   // Map 7
  { min: 460, max: 530 },   // Map 8
  { min: 530, max: 999 },   // Final
];

// Gen 2 has 18 maps — fall back to MAP_BST_RANGES (clamped to map 8) would
// stuff every Kanto encounter into veryHigh. Use a tailored ladder so each
// Kanto map has a distinct BST band.
const GEN2_MAP_BST_RANGES = [
  { min: 200, max: 310 }, // 0  Falkner
  { min: 250, max: 360 }, // 1  Bugsy
  { min: 290, max: 400 }, // 2  Whitney
  { min: 320, max: 430 }, // 3  Morty
  { min: 350, max: 460 }, // 4  Chuck
  { min: 380, max: 490 }, // 5  Jasmine
  { min: 410, max: 510 }, // 6  Pryce
  { min: 440, max: 530 }, // 7  Clair
  { min: 460, max: 999 }, // 8  Lance / Mt Silver
  { min: 470, max: 999 }, // 9  Brock (Kanto starts)
  { min: 485, max: 999 }, // 10 Misty
  { min: 495, max: 999 }, // 11 Lt. Surge
  { min: 505, max: 999 }, // 12 Erika
  { min: 515, max: 999 }, // 13 Janine
  { min: 525, max: 999 }, // 14 Sabrina
  { min: 535, max: 999 }, // 15 Blaine
  { min: 545, max: 999 }, // 16 Blue
  { min: 555, max: 999 }, // 17 Red
];

const MAP_LEVEL_RANGES = [
  [1, 5], [8, 15], [14, 21], [21, 29],
  [29, 37], [37, 43], [43, 47], [47, 52], [53, 64]
];

const GEN2_MAP_LEVEL_RANGES = [
  [1,   10],  // Map 0 — Falkner
  [11,  20],  // Map 1 — Bugsy
  [21,  30],  // Map 2 — Whitney
  [31,  40],  // Map 3 — Morty
  [41,  50],  // Map 4 — Chuck
  [51,  60],  // Map 5 — Jasmine
  [61,  70],  // Map 6 — Pryce
  [71,  80],  // Map 7 — Clair
  [81,  90],  // Map 8 — Elite Four (Will/Koga/Bruno/Karen/Lance) — final
];

// Gen 2 deterministic level offsets for layers 1..7 (boss layer 8 uses leader data).
// Curve sits cleanly in mapMin..mapMin+9 with the gym at exactly mapMin+9.
// Map 1 example: layers = 1,2,3,5,6,8,9 ; gym = 10. Map 2: 11,12,13,15,16,18,19 ; gym = 20.
const GEN2_LAYER_OFFSETS = [0, 1, 2, 4, 5, 7, 8];

const MAP_NAMES = [
  'Route 1', 'Mt Moon', 'Nugget Bridge', 'Rock Tunnel',
  'Silph Co', 'Safari Zone', 'Seafoam Island', 'Viridian City', 'Victory Road',
];

function getPokemonLocations(speciesId, bst) {
  const id = Number(speciesId);
  const BUCKET_INDICES = { low:[0], midLow:[1], mid:[2,3], midHigh:[4,5], high:[6,7], veryHigh:[8] };
  let mapIndices = [];

  const GEN1_LEGENDARY_INDICES = {
    144: [6, 7], 145: [6, 7], 146: [6, 7],
    150: [6, 7, 8], 151: [6, 7, 8],
  };
  if (GEN1_LEGENDARY_INDICES[id]) {
    mapIndices = GEN1_LEGENDARY_INDICES[id];
  } else {
    // GEN1_BST_APPROX contains all gens — use it for all IDs since getCatchChoices does too.
    for (const [bucket, indices] of Object.entries(BUCKET_INDICES)) {
      if (GEN1_BST_APPROX[bucket].includes(id)) mapIndices.push(...indices);
    }
    // Fall back to BST threshold only for Pokemon not listed in GEN1_BST_APPROX.
    if (mapIndices.length === 0 && bst != null) {
      let bucket;
      if (bst >= 530) bucket = 'veryHigh';
      else if (bst >= 460) bucket = 'high';
      else if (bst >= 400) bucket = 'midHigh';
      else if (bst >= 340) bucket = 'mid';
      else if (bst >= 280) bucket = 'midLow';
      else bucket = 'low';
      mapIndices = BUCKET_INDICES[bucket];
    }
  }

  const TOWER_STAGE_LABEL = { 0: 'Early', 1: 'Early-Middle', 3: 'Middle', 4: 'Middle-Late', 6: 'Late', 7: 'Late' };
  const seen = new Set();
  const towerFloors = mapIndices
    .filter(i => TOWER_STAGE_LABEL[i] !== undefined)
    .map(i => TOWER_STAGE_LABEL[i])
    .filter(label => !seen.has(label) && seen.add(label));
  return {
    regularMaps: id <= 151 ? mapIndices.map(i => MAP_NAMES[i]) : [],
    towerFloors,
  };
}

// PokeAPI cache helpers
const CACHE_KEY_SPECIES = 'pkrl_species_list';

// Bundled static pokedex — populated once at boot from data/pokedex.json.
// Keyed by numeric id. Avoids per-pokemon PokeAPI fetches for the 649 covered species.
let _staticPokedex = null;
let _staticPokedexPromise = null;

function loadStaticPokedex() {
  if (_staticPokedex) return Promise.resolve(_staticPokedex);
  if (_staticPokedexPromise) return _staticPokedexPromise;
  _staticPokedexPromise = fetch('data/pokedex.json')
    .then(r => r.ok ? r.json() : null)
    .then(d => { _staticPokedex = d || {}; return _staticPokedex; })
    .catch(() => { _staticPokedex = {}; return _staticPokedex; });
  return _staticPokedexPromise;
}

// Best-effort sync lookup once the bundle is loaded
function getStaticPokedexEntry(id) {
  return _staticPokedex ? _staticPokedex[id] : null;
}

// Kick off the load eagerly so the catch screen can use it without blocking
if (typeof window !== 'undefined') loadStaticPokedex();

function getCached(key) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}

function setCached(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

async function fetchSpeciesList() {
  const cached = getCached(CACHE_KEY_SPECIES);
  if (cached) return cached;
  try {
    const r = await fetch('https://pokeapi.co/api/v2/pokemon?limit=2000');
    const d = await r.json();
    const list = d.results.map((p, i) => ({ name: p.name, id: i + 1 }));
    setCached(CACHE_KEY_SPECIES, list);
    return list;
  } catch (e) {
    console.warn('PokeAPI unavailable, using fallback data');
    return null;
  }
}

// Form slug → national dex ID (used for speciesId / evolution tracking)
const POKEMON_FORM_SLUGS = {
  'deoxys-attack': 386, 'deoxys-defense': 386, 'deoxys-speed': 386,
  'shaymin-sky': 492,
  'charizard-mega-x': 6,
  'kyurem-black': 646, 'kyurem-white': 646,
};

// Form slug → PokeAPI numeric form ID (used for sprite tooltip images)
const POKEMON_FORM_SPRITE_IDS = {
  'deoxys-attack': 10001, 'deoxys-defense': 10002, 'deoxys-speed': 10003,
  'shaymin-sky': 10006,
  'charizard-mega-x': 10034,
  'kyurem-black': 10022, 'kyurem-white': 10023,
};

// 'deoxys-attack' → 'Deoxys (Attack)'
function formatFormName(apiName) {
  const parts = apiName.split('-');
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  const base = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  const form = parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  return `${base} (${form})`;
}

async function fetchPokemonById(idOrSlug) {
  // Static bundle short-circuit (numeric IDs only — form slugs still go through the network)
  if (typeof idOrSlug === 'number') {
    const dex = _staticPokedex || await loadStaticPokedex();
    const entry = dex[idOrSlug];
    if (entry) {
      return {
        id: idOrSlug,
        name: entry.name,
        types: entry.types,
        baseStats: entry.baseStats,
        bst: Object.values(entry.baseStats).reduce((a,b)=>a+b,0),
        base_experience: entry.base_experience,
        spriteUrl: entry.spriteUrl,
        shinySpriteUrl: entry.shinySpriteUrl,
      };
    }
  }
  const key = `pkrl_poke_${idOrSlug}`;
  const cached = getCached(key);
  if (cached && cached.baseStats?.special !== undefined && cached.baseStats?.spdef !== undefined) return cached;
  try {
    const r = await fetch(`https://pokeapi.co/api/v2/pokemon/${idOrSlug}`);
    const d = await r.json();
    const baseStats = {
      hp: d.stats.find(s=>s.stat.name==='hp')?.base_stat || 45,
      atk: d.stats.find(s=>s.stat.name==='attack')?.base_stat || 50,
      def: d.stats.find(s=>s.stat.name==='defense')?.base_stat || 50,
      speed: d.stats.find(s=>s.stat.name==='speed')?.base_stat || 50,
      special: d.stats.find(s=>s.stat.name==='special-attack')?.base_stat || 50,
      spdef:   d.stats.find(s=>s.stat.name==='special-defense')?.base_stat || 50,
    };
    const bst = Object.values(baseStats).reduce((a,b)=>a+b,0);
    const types = d.types.map(t => t.type.name.charAt(0).toUpperCase() + t.type.name.slice(1));
    const isFormSlug = typeof idOrSlug === 'string' && POKEMON_FORM_SLUGS[idOrSlug] !== undefined;
    const poke = {
      id: isFormSlug ? POKEMON_FORM_SLUGS[idOrSlug] : d.id,
      name: isFormSlug ? formatFormName(d.name) : d.name.charAt(0).toUpperCase() + d.name.slice(1),
      types,
      baseStats,
      bst,
      // Use API sprite URL directly — it's correct for both base forms and variants
      spriteUrl: d.sprites.front_default || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${d.id}.png`,
      shinySpriteUrl: d.sprites.front_shiny || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${d.id}.png`,
    };
    setCached(key, poke);
    return poke;
  } catch (e) {
    console.warn(`Failed to fetch pokemon ${idOrSlug}`, e);
    return null;
  }
}

async function fetchPokemonSpecies(id) {
  if (typeof id === 'number') {
    const dex = _staticPokedex || await loadStaticPokedex();
    const entry = dex[id];
    if (entry) {
      return { id, flavorText: entry.flavorText || '' };
    }
  }
  const key = `pkrl_species_${id}`;
  const cached = getCached(key);
  if (cached) return cached;
  try {
    const r = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const entry = d.flavor_text_entries.find(e => e.language.name === 'en');
    const flavorText = entry
      ? entry.flavor_text.replace(/\f|\n|­/g, ' ').replace(/\s{2,}/g, ' ').trim()
      : '';
    const result = { id, flavorText };
    setCached(key, result);
    return result;
  } catch { return { id, flavorText: '' }; }
}

function buildEvoChain(speciesId) {
  let baseId = Number(speciesId);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, evo] of Object.entries(EVOLUTIONS)) {
      if (evo.into === baseId) { baseId = Number(pid); changed = true; break; }
    }
    if (!changed) {
      for (const [pid, branches] of Object.entries(BRANCHING_EVOLUTIONS)) {
        if (branches.some(b => b.into === baseId)) { baseId = Number(pid); changed = true; break; }
      }
    }
  }

  function buildNode(id) {
    const node = { id, evolvesInto: [] };
    if (BRANCHING_EVOLUTIONS[id]) {
      node.evolvesInto = BRANCHING_EVOLUTIONS[id].map(b => ({
        id: b.into, name: b.name, level: b.level,
        evolvesInto: buildNode(b.into).evolvesInto,
      }));
    } else if (EVOLUTIONS[id]) {
      const e = EVOLUTIONS[id];
      node.evolvesInto = [{ id: e.into, name: e.name, level: e.level,
        evolvesInto: buildNode(e.into).evolvesInto }];
    }
    return node;
  }

  return { baseId, chain: buildNode(baseId) };
}

let _speciesPool = null;
let _poolByMap = {};

async function getSpeciesPool() {
  if (_speciesPool) return _speciesPool;
  _speciesPool = await fetchSpeciesList();
  return _speciesPool;
}

// Legendary Pokemon (Gen 1-5) — excluded from wild/catch pools, available only via Legendary node
const LEGENDARY_IDS = [
  144,145,146,150,151,                                             // Gen 1
  243,244,245,249,250,251,                                         // Gen 2
  377,378,379,380,381,382,383,384,385,386,                         // Gen 3
  480,481,482,483,484,485,486,487,488,489,490,491,492,493,         // Gen 4
  494,638,639,640,641,642,643,644,645,646,647,648,649,             // Gen 5
];

// Catchable Pokemon by BST bucket — Gen 1-5
const GEN1_BST_APPROX = {
  low: [
    // Gen 1
    1,4,7,10,11,13,14,16,17,19,20,21,23,27,29,32,41,46,48,52,54,56,60,
    69,72,74,79,81,84,86,96,98,100,102,108,111,116,118,120,129,133,
    // Gen 2
    152,155,158,161,163,165,167,170,172,173,174,175,177,179,183,187,
    191,194,201,204,209,216,218,220,223,225,228,231,235,236,238,246,
    // Gen 3
    252,255,258,261,263,265,266,268,270,273,276,278,280,281,283,285,
    287,290,292,293,296,298,300,304,307,309,316,318,322,325,327,328,
    331,333,339,341,343,349,353,355,360,361,363,366,370,371,374,
    // Gen 4
    387,390,393,396,399,401,403,406,412,415,420,425,427,431,436,438,443,447,449,451,453,456,459,
    // Gen 5
    495,498,501,504,506,509,511,513,515,517,519,522,524,527,529,532,535,540,543,
    546,548,551,554,557,562,564,566,568,570,572,574,577,580,582,585,
    588,590,592,595,597,599,602,605,607,610,613,616,619,622,624,627,629,633,636,
  ],
  midLow: [
    // Gen 1
    25,30,33,35,37,39,43,50,58,61,63,66,73,77,83,92,95,96,104,109,
    113,114,116,120,122,126,127,128,138,140,
    // Gen 2
    164,166,168,180,185,188,190,193,198,206,215,222,234,239,240,246,
    // Gen 3
    267,269,271,274,294,299,302,303,329,345,347,
    // Gen 4
    418,426,428,432,434,437,439,441,444,448,450,452,454,455,457,460,
    // Gen 5
    505,507,510,518,520,523,525,528,530,536,541,544,547,549,552,555,
    558,563,565,567,569,571,573,575,578,581,583,586,589,591,593,596,
    598,600,603,606,608,611,614,617,620,623,625,628,630,634,
  ],
  mid: [
    // Gen 1 (removed 26/36/103/139/141 — minLevel exceeds max level reachable in this bucket)
    2,5,8,42,49,51,64,67,70,75,82,85,93,97,101,105,107,110,119,
    121,124,125,130,137,
    // Gen 2
    153,156,159,162,176,178,184,185,192,195,198,200,202,203,205,206,207,210,215,219,226,227,247,
    // Gen 3
    253,256,259,262,264,277,279,284,288,301,305,308,311,312,313,314,
    315,320,337,338,351,352,358,364,372,
    // Gen 4
    388,391,394,397,404,408,410,419,424,429,430,435,440,446,453,456,458,461,462,463,465,466,467,469,471,472,473,474,476,477,478,479,
    // Gen 5
    496,499,502,508,521,526,533,537,542,545,553,559,560,561,576,579,584,587,594,
    601,604,609,612,615,618,621,626,631,632,635,637,
  ],
  midHigh: [
    // Gen 1 (added 26/36 — need lv36, reachable at map 6+; 117 also here for more coverage)
    26,36,40,44,55,62,76,80,87,88,89,90,91,99,106,115,117,123,131,132,137,142,143,
    // Gen 2
    164,171,176,178,181,186,196,197,199,200,203,205,207,210,211,215,217,221,224,226,227,229,232,233,234,237,
    // Gen 3
    272,275,286,291,297,310,317,319,323,324,326,332,335,336,340,342,
    354,356,357,359,362,367,368,369,375,
    // Gen 4
    400,407,413,416,417,421,423,433,445,464,468,475,
    // Gen 5
    497,500,503,531,538,539,550,556,
  ],
  high: [
    // Gen 1 (added 103/117/139/141 — need lv32-40, always met at high maps lv43+)
    3,6,9,12,15,18,22,24,28,31,34,38,45,47,53,57,59,
    65,68,71,76,78,80,89,94,103,112,117,121,130,134,135,136,139,141,142,143,149,
    // Gen 2
    154,164,171,181,182,186,189,196,197,199,205,208,212,213,214,217,
    229,232,233,241,
    // Gen 3
    282,295,321,330,334,344,346,348,
    // Gen 4
    389,398,402,405,409,411,414,422,431,436,442,448,460,470,
    // Gen 5
    497,500,503,512,514,516,534,
  ],
  veryHigh: [
    // Gen 1
    6,9,65,68,94,112,130,131,143,147,148,149,
    // Gen 2
    157,160,169,230,242,248,
    // Gen 3
    254,257,260,289,306,350,365,373,376,
    // Gen 4
    392,395,445,448,460,466,467,468,473,475,477,
    // Gen 5
    497,500,503,535,537,571,609,612,635,637,
  ],
};

const LEGENDARY_ID_SET = new Set(LEGENDARY_IDS);
const ALL_CATCHABLE_IDS = new Set([
  ...Array.from({ length: 649 }, (_, i) => i + 1).filter(id => !LEGENDARY_ID_SET.has(id)),
]);

function isGenDexComplete(minId, maxId) {
  const dex = getPokedex();
  const caughtIds = new Set(Object.values(dex).filter(e => e.caught).map(e => e.id));
  for (const id of ALL_CATCHABLE_IDS) {
    if (id >= minId && id <= maxId && !caughtIds.has(id)) return false;
  }
  for (const id of LEGENDARY_IDS) {
    if (id >= minId && id <= maxId && !caughtIds.has(id)) return false;
  }
  return true;
}

function isPokedexComplete() { return isGenDexComplete(1, 151); }

function hasShinyCharm() { return isPokedexComplete(); }

// Legendaries grouped by BST tier (used for catch node legendary rolls)
const LEGENDARY_POOL_HIGH     = [144, 145, 146]; // Birds ~485-490
const LEGENDARY_POOL_VERYHIGH = [150,151,243,244,245,249,250,251,377,378,379,380,381,382,383,384,385,386];

async function getRandomLegendary(mapIndex, allowAllGens = false) {
  const isGen2 = typeof state !== 'undefined' && state.gen2Mode;
  const ranges = isGen2 ? GEN2_MAP_BST_RANGES : MAP_BST_RANGES;
  const range  = ranges[Math.min(mapIndex, ranges.length - 1)];
  const veryHighPool = allowAllGens ? LEGENDARY_POOL_VERYHIGH : [150, 151];
  let pool;
  if (range.min >= 530) pool = veryHighPool;
  else if (range.min >= 460) pool = [...LEGENDARY_POOL_HIGH, ...veryHighPool];
  else return null; // too early for legendaries
  const id = pool[Math.floor((typeof rng === 'function' ? rng() : Math.random()) * pool.length)];
  return fetchPokemonById(id);
}

// Get random pokemon from the right BST bucket for a given mapIndex.
// maxGenId restricts to IDs <= that number (151 = Gen 1 only, 649 = all gens).
async function getCatchChoices(mapIndex, count = 3, maxGenId = 151, excludeStarters = false, minGenId = 1) {
  const isGen2  = typeof state !== 'undefined' && state.gen2Mode;
  const ranges  = isGen2 ? GEN2_MAP_BST_RANGES : MAP_BST_RANGES;
  const range   = ranges[Math.min(mapIndex, ranges.length - 1)];
  const pool    = await getSpeciesPool();

  // Gen 2 widens the bucket at higher tiers by combining it with the next-lower
  // tier (deduped). The default Kanto pool was ~36 mostly-overlapping species
  // — pulling in the band below roughly doubles diversity without dragging
  // BST through the floor.
  const widen = (a, b) => isGen2 ? [...new Set([...a, ...b])] : a;
  let bucket;
  if (range.min >= 530)      bucket = widen(GEN1_BST_APPROX.veryHigh, GEN1_BST_APPROX.high);
  else if (range.min >= 460) bucket = widen(GEN1_BST_APPROX.high,     GEN1_BST_APPROX.midHigh);
  else if (range.min >= 400) bucket = widen(GEN1_BST_APPROX.midHigh,  GEN1_BST_APPROX.mid);
  else if (range.min >= 340) bucket = GEN1_BST_APPROX.mid;
  else if (range.min >= 280) bucket = GEN1_BST_APPROX.midLow;
  else                        bucket = GEN1_BST_APPROX.low;

  const starterIds = excludeStarters ? (minGenId >= 152 ? GEN2_STARTER_IDS : STARTER_IDS) : [];
  const starterSet = new Set(starterIds);
  const larvitarLine = new Set([246, 247, 248]);
  const filtered = bucket.filter(id => {
    if (LEGENDARY_IDS.includes(id) || id < minGenId || id > maxGenId || starterSet.has(id)) return false;
    // Larvitar line: gate to the back half of the run (Pryce onward) so Tyranitar isn't trivial.
    if (larvitarLine.has(id) && typeof state !== 'undefined' && state.gen2Mode && state.currentMap < 2) return false;
    return true;
  });
  const shuffled = [...filtered];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const ids = shuffled.slice(0, Math.max(9, count * 3));

  const results = await Promise.all(ids.map(id => fetchPokemonById(id)));
  return results.filter(Boolean).slice(0, count);
}

function calcHp(baseHp, level) {
  return Math.floor(baseHp * level / 50) + level + 10;
}

function createInstance(species, level, isShiny = false, moveTier = 1) {
  const lvl = level || 5;
  const id = species.id ?? species.speciesId;
  const gen2ShinyBoost = isShiny && typeof state !== 'undefined' && state.gen2Mode;
  const baseStats = gen2ShinyBoost
    ? Object.fromEntries(Object.entries(species.baseStats).map(([k, v]) => [k, Math.round(v * 1.2)]))
    : species.baseStats;
  const maxHp = calcHp(baseStats.hp, lvl);
  const spriteUrl = isShiny
    ? (species.shinySpriteUrl || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${id}.png`)
    : (species.spriteUrl      || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`);
  return {
    speciesId: id,
    name: species.name,
    nickname: null,
    level: lvl,
    currentHp: maxHp,
    maxHp,
    isShiny,
    types: species.types,
    baseStats,
    spriteUrl,
    megaStone: null,
    heldItem: null,
    moveTier: Math.max(0, Math.min(2, moveTier ?? 1)),
  };
}

// Starters
const STARTER_IDS = [1, 4, 7];
const GEN2_STARTER_IDS = [152, 155, 158];


// Trainer sprites from Pokemon Showdown CDN
const TRAINER_SVG = {
  boy:  `<img src="https://play.pokemonshowdown.com/sprites/trainers/red.png"  alt="Red"  class="trainer-sprite-img" onerror="this.style.opacity='.3'">`,
  girl: `<img src="https://play.pokemonshowdown.com/sprites/trainers/dawn.png" alt="Dawn" class="trainer-sprite-img" onerror="this.style.opacity='.3'">`,
  npc:  `<img src="https://play.pokemonshowdown.com/sprites/trainers/youngster.png" alt="Trainer" class="trainer-sprite-img" onerror="this.style.opacity='.3'">`,
};

// Name overrides for Pokemon Showdown trainer sprite filenames
const SHOWDOWN_NAME_MAP = { 'gary': 'blue', 'lt. surge': 'ltsurge', 'lorelei': 'lorelei-gen3', 'agatha': 'agatha-gen3' };

function getTrainerImgHtml(trainerName) {
  // Local sprite path (e.g. "sprites/hiker.png") — use directly
  if (trainerName.includes('/')) {
    return `<img src="${trainerName}" alt="Trainer" class="trainer-sprite-img"
      onerror="this.style.opacity='.3';this.onerror=null">`;
  }
  const key = trainerName.toLowerCase();
  const slug = SHOWDOWN_NAME_MAP[key] || key.replace(/[.']/g, '').replace(/\s+/g, '-');
  return `<img src="https://play.pokemonshowdown.com/sprites/trainers/${slug}.png"
    alt="${trainerName}" class="trainer-sprite-img"
    onerror="this.src='https://play.pokemonshowdown.com/sprites/trainers/youngster.png';this.onerror=null">`;
}

// All evolutions across supported gens — stone/trade/friendship converted to sensible levels
const EVOLUTIONS = {
  // Starters
  1:  { into: 2,   level: 16, name: 'Ivysaur' },
  2:  { into: 3,   level: 32, name: 'Venusaur' },
  4:  { into: 5,   level: 16, name: 'Charmeleon' },
  5:  { into: 6,   level: 36, name: 'Charizard' },
  7:  { into: 8,   level: 16, name: 'Wartortle' },
  8:  { into: 9,   level: 36, name: 'Blastoise' },
  // Bugs
  10: { into: 11,  level: 7,  name: 'Metapod' },
  11: { into: 12,  level: 10, name: 'Butterfree' },
  13: { into: 14,  level: 7,  name: 'Kakuna' },
  14: { into: 15,  level: 10, name: 'Beedrill' },
  // Birds / normals
  16: { into: 17,  level: 18, name: 'Pidgeotto' },
  17: { into: 18,  level: 36, name: 'Pidgeot' },
  19: { into: 20,  level: 20, name: 'Raticate' },
  21: { into: 22,  level: 20, name: 'Fearow' },
  25: { into: 26,  level: 36, name: 'Raichu' },        // thunder stone → lv 36
  // Snakes / ground
  23: { into: 24,  level: 22, name: 'Arbok' },
  27: { into: 28,  level: 22, name: 'Sandslash' },
  // Nidos
  29: { into: 30,  level: 16, name: 'Nidorina' },
  30: { into: 31,  level: 36, name: 'Nidoqueen' },  // stone → lv 36
  32: { into: 33,  level: 16, name: 'Nidorino' },
  33: { into: 34,  level: 36, name: 'Nidoking' },   // stone → lv 36
  // Fairies / grass
  35: { into: 36,  level: 36, name: 'Clefable' },   // moon stone → lv 36
  37: { into: 38,  level: 32, name: 'Ninetales' },  // fire stone → lv 32
  39: { into: 40,  level: 36, name: 'Wigglytuff' }, // moon stone → lv 36
  // Zubat
  41: { into: 42,  level: 22, name: 'Golbat' },
  // Grass
  43: { into: 44,  level: 21, name: 'Gloom' },
  44: { into: 45,  level: 36, name: 'Vileplume' },  // leaf stone → lv 36
  // Parasect / Venomoth
  46: { into: 47,  level: 24, name: 'Parasect' },
  48: { into: 49,  level: 31, name: 'Venomoth' },
  // Diglett / Meowth / Psyduck / Mankey
  50: { into: 51,  level: 26, name: 'Dugtrio' },
  52: { into: 53,  level: 28, name: 'Persian' },
  54: { into: 55,  level: 33, name: 'Golduck' },
  56: { into: 57,  level: 28, name: 'Primeape' },
  // Growlithe
  58: { into: 59,  level: 34, name: 'Arcanine' },   // fire stone → lv 34
  // Poliwag
  60: { into: 61,  level: 25, name: 'Poliwhirl' },
  61: { into: 62,  level: 40, name: 'Poliwrath' },  // water stone → lv 40
  // Abra / Machop / Bellsprout
  63: { into: 64,  level: 16, name: 'Kadabra' },
  64: { into: 65,  level: 36, name: 'Alakazam' },   // trade → lv 36
  66: { into: 67,  level: 28, name: 'Machoke' },
  67: { into: 68,  level: 40, name: 'Machamp' },    // trade → lv 40
  69: { into: 70,  level: 21, name: 'Weepinbell' },
  70: { into: 71,  level: 36, name: 'Victreebel' }, // leaf stone → lv 36
  // Tentacool / Geodude / Ponyta
  72: { into: 73,  level: 30, name: 'Tentacruel' },
  74: { into: 75,  level: 25, name: 'Graveler' },
  75: { into: 76,  level: 40, name: 'Golem' },      // trade → lv 40
  77: { into: 78,  level: 40, name: 'Rapidash' },
  // Slowpoke / Magnemite / Doduo / Seel / Grimer
  79: { into: 80,  level: 37, name: 'Slowbro' },    // water stone in some versions → lv 37
  81: { into: 82,  level: 30, name: 'Magneton' },
  82: { into: 462, level: 40, name: 'Magnezone' },  // lv-up in magnetic field → lv 40
  84: { into: 85,  level: 31, name: 'Dodrio' },
  86: { into: 87,  level: 34, name: 'Dewgong' },
  88: { into: 89,  level: 38, name: 'Muk' },
  // Shellder / Gastly / Onix / Drowzee / Krabby / Voltorb
  90: { into: 91,  level: 36, name: 'Cloyster' },   // water stone → lv 36
  92: { into: 93,  level: 25, name: 'Haunter' },
  93: { into: 94,  level: 38, name: 'Gengar' },     // trade → lv 38
  95: { into: 208, level: 40, name: 'Steelix' },    // trade → lv 40 (Steelix #208)
  96: { into: 97,  level: 26, name: 'Hypno' },
  98: { into: 99,  level: 28, name: 'Kingler' },
  100:{ into: 101, level: 30, name: 'Electrode' },
  // Exeggcute / Cubone / Lickitung / Koffing / Rhyhorn
  102:{ into: 103, level: 36, name: 'Exeggutor' },  // leaf stone → lv 36
  104:{ into: 105, level: 28, name: 'Marowak' },
  108:{ into: 463, level: 33, name: 'Lickilicky' }, // lv-up with Rollout → lv 33
  109:{ into: 110, level: 35, name: 'Weezing' },
  111:{ into: 112, level: 42, name: 'Rhydon' },
  112:{ into: 464, level: 42, name: 'Rhyperior' },  // trade → lv 42
  113:{ into: 242, level: 38, name: 'Blissey' },    // friendship → lv 38
  114:{ into: 465, level: 36, name: 'Tangrowth' },  // lv-up with AncientPower → lv 36
  // Horsea / Goldeen / Staryu / Scyther / Electabuzz / Magmar / Pinsir
  116:{ into: 117, level: 32, name: 'Seadra' },
  117:{ into: 230, level: 40, name: 'Kingdra' },    // trade → lv 40
  118:{ into: 119, level: 33, name: 'Seaking' },
  120:{ into: 121, level: 36, name: 'Starmie' },    // water stone → lv 36
  123:{ into: 212, level: 40, name: 'Scizor' },     // trade → lv 40 (Scizor #212)
  125:{ into: 466, level: 40, name: 'Electivire' }, // trade → lv 40
  126:{ into: 467, level: 40, name: 'Magmortar' },  // trade → lv 40
  // Eevee — branching, handled separately
  // Porygon chain
  137:{ into: 233, level: 30, name: 'Porygon2' },   // trade → lv 30
  233:{ into: 474, level: 40, name: 'Porygon-Z' },  // trade → lv 40
  // Omanyte / Kabuto / Aerodactyl (fossils — no evolution here)
  138:{ into: 139, level: 40, name: 'Omastar' },
  140:{ into: 141, level: 40, name: 'Kabutops' },
  // Dratini
  129:{ into: 130, level: 20, name: 'Gyarados' },
  147:{ into: 148, level: 30, name: 'Dragonair' },
  148:{ into: 149, level: 55, name: 'Dragonite' },
  // Gen 1 -> Gen 2 cross-gen evolutions
  42: { into: 169, level: 30, name: 'Crobat' },
  // Gen 2 starters
  152:{ into: 153, level: 16, name: 'Bayleef' },
  153:{ into: 154, level: 32, name: 'Meganium' },
  155:{ into: 156, level: 14, name: 'Quilava' },
  156:{ into: 157, level: 36, name: 'Typhlosion' },
  158:{ into: 159, level: 18, name: 'Croconaw' },
  159:{ into: 160, level: 30, name: 'Feraligatr' },
  // Gen 2 routes
  161:{ into: 162, level: 15, name: 'Furret' },
  163:{ into: 164, level: 20, name: 'Noctowl' },
  165:{ into: 166, level: 18, name: 'Ledian' },
  167:{ into: 168, level: 22, name: 'Ariados' },
  170:{ into: 171, level: 27, name: 'Lanturn' },
  172:{ into: 25,  level: 15, name: 'Pikachu' },
  173:{ into: 35,  level: 15, name: 'Clefairy' },
  174:{ into: 39,  level: 15, name: 'Jigglypuff' },
  175:{ into: 176, level: 15, name: 'Togetic' },
  176:{ into: 468, level: 40, name: 'Togekiss' },   // shiny stone → lv 40
  177:{ into: 178, level: 25, name: 'Xatu' },
  179:{ into: 180, level: 15, name: 'Flaaffy' },
  180:{ into: 181, level: 30, name: 'Ampharos' },
  183:{ into: 184, level: 18, name: 'Azumarill' },
  187:{ into: 188, level: 18, name: 'Skiploom' },
  188:{ into: 189, level: 27, name: 'Jumpluff' },
  191:{ into: 192, level: 30, name: 'Sunflora' },
  194:{ into: 195, level: 20, name: 'Quagsire' },
  204:{ into: 205, level: 31, name: 'Forretress' },
  209:{ into: 210, level: 23, name: 'Granbull' },
  190:{ into: 424, level: 32, name: 'Ambipom' },    // lv-up with Double Hit → lv 32
  193:{ into: 469, level: 33, name: 'Yanmega' },    // lv-up with AncientPower → lv 33
  198:{ into: 430, level: 36, name: 'Honchkrow' },  // dusk stone → lv 36
  200:{ into: 429, level: 36, name: 'Mismagius' },  // dusk stone → lv 36
  207:{ into: 472, level: 40, name: 'Gliscor' },    // item at night → lv 40
  215:{ into: 461, level: 40, name: 'Weavile' },
  216:{ into: 217, level: 30, name: 'Ursaring' },
  218:{ into: 219, level: 38, name: 'Magcargo' },
  220:{ into: 221, level: 33, name: 'Piloswine' },
  221:{ into: 473, level: 40, name: 'Mamoswine' },  // lv-up with AncientPower → lv 40
  223:{ into: 224, level: 25, name: 'Octillery' },
  228:{ into: 229, level: 24, name: 'Houndoom' },
  231:{ into: 232, level: 25, name: 'Donphan' },
  238:{ into: 124, level: 30, name: 'Jynx' },
  239:{ into: 125, level: 30, name: 'Electabuzz' },
  240:{ into: 126, level: 30, name: 'Magmar' },
  246:{ into: 247, level: 30, name: 'Pupitar' },
  247:{ into: 248, level: 55, name: 'Tyranitar' },
  360:{ into: 202, level: 15, name: 'Wobbuffet' },
  // Gen 3 starters
  252:{ into: 253, level: 16, name: 'Grovyle' },
  253:{ into: 254, level: 36, name: 'Sceptile' },
  255:{ into: 256, level: 16, name: 'Combusken' },
  256:{ into: 257, level: 36, name: 'Blaziken' },
  258:{ into: 259, level: 16, name: 'Marshtomp' },
  259:{ into: 260, level: 36, name: 'Swampert' },
  // Gen 3 routes
  261:{ into: 262, level: 18, name: 'Mightyena' },
  263:{ into: 264, level: 20, name: 'Linoone' },
  265:{ into: 266, level: 7,  name: 'Silcoon' },
  266:{ into: 267, level: 10, name: 'Beautifly' },
  268:{ into: 269, level: 10, name: 'Dustox' },
  270:{ into: 271, level: 14, name: 'Lombre' },
  271:{ into: 272, level: 30, name: 'Ludicolo' },
  273:{ into: 274, level: 14, name: 'Nuzleaf' },
  274:{ into: 275, level: 30, name: 'Shiftry' },
  276:{ into: 277, level: 22, name: 'Swellow' },
  278:{ into: 279, level: 25, name: 'Pelipper' },
  280:{ into: 281, level: 20, name: 'Kirlia' },
  281:{ into: 282, level: 30, name: 'Gardevoir' },
  283:{ into: 284, level: 22, name: 'Masquerain' },
  285:{ into: 286, level: 23, name: 'Breloom' },
  287:{ into: 288, level: 18, name: 'Vigoroth' },
  288:{ into: 289, level: 36, name: 'Slaking' },
  290:{ into: 291, level: 20, name: 'Ninjask' },
  293:{ into: 294, level: 20, name: 'Loudred' },
  294:{ into: 295, level: 40, name: 'Exploud' },
  296:{ into: 297, level: 24, name: 'Hariyama' },
  298:{ into: 183, level: 15, name: 'Marill' },
  299:{ into: 476, level: 36, name: 'Probopass' },  // magnetic field → lv 36
  300:{ into: 301, level: 30, name: 'Delcatty' },
  304:{ into: 305, level: 32, name: 'Lairon' },
  305:{ into: 306, level: 42, name: 'Aggron' },
  307:{ into: 308, level: 37, name: 'Medicham' },
  309:{ into: 310, level: 26, name: 'Manectric' },
  315:{ into: 407, level: 40, name: 'Roserade' },   // shiny stone → lv 40
  316:{ into: 317, level: 26, name: 'Swalot' },
  318:{ into: 319, level: 30, name: 'Sharpedo' },
  320:{ into: 321, level: 40, name: 'Wailord' },
  322:{ into: 323, level: 33, name: 'Camerupt' },
  325:{ into: 326, level: 32, name: 'Grumpig' },
  328:{ into: 329, level: 35, name: 'Vibrava' },
  329:{ into: 330, level: 45, name: 'Flygon' },
  331:{ into: 332, level: 32, name: 'Cacturne' },
  333:{ into: 334, level: 35, name: 'Altaria' },
  339:{ into: 340, level: 30, name: 'Whiscash' },
  341:{ into: 342, level: 30, name: 'Crawdaunt' },
  343:{ into: 344, level: 36, name: 'Claydol' },
  345:{ into: 346, level: 40, name: 'Cradily' },
  347:{ into: 348, level: 40, name: 'Armaldo' },
  349:{ into: 350, level: 35, name: 'Milotic' },
  353:{ into: 354, level: 37, name: 'Banette' },
  355:{ into: 356, level: 37, name: 'Dusclops' },
  356:{ into: 477, level: 40, name: 'Dusknoir' },   // trade → lv 40
  361:{ into: 362, level: 42, name: 'Glalie' },
  363:{ into: 364, level: 32, name: 'Sealeo' },
  364:{ into: 365, level: 44, name: 'Walrein' },
  371:{ into: 372, level: 30, name: 'Shelgon' },
  372:{ into: 373, level: 50, name: 'Salamence' },
  374:{ into: 375, level: 20, name: 'Metang' },
  375:{ into: 376, level: 45, name: 'Metagross' },
  // Gen 4
  387:{ into: 388, level: 18, name: 'Grotle' },
  388:{ into: 389, level: 32, name: 'Torterra' },
  390:{ into: 391, level: 14, name: 'Monferno' },
  391:{ into: 392, level: 36, name: 'Infernape' },
  393:{ into: 394, level: 16, name: 'Prinplup' },
  394:{ into: 395, level: 36, name: 'Empoleon' },
  396:{ into: 397, level: 14, name: 'Staravia' },
  397:{ into: 398, level: 34, name: 'Staraptor' },
  399:{ into: 400, level: 15, name: 'Bibarel' },
  401:{ into: 402, level: 10, name: 'Kricketune' },
  403:{ into: 404, level: 15, name: 'Luxio' },
  404:{ into: 405, level: 30, name: 'Luxray' },
  406:{ into: 315, level: 18, name: 'Roselia' },
  408:{ into: 409, level: 30, name: 'Rampardos' },
  410:{ into: 411, level: 30, name: 'Bastiodon' },
  415:{ into: 416, level: 21, name: 'Vespiquen' },
  418:{ into: 419, level: 26, name: 'Floatzel' },
  420:{ into: 421, level: 25, name: 'Cherrim' },
  422:{ into: 423, level: 30, name: 'Gastrodon' },
  425:{ into: 426, level: 28, name: 'Drifblim' },
  427:{ into: 428, level: 28, name: 'Lopunny' },
  431:{ into: 432, level: 38, name: 'Purugly' },
  434:{ into: 435, level: 34, name: 'Skuntank' },
  436:{ into: 437, level: 33, name: 'Bronzong' },
  443:{ into: 444, level: 24, name: 'Gabite' },
  444:{ into: 445, level: 48, name: 'Garchomp' },
  438:{ into: 185, level: 16, name: 'Sudowoodo' },  // lv-up with Mimic → lv 16
  439:{ into: 122, level: 18, name: 'Mr. Mime' },   // lv-up with Mimic → lv 18
  440:{ into: 113, level: 12, name: 'Chansey' },    // friendship → lv 12
  446:{ into: 143, level: 32, name: 'Snorlax' },
  447:{ into: 448, level: 32, name: 'Lucario' },
  449:{ into: 450, level: 34, name: 'Hippowdon' },
  451:{ into: 452, level: 40, name: 'Drapion' },
  453:{ into: 454, level: 37, name: 'Toxicroak' },
  456:{ into: 457, level: 31, name: 'Lumineon' },
  458:{ into: 226, level: 32, name: 'Mantine' },    // lv-up with Remoraid in party → lv 32
  459:{ into: 460, level: 40, name: 'Abomasnow' },
  // Gen 5
  495:{ into: 496, level: 17, name: 'Servine' },
  496:{ into: 497, level: 36, name: 'Serperior' },
  498:{ into: 499, level: 17, name: 'Pignite' },
  499:{ into: 500, level: 36, name: 'Emboar' },
  501:{ into: 502, level: 17, name: 'Dewott' },
  502:{ into: 503, level: 36, name: 'Samurott' },
  504:{ into: 505, level: 20, name: 'Watchog' },
  506:{ into: 507, level: 16, name: 'Herdier' },
  507:{ into: 508, level: 32, name: 'Stoutland' },
  509:{ into: 510, level: 20, name: 'Liepard' },
  511:{ into: 512, level: 32, name: 'Simisage' },
  513:{ into: 514, level: 32, name: 'Simisear' },
  515:{ into: 516, level: 32, name: 'Simipour' },
  517:{ into: 518, level: 30, name: 'Musharna' },
  519:{ into: 520, level: 21, name: 'Tranquill' },
  520:{ into: 521, level: 32, name: 'Unfezant' },
  522:{ into: 523, level: 27, name: 'Zebstrika' },
  524:{ into: 525, level: 25, name: 'Boldore' },
  525:{ into: 526, level: 40, name: 'Gigalith' },
  527:{ into: 528, level: 32, name: 'Swoobat' },
  529:{ into: 530, level: 31, name: 'Excadrill' },
  532:{ into: 533, level: 25, name: 'Gurdurr' },
  533:{ into: 534, level: 40, name: 'Conkeldurr' },
  535:{ into: 536, level: 25, name: 'Palpitoad' },
  536:{ into: 537, level: 36, name: 'Seismitoad' },
  540:{ into: 541, level: 20, name: 'Swadloon' },
  541:{ into: 542, level: 30, name: 'Leavanny' },
  543:{ into: 544, level: 22, name: 'Whirlipede' },
  544:{ into: 545, level: 30, name: 'Scolipede' },
  546:{ into: 547, level: 32, name: 'Whimsicott' },
  548:{ into: 549, level: 28, name: 'Lilligant' },
  551:{ into: 552, level: 29, name: 'Krokorok' },
  552:{ into: 553, level: 40, name: 'Krookodile' },
  554:{ into: 555, level: 35, name: 'Darmanitan' },
  557:{ into: 558, level: 34, name: 'Crustle' },
  559:{ into: 560, level: 39, name: 'Scrafty' },
  562:{ into: 563, level: 34, name: 'Cofagrigus' },
  564:{ into: 565, level: 37, name: 'Carracosta' },
  566:{ into: 567, level: 37, name: 'Archeops' },
  568:{ into: 569, level: 36, name: 'Garbodor' },
  570:{ into: 571, level: 30, name: 'Zoroark' },
  572:{ into: 573, level: 25, name: 'Cinccino' },
  574:{ into: 575, level: 32, name: 'Gothorita' },
  575:{ into: 576, level: 41, name: 'Gothitelle' },
  577:{ into: 578, level: 32, name: 'Duosion' },
  578:{ into: 579, level: 41, name: 'Reuniclus' },
  580:{ into: 581, level: 35, name: 'Swanna' },
  582:{ into: 583, level: 35, name: 'Vanillish' },
  583:{ into: 584, level: 47, name: 'Vanilluxe' },
  585:{ into: 586, level: 34, name: 'Sawsbuck' },
  588:{ into: 589, level: 30, name: 'Escavalier' },
  590:{ into: 591, level: 39, name: 'Amoonguss' },
  592:{ into: 593, level: 40, name: 'Jellicent' },
  595:{ into: 596, level: 36, name: 'Galvantula' },
  597:{ into: 598, level: 40, name: 'Ferrothorn' },
  599:{ into: 600, level: 38, name: 'Klang' },
  600:{ into: 601, level: 49, name: 'Klinklang' },
  602:{ into: 603, level: 39, name: 'Eelektrik' },
  603:{ into: 604, level: 50, name: 'Eelektross' },
  605:{ into: 606, level: 42, name: 'Beheeyem' },
  607:{ into: 608, level: 41, name: 'Lampent' },
  608:{ into: 609, level: 55, name: 'Chandelure' },
  610:{ into: 611, level: 38, name: 'Fraxure' },
  611:{ into: 612, level: 48, name: 'Haxorus' },
  613:{ into: 614, level: 37, name: 'Beartic' },
  616:{ into: 617, level: 30, name: 'Accelgor' },
  619:{ into: 620, level: 50, name: 'Mienshao' },
  622:{ into: 623, level: 43, name: 'Golurk' },
  624:{ into: 625, level: 52, name: 'Bisharp' },
  627:{ into: 628, level: 54, name: 'Braviary' },
  629:{ into: 630, level: 54, name: 'Mandibuzz' },
  633:{ into: 634, level: 50, name: 'Zweilous' },
  634:{ into: 635, level: 64, name: 'Hydreigon' },
  636:{ into: 637, level: 59, name: 'Volcarona' },
};

// Returns the minimum realistic level for a species based on its evolution chain.
// e.g. Charizard (id 6) evolved from Charmeleon at lv 36, so its min is 36.
function minLevelForSpecies(speciesId) {
  for (const evo of Object.values(EVOLUTIONS)) {
    if (evo.into === speciesId) return evo.level;
  }
  return 1;
}

// Returns true if the species can still evolve (i.e. is not fully evolved)
function canEvolve(speciesId) {
  return speciesId in EVOLUTIONS || speciesId in BRANCHING_EVOLUTIONS;
}

// Returns the correct species ID for a given level by walking the evolution chain.
// Advances forward if level meets thresholds; retreats backward if level is too low.
function resolveEvoForLevel(speciesId, level) {
  let id = speciesId;
  while (EVOLUTIONS[id] && level >= EVOLUTIONS[id].level)
    id = EVOLUTIONS[id].into;
  let changed = true;
  while (changed) {
    changed = false;
    // Linear pre-evolution
    for (const [pre, evo] of Object.entries(EVOLUTIONS)) {
      if (evo.into === id && level < evo.level) { id = Number(pre); changed = true; break; }
    }
    if (changed) continue;
    // Branching pre-evolution (e.g. Politoed → Poliwhirl, Bellossom → Gloom)
    for (const [pre, branches] of Object.entries(BRANCHING_EVOLUTIONS)) {
      const branch = branches.find(b => b.into === id);
      if (branch && level < branch.level) { id = Number(pre); changed = true; break; }
    }
  }
  return id;
}

// Branching evolution options for all multi-path Pokemon (shown as a player choice)
const BRANCHING_EVOLUTIONS = {
  133: [ // Eevee
    { into: 136, level: 20, name: 'Flareon',   types: ['Fire'] },
    { into: 134, level: 20, name: 'Vaporeon',  types: ['Water'] },
    { into: 135, level: 20, name: 'Jolteon',   types: ['Electric'] },
    { into: 196, level: 20, name: 'Espeon',    types: ['Psychic'] },
    { into: 197, level: 20, name: 'Umbreon',   types: ['Dark'] },
    { into: 470, level: 20, name: 'Leafeon',   types: ['Grass'] },
    { into: 471, level: 20, name: 'Glaceon',   types: ['Ice'] },
  ],
  44: [ // Gloom
    { into: 45,  level: 36, name: 'Vileplume', types: ['Grass', 'Poison'] },
    { into: 182, level: 36, name: 'Bellossom', types: ['Grass'] },
  ],
  79: [ // Slowpoke
    { into: 80,  level: 37, name: 'Slowbro',   types: ['Water', 'Psychic'] },
    { into: 199, level: 37, name: 'Slowking',  types: ['Water', 'Psychic'] },
  ],
  61: [ // Poliwhirl
    { into: 62,  level: 40, name: 'Poliwrath', types: ['Water', 'Fighting'] },
    { into: 186, level: 40, name: 'Politoed',  types: ['Water'] },
  ],
  281: [ // Kirlia
    { into: 282, level: 30, name: 'Gardevoir', types: ['Psychic', 'Fairy'] },
    { into: 475, level: 30, name: 'Gallade',   types: ['Psychic', 'Fighting'] },
  ],
  361: [ // Snorunt
    { into: 362, level: 42, name: 'Glalie',    types: ['Ice'] },
    { into: 478, level: 42, name: 'Froslass',  types: ['Ice', 'Ghost'] },
  ],
  236: [ // Tyrogue
    { into: 106, level: 20, name: 'Hitmonlee',  types: ['Fighting'] },
    { into: 107, level: 20, name: 'Hitmonchan', types: ['Fighting'] },
    { into: 237, level: 20, name: 'Hitmontop',  types: ['Fighting'] },
  ],
  265: [ // Wurmple
    { into: 266, level: 7, name: 'Silcoon', types: ['Bug'] },
    { into: 268, level: 7, name: 'Cascoon', types: ['Bug'] },
  ],
  412: [ // Burmy
    { into: 414, level: 20, name: 'Mothim',   types: ['Bug', 'Flying'] },
    { into: 413, level: 20, name: 'Wormadam', types: ['Bug', 'Grass']  },
  ],
};

// ---- Achievements ----

const ACHIEVEMENTS = [
  { id: 'gym_0', name: 'Boulder Basher',    desc: 'Clear Map 1 and defeat Brock',                                           icon: '🪨', category: 'normal' },
  { id: 'gym_1', name: 'Cascade Crusher',   desc: 'Clear Map 2 and defeat Misty',                                           icon: '💧', category: 'normal' },
  { id: 'gym_2', name: 'Thunder Tamer',     desc: 'Clear Map 3 and defeat Lt. Surge',                                       icon: '⚡', category: 'normal' },
  { id: 'gym_3', name: 'Rainbow Ranger',    desc: 'Clear Map 4 and defeat Erika',                                           icon: '🌿', category: 'normal' },
  { id: 'gym_4', name: 'Soul Crusher',      desc: 'Clear Map 5 and defeat Koga',                                            icon: '💜', category: 'normal' },
  { id: 'gym_5', name: 'Mind Breaker',      desc: 'Clear Map 6 and defeat Sabrina',                                         icon: '🔮', category: 'normal' },
  { id: 'gym_6', name: 'Volcano Victor',    desc: 'Clear Map 7 and defeat Blaine',                                          icon: '🌋', category: 'normal' },
  { id: 'gym_7', name: 'Earth Shaker',      desc: 'Clear Map 8 and defeat Giovanni',                                        icon: '🌍', category: 'normal' },
  { id: 'elite_four', name: 'Pokemon Master',    desc: 'Defeat all 4 Elite Four members and the Champion to beat the game', icon: '👑', category: 'normal' },
  { id: 'elite_10',   name: 'Champion League',   desc: 'Beat the game 10 times total',                                      icon: '🏆', category: 'normal' },
  { id: 'elite_100',  name: 'Immortal Champion', desc: 'Beat the game 100 times total',                                     icon: '💎', category: 'normal' },
  { id: 'starter_1', name: 'Grass Champion',  desc: 'Choose Bulbasaur as your starter and beat the game',                   icon: '🌱', category: 'normal' },
  { id: 'starter_4', name: 'Fire Champion',   desc: 'Choose Charmander as your starter and beat the game',                  icon: '🔥', category: 'normal' },
  { id: 'starter_7', name: 'Water Champion',  desc: 'Choose Squirtle as your starter and beat the game',                    icon: '🌊', category: 'normal' },
  { id: 'solo_run',    name: 'One is Enough',        desc: 'Beat the game while keeping only 1 Pokémon on your team',       icon: '⭐', category: 'normal' },
  { id: 'nuzlocke_win',      name: 'True Master',    desc: 'Enable Nuzlocke Mode in Settings, then beat the game — if any Pokémon faints, it\'s gone for good', icon: '☠️', category: 'normal' },
  { id: 'three_birds',       name: 'Bird Keeper',    desc: 'Beat the game with Articuno, Zapdos, and Moltres all on your team', icon: '🦅', category: 'normal' },
  { id: 'no_pokecenter',     name: 'No Rest for the Wicked', desc: 'Beat the game without stopping at a Pokémon Center',   icon: '🏃', category: 'normal' },
  { id: 'no_items',          name: 'Minimalist',     desc: 'Beat the game without picking up a single item',                icon: '🎒', category: 'normal' },
  { id: 'type_quartet',      name: 'Type Supremacy', desc: 'Beat the game with at least 4 of your 6 Pokémon sharing the same type', icon: '🔣', category: 'normal' },
  { id: 'all_shiny_win',     name: 'Shiny Squad',    desc: 'Beat the game with every Pokémon on your team being shiny (minimum 3)', icon: '💫', category: 'normal' },
  { id: 'back_to_back',      name: 'On a Roll',        desc: 'Beat the game twice in a row without losing a run in between',       icon: '🔁', category: 'normal' },
  { id: 'back_3_back',       name: 'Hat Trick',        desc: 'Beat the game three times in a row without losing a run in between',    icon: '🎩', category: 'normal' },
  { id: 'endless_stage_1',  name: 'Kanto Champion',  desc: 'Defeat Ash Ketchum and clear Stage 1 of Battle Tower',   icon: '🌀', category: 'tower' },
  { id: 'endless_stage_2',  name: 'Johto Champion',  desc: 'Defeat Lance and clear Stage 2 of Battle Tower',          icon: '🌊', category: 'tower' },
  { id: 'endless_stage_3',  name: 'Hoenn Champion',  desc: 'Defeat Steven Stone and clear Stage 3 of Battle Tower',   icon: '⚔️', category: 'tower' },
  { id: 'endless_stage_4',  name: 'Sinnoh Champion', desc: 'Defeat Cynthia and clear Stage 4 of Battle Tower',        icon: '💎', category: 'tower' },
  { id: 'endless_stage_5',  name: 'Unova Champion',  desc: 'Defeat N and clear Stage 5 of Battle Tower',              icon: '🏅', category: 'tower' },
  { id: 'starters_stage_1', name: "Oak's Challenge",     desc: 'Win a Stage 1 run starting with Bulbasaur, Charmander, or Squirtle',  icon: '🌿', category: 'tower' },
  { id: 'starters_stage_2', name: "Elm's Challenge",     desc: 'Win a Stage 2 run starting with Chikorita, Cyndaquil, or Totodile',   icon: '🍃', category: 'tower' },
  { id: 'starters_stage_3', name: "Birch's Challenge",   desc: 'Win a Stage 3 run starting with Treecko, Torchic, or Mudkip',         icon: '🌊', category: 'tower' },
  { id: 'starters_stage_4', name: "Rowan's Challenge",   desc: 'Win a Stage 4 run starting with Turtwig, Chimchar, or Piplup',        icon: '⛰️', category: 'tower' },
  { id: 'starters_stage_5', name: "Juniper's Challenge", desc: 'Win a Stage 5 run starting with Snivy, Tepig, or Oshawott',           icon: '🌀', category: 'tower' },
  { id: 'pokedex_complete',  name: 'Gotta Catch \'Em All', desc: 'Catch all Gen 1 Pokémon across any number of runs', icon: '📖', category: 'general' },
  { id: 'shinydex_complete', name: 'Shiny Hunter',         desc: 'Catch a shiny version of every Gen 1 Pokémon',         icon: '✨', category: 'general' },
  { id: 'shinydex_all',      name: 'Ultimate Shiny Hunter', desc: 'Catch a shiny version of every Pokémon across all gens', icon: '🌟', category: 'general' },
  { id: 'pokedex_gen2', name: 'Johto Completionist', desc: 'Catch all Gen 2 Pokémon across any number of runs', icon: '📗', category: 'general' },
  { id: 'pokedex_gen3', name: 'Hoenn Completionist', desc: 'Catch all Gen 3 Pokémon across any number of runs', icon: '📘', category: 'general' },
  { id: 'pokedex_gen4', name: 'Sinnoh Completionist', desc: 'Catch all Gen 4 Pokémon across any number of runs', icon: '📙', category: 'general' },
  { id: 'pokedex_gen5', name: 'Unova Completionist',  desc: 'Catch all Gen 5 Pokémon across any number of runs', icon: '📕', category: 'general' },
  { id: 'max_stats_1',   name: 'First Peak',       desc: 'Max out 1 stat on a single Pokémon',        icon: '📈', category: 'general' },
  { id: 'max_stats_2',   name: 'Double Peak',      desc: 'Max out 2 stats on a single Pokémon',       icon: '📊', category: 'general' },
  { id: 'max_stats_3',   name: 'Triple Peak',      desc: 'Max out 3 stats on a single Pokémon',       icon: '🔝', category: 'general' },
  { id: 'max_stats_4',   name: 'Quad Peak',        desc: 'Max out 4 stats on a single Pokémon',       icon: '💪', category: 'general' },
  { id: 'max_stats_all', name: 'Perfect Specimen',  desc: 'Max out all 5 stats on a single Pokémon',   icon: '🏅', category: 'general' },
  { id: 'shinydex_100', name: 'Shiny Spark',      desc: 'Catch 100 different shiny Pokémon',  icon: '⭐', category: 'general' },
  { id: 'shinydex_200', name: 'Shiny Flash',      desc: 'Catch 200 different shiny Pokémon',  icon: '💥', category: 'general' },
  { id: 'shinydex_300', name: 'Shiny Blaze',      desc: 'Catch 300 different shiny Pokémon',  icon: '🔥', category: 'general' },
  { id: 'shinydex_400', name: 'Shiny Storm',      desc: 'Catch 400 different shiny Pokémon',  icon: '⚡', category: 'general' },
  { id: 'shinydex_500', name: 'Shiny Legend',     desc: 'Catch 500 different shiny Pokémon',  icon: '💎', category: 'general' },
  { id: 'shinydex_600', name: 'Shiny Immortal',   desc: 'Catch 600 different shiny Pokémon',  icon: '👑', category: 'general' },
];

function getUnlockedAchievements() {
  try { return new Set(JSON.parse(localStorage.getItem('poke_achievements') || '[]')); }
  catch { return new Set(); }
}

function unlockAchievement(id) {
  const unlocked = getUnlockedAchievements();
  if (unlocked.has(id)) return null;
  unlocked.add(id);
  localStorage.setItem('poke_achievements', JSON.stringify([...unlocked]));
  return ACHIEVEMENTS.find(a => a.id === id) || null;
}

// ---- Pokedex ----

function getPokedex() {
  try { return JSON.parse(localStorage.getItem('poke_dex') || '{}'); }
  catch { return {}; }
}

function markPokedexSeen(id, name, types, spriteUrl) {
  if (!id) return;
  const dex = getPokedex();
  if (!dex[id]) {
    dex[id] = { id, name, types, spriteUrl, caught: false };
    localStorage.setItem('poke_dex', JSON.stringify(dex));
  }
}

function markPokedexCaught(id, name, types, spriteUrl) {
  if (!id) return;
  const dex = getPokedex();
  dex[id] = { ...(dex[id] || {}), id, caught: true,
    name:      name      || dex[id]?.name,
    types:     types     || dex[id]?.types,
    spriteUrl: spriteUrl || dex[id]?.spriteUrl,
  };
  localStorage.setItem('poke_dex', JSON.stringify(dex));
}

function getShinyDex() {
  try { return JSON.parse(localStorage.getItem('poke_shiny_dex') || '{}'); }
  catch { return {}; }
}

function hasNuzlockeModeWin() {
  return getUnlockedAchievements().has('nuzlocke_win');
}

function getEliteWins() {
  return parseInt(localStorage.getItem('poke_elite_wins') || '0', 10);
}

function incrementEliteWins() {
  const wins = getEliteWins() + 1;
  localStorage.setItem('poke_elite_wins', String(wins));
  return wins;
}

// Returns an <img> for the item's official sprite, falling back to its emoji if the sprite 404s
function itemIconHtml(item, size = 24) {
  const slug = item.id.replace(/_/g, '-');
  const url = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${slug}.png`;
  const esc = item.icon.replace(/'/g, "\\'");
  return `<img src="${url}" alt="${item.name}" title="${item.name}" class="item-sprite-icon" `
       + `style="width:${size}px;height:${size}px;image-rendering:pixelated;vertical-align:middle;" `
       + `onerror="this.replaceWith(document.createTextNode('${esc}'))">`;
}

function isShinyGenDexComplete(minId, maxId) {
  const dex = getShinyDex();
  const caughtIds = new Set(Object.values(dex).map(e => e.id));
  for (const id of ALL_CATCHABLE_IDS) {
    if (id >= minId && id <= maxId && !caughtIds.has(id)) return false;
  }
  for (const id of LEGENDARY_ID_SET) {
    if (id >= minId && id <= maxId && !caughtIds.has(id)) return false;
  }
  return true;
}

function isShinyDexComplete() { return isShinyGenDexComplete(1, 151); }

function markShinyDexCaught(id, name, types, shinySpriteUrl) {
  if (!id) return;
  const dex = getShinyDex();
  dex[id] = { id, name, types, shinySpriteUrl };
  localStorage.setItem('poke_shiny_dex', JSON.stringify(dex));
}

// ---- Hall of Fame ----

function getHallOfFame() {
  try { return JSON.parse(localStorage.getItem('poke_hall_of_fame') || '[]'); }
  catch { return []; }
}

function getUsedStarters() {
  try { return JSON.parse(localStorage.getItem('poke_used_starters') || '[]'); }
  catch { return []; }
}
function recordUsedStarter(speciesId) {
  const list = getUsedStarters();
  if (!list.includes(speciesId)) {
    list.push(speciesId);
    localStorage.setItem('poke_used_starters', JSON.stringify(list));
  }
}

function saveHallOfFameEntry(team, runNumber, hardMode, endless = false, stageNumber = null, starterSpeciesId = null) {
  const entries = getHallOfFame();
  entries.push({
    savedAt: Date.now(),
    runNumber,
    hardMode: !!hardMode,
    endless: !!endless,
    stageNumber: stageNumber ?? null,
    starterSpeciesId: starterSpeciesId ?? null,
    date: new Date().toLocaleDateString(),
    team: team.map(p => ({
      speciesId: p.speciesId,
      name: p.name,
      nickname: p.nickname || null,
      level: p.level,
      types: p.types,
      spriteUrl: p.spriteUrl,
      isShiny: !!p.isShiny,
      heldItem: p.heldItem || null,
    })),
  });
  localStorage.setItem('poke_hall_of_fame', JSON.stringify(entries));
}
