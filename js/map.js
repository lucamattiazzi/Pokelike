// map.js - Node map generation and rendering

const NODE_TYPES = {
  START: 'start',
  BATTLE: 'battle',
  CATCH: 'catch',
  ITEM: 'item',
  QUESTION: 'question',
  BOSS: 'boss',
  POKECENTER: 'pokecenter',
  TRAINER: 'trainer',
  LEGENDARY: 'legendary',
  MOVE_TUTOR: 'move_tutor',
  TRADE: 'trade',
  SILVER: 'silver',
};

const NODE_WEIGHTS = [
  // L1
  { battle: 25, catch: 30, item: 15, trainer: 30, question: 0,  pokecenter: 0,  move_tutor: 0, trade: 0, legendary: 0 },
  // L2
  { battle: 20, catch: 20, item: 15, trainer: 30, question: 10, pokecenter: 0,  move_tutor: 0, trade: 5, legendary: 0 },
  // L3
  { battle: 16, catch: 14, item: 12, trainer: 27, question: 13, pokecenter: 0,  move_tutor: 9, trade: 9, legendary: 0 },
  // L4
  { battle: 13, catch: 12, item: 10, trainer: 27, question: 13, pokecenter: 0,  move_tutor: 8, trade: 8, legendary: 0 },
  // L5
  { battle: 13, catch: 10, item:  8, trainer: 27, question: 18, pokecenter: 0,  move_tutor: 8, trade: 7, legendary: 0 },
  // L6
  { battle: 20, catch:  9, item: 14, trainer: 18, question:  9, pokecenter: 0,  move_tutor: 0, trade: 0, legendary: 0 },
];

function weightedRandom(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (const [k, v] of Object.entries(weights)) {
    r -= v;
    if (r <= 0) return k;
  }
  return Object.keys(weights)[0];
}

function generateMap(mapIndex, nuzlockeMode = false, gen2Mode = false) {
  // Layer sizes: start(1), catch/battle(2), content, boss(1)
  const CONTENT_SIZES = [3, 4, 3, 4, 3, 2]; // layers 2–7
  // Silver shows up as an optional node on these gen2 maps. Players who want
  // the bonus XP can route through him; others can take a different path.
  const hasSilverNode = gen2Mode && [1, 3, 5, 7, 10, 13, 15].includes(mapIndex);
  const contentCount  = CONTENT_SIZES.length;
  const bossLayerIdx  = 2 + CONTENT_SIZES.length;
  const bossId        = `n${bossLayerIdx}_0`;

  // ── Helpers ──────────────────────────────────────────────────────

  const assignTrainerSprite = (node, nodeId) => {
    const availableKeys = TRAINER_SPRITE_KEYS.filter(k => {
      if (k === 'aceTrainer' && mapIndex >= 6) return false;
      if (k === 'policeman'  && mapIndex >= 4) return false;
      return true;
    });
    let h = 0;
    for (const ch of nodeId) h = (h * 31 + ch.charCodeAt(0)) | 0;
    node.trainerSprite = availableKeys[Math.abs(h) % availableKeys.length];
  };

  const makeNode = (id, type, layer, col, extra = {}) => {
    const node = { id, type, layer, col, ...extra };
    if (type === NODE_TYPES.TRAINER) assignTrainerSprite(node, id);
    return node;
  };

  // Pick a weighted-random node type; ci = content layer index (0–5)
  const pickType = (ci) => {
    const w = { ...NODE_WEIGHTS[Math.min(ci, NODE_WEIGHTS.length - 1)] };
    if (mapIndex >= 5 && ci >= 2 && !(typeof state !== 'undefined' && state.isEndlessMode)) w.legendary = 2;
    if (nuzlockeMode) { w.catch = 0; w.trade = 0; }
    if (typeof state !== 'undefined' && state.isEndlessMode) { w.trade = 0; w.catch = Math.floor(w.catch / 2); }
    if (gen2Mode) {
      // Gen 2: bump combat/event nodes by 20%, halve catch nodes
      // (the layer-1 catch is hardcoded above so it's unaffected)
      w.battle   = Math.round(w.battle   * 1.2);
      w.trainer  = Math.round(w.trainer  * 1.2);
      w.question = Math.round(w.question * 1.2);
      w.catch    = Math.floor(w.catch / 2);
    }
    const type = weightedRandom(w);
    // Endless region 3: 1/6 catch nodes become legendary encounters
    if (type === NODE_TYPES.CATCH &&
        typeof state !== 'undefined' && state.isEndlessMode &&
        typeof endlessState !== 'undefined' && endlessState.regionNumber === 3 &&
        rng() < 1 / 6) {
      return NODE_TYPES.LEGENDARY;
    }
    return type;
  };

  // Each node at position i in fromLayer connects to the 2 positionally
  // nearest nodes in toLayer (like walking down-left and down-right).
  const makeLayerEdges = (fromLayer, toLayer) => {
    const N = fromLayer.length;
    const M = toLayer.length;
    if (N === 1) {
      // Single source fans out to all targets
      return toLayer.map(t => ({ from: fromLayer[0].id, to: t.id }));
    }
    const edges = [];
    for (let i = 0; i < N; i++) {
      let left, right;
      if (M === 1) {
        left = right = 0;
      } else if (M < N && i === 0) {
        // Leftmost node on a shrinking layer → only the leftmost node below
        left = right = 0;
      } else if (M < N && i === N - 1) {
        // Rightmost node on a shrinking layer → only the rightmost node below
        left = right = M - 1;
      } else {
        const pos = i * (M - 1) / (N - 1);
        left  = Math.floor(pos);
        right = left + 1;
        if (right >= M) { right = M - 1; left = M - 2; }
      }
      edges.push({ from: fromLayer[i].id, to: toLayer[left].id });
      if (left !== right) {
        edges.push({ from: fromLayer[i].id, to: toLayer[right].id });
      }
    }
    return edges;
  };

  // ── Build layers ─────────────────────────────────────────────────

  const layers = [];

  // Layer 0: Start
  layers.push([makeNode('n0_0', NODE_TYPES.START, 0, 0)]);

  // Layer 1: always Catch (left) and Battle (right); nuzlocke gets two Catch nodes
  layers.push([
    makeNode('n1_0', NODE_TYPES.CATCH, 1, 0),
    makeNode('n1_1', nuzlockeMode ? NODE_TYPES.CATCH : NODE_TYPES.BATTLE, 1, 1),
  ]);

  // Layers 2+: random content nodes (Silver maps use one fewer content layer)
  for (let ci = 0; ci < contentCount; ci++) {
    const l    = ci + 2;
    const size = CONTENT_SIZES[ci];
    const layer = Array.from({ length: size }, (_, c) => makeNode(`n${l}_${c}`, pickType(ci), l, c));

    // Guarantee a pokecenter in the last content layer
    if (ci === contentCount - 1 && !layer.some(n => n.type === NODE_TYPES.POKECENTER)) {
      const idx = Math.floor(rng() * size);
      layer[idx].type = NODE_TYPES.POKECENTER;
    }

    layers.push(layer);
  }

  // Silver node: place him as an optional alternative inside one of the
  // content layers (skip layer 1 which is fixed, and the last content layer
  // which keeps the Pokecenter guarantee). Players can route around him.
  if (hasSilverNode) {
    const minCi = 1;                         // layer 3+
    const maxCi = contentCount - 2;          // skip last content layer
    const silverCi = minCi + Math.floor(rng() * Math.max(1, maxCi - minCi + 1));
    const silverLayer = layers[silverCi + 2];
    if (silverLayer && silverLayer.length > 0) {
      // Avoid replacing a forced Pokecenter
      const candidates = silverLayer
        .map((n, i) => n.type !== NODE_TYPES.POKECENTER ? i : -1)
        .filter(i => i >= 0);
      const slotIdx = candidates[Math.floor(rng() * candidates.length)] ?? 0;
      silverLayer[slotIdx].type = NODE_TYPES.SILVER;
      delete silverLayer[slotIdx].trainerSprite; // strip leftover trainer sprite if any
    }
  }

  // Boss layer
  layers.push([makeNode(bossId, NODE_TYPES.BOSS, bossLayerIdx, 0, { mapIndex })]);

  // ── Build edges ──────────────────────────────────────────────────

  const edges = [];
  for (let l = 0; l < layers.length - 1; l++) {
    edges.push(...makeLayerEdges(layers[l], layers[l + 1]));
  }

  // ── Flatten & initialise nodes ───────────────────────────────────

  const nodes = {};
  for (const layer of layers) {
    for (const n of layer) {
      n.visited    = false;
      n.accessible = false;
      n.revealed   = true;
      nodes[n.id]  = n;
    }
  }

  nodes['n0_0'].visited = true;
  edges.filter(e => e.from === 'n0_0').forEach(e => { nodes[e.to].accessible = true; });

  return { nodes, edges, layers, mapIndex };
}

function getAccessibleNodes(map) {
  return Object.values(map.nodes).filter(n => n.accessible && !n.visited);
}

function advanceFromNode(map, nodeId) {
  const node = map.nodes[nodeId];
  if (!node) return;
  node.visited = true;
  node.accessible = false;

  // Lock sibling nodes in the same layer — the unchosen branches are gone
  for (const n of Object.values(map.nodes)) {
    if (n.layer === node.layer && n.id !== nodeId && n.accessible) {
      n.accessible = false;
    }
  }

  // Make next layer nodes accessible
  for (const edge of map.edges) {
    if (edge.from === nodeId) {
      const target = map.nodes[edge.to];
      if (target) {
        target.revealed = true;
        target.accessible = true;
      }
    }
  }
}

// ---- Sprite helpers ----

// Keys must match the filename stems in /sprites/ exactly (case-sensitive)
const TRAINER_SPRITE_KEYS = [
  'aceTrainer', 'bugCatcher', 'fireSpitter', 'fisher',
  'hiker', 'oldGuy', 'policeman', 'Scientist', 'teamRocket',
];

const TRAINER_SPRITE_NAMES = {
  aceTrainer:  'Ace Trainer',
  bugCatcher:  'Bug Catcher',
  fireSpitter: 'Fire Breather',
  fisher:      'Fisher',
  hiker:       'Hiker',
  oldGuy:      'Old Man',
  policeman:   'Policeman',
  Scientist:   'Scientist',
  teamRocket:  'Team Rocket Grunt',
};

const TRAINER_SPECIALTIES = {
  aceTrainer:  'Various Pokemon',
  bugCatcher:  'Bug Pokemon',
  fireSpitter: 'Fire Pokemon',
  fisher:      'Water Pokemon',
  hiker:       'Rock/Ground Pokemon',
  oldGuy:      'Various Pokemon',
  policeman:   'Fire Pokemon',
  Scientist:   'Electric/Poison Pokemon',
  teamRocket:  'Poison Pokemon',
};

const TRAINER_SPECIALTIES_GEN2 = {
  aceTrainer:  'Dragon/Psychic/Fighting Pokemon',
  oldGuy:      'Normal/Flying/Fire Pokemon',
};

const RANDOM_TRAINER_SPRITES = TRAINER_SPRITE_KEYS.map(k => `sprites/${k}.png`);

const GYM_LEADER_SPRITES = [
  'sprites/brock.png',
  'sprites/misty.png',
  'sprites/lt. surge.png',
  'sprites/erika.png',
  'sprites/koga.png',
  'sprites/sabrina.png',
  'sprites/blaine.png',
  'sprites/giovanni.png',
];

const JOHTO_GYM_LEADER_SPRITES = [
  'https://play.pokemonshowdown.com/sprites/trainers/falkner.png',
  'https://play.pokemonshowdown.com/sprites/trainers/bugsy.png',
  'https://play.pokemonshowdown.com/sprites/trainers/whitney.png',
  'https://play.pokemonshowdown.com/sprites/trainers/morty.png',
  'https://play.pokemonshowdown.com/sprites/trainers/chuck.png',
  'https://play.pokemonshowdown.com/sprites/trainers/jasmine.png',
  'https://play.pokemonshowdown.com/sprites/trainers/pryce.png',
  'https://play.pokemonshowdown.com/sprites/trainers/clair.png',
];

const KANTO_GYM_LEADER_SPRITES = [
  'https://play.pokemonshowdown.com/sprites/trainers/brock.png',
  'https://play.pokemonshowdown.com/sprites/trainers/misty.png',
  'https://play.pokemonshowdown.com/sprites/trainers/ltsurge.png',
  'https://play.pokemonshowdown.com/sprites/trainers/erika.png',
  'https://play.pokemonshowdown.com/sprites/trainers/janine.png',
  'https://play.pokemonshowdown.com/sprites/trainers/sabrina.png',
  'https://play.pokemonshowdown.com/sprites/trainers/blaine.png',
  'https://play.pokemonshowdown.com/sprites/trainers/blue.png',
];

function getNodeSprite(node) {
  const ICON_SPRITES = {
    [NODE_TYPES.BATTLE]:    'sprites/grass.png',
    [NODE_TYPES.CATCH]:     'sprites/catchPokemon.png',
    [NODE_TYPES.ITEM]:      'sprites/itemIcon.png',
    [NODE_TYPES.TRADE]:      'sprites/tradeIcon.png',
    [NODE_TYPES.LEGENDARY]:  'sprites/legendaryEncounter.png',
    [NODE_TYPES.QUESTION]:   'sprites/questionMark.png',
    [NODE_TYPES.POKECENTER]: 'sprites/Poke Center.png',
    [NODE_TYPES.MOVE_TUTOR]: 'sprites/moveTutor.png',
  };
  if (ICON_SPRITES[node.type]) return ICON_SPRITES[node.type];
  if (node.type === NODE_TYPES.TRAINER) {
    const key = node.trainerSprite || (() => {
      let h = 0;
      for (const c of node.id) h = (h * 31 + c.charCodeAt(0)) | 0;
      return TRAINER_SPRITE_KEYS[Math.abs(h) % TRAINER_SPRITE_KEYS.length];
    })();
    return `sprites/${key}.png`;
  }
  if (node.type === NODE_TYPES.BOSS) {
    if (typeof state !== 'undefined' && state.isEndlessMode) return 'sprites/misteryTrainer.png';
    const mi = node.mapIndex ?? -1;
    if (typeof state !== 'undefined' && state.gen2Mode) {
      if (mi === 17) return 'https://play.pokemonshowdown.com/sprites/trainers/red.png';
      if (mi === 8)  return 'https://play.pokemonshowdown.com/sprites/trainers/lance.png';
      if (mi >= 9 && mi < 17) return KANTO_GYM_LEADER_SPRITES[mi - 9];
      if (mi >= 0 && mi < 8) return JOHTO_GYM_LEADER_SPRITES[mi];
    }
    if (mi >= 0 && mi < GYM_LEADER_SPRITES.length) return GYM_LEADER_SPRITES[mi];
    return 'sprites/champ.png';
  }
  if (node.type === NODE_TYPES.SILVER) return 'https://play.pokemonshowdown.com/sprites/trainers/silver.png';
  return null;
}

// Rendering — top-to-bottom layout
const _mapTooltip = (() => {
  let el = null;
  return {
    show(label, x, y) {
      if (!document.getElementById('map-screen')?.classList.contains('active')) return;
      if (!el) el = document.getElementById('map-node-tooltip');
      if (!el) return;
      el.innerHTML = label;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.classList.add('visible');
    },
    move(x, y) {
      if (!el) return;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    },
    hide() {
      if (!el) el = document.getElementById('map-node-tooltip');
      if (el) el.classList.remove('visible');
    },
  };
})();

function renderMap(map, container, onNodeClick) {
  container.innerHTML = '';
  const W = container.clientWidth || 600;
  const H = container.clientHeight || 500;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('overflow', 'visible');
  svg.style.width = '100%';
  svg.style.height = '100%';

  const layerCount = map.layers.length;
  const padY = 28;

  const positions = {};
  for (let l = 0; l < map.layers.length; l++) {
    const layer = map.layers[l];
    const y = layerCount > 1 ? padY + (l / (layerCount - 1)) * (H - 2 * padY) : H / 2;
    const nodeGap = W / (layer.length + 0.2);
    for (let c = 0; c < layer.length; c++) {
      const x = layer.length === 1 ? W / 2 : W / 2 + (c - (layer.length - 1) / 2) * nodeGap;
      positions[layer[c].id] = { x, y };
    }
  }

  // Draw ALL edges
  for (const edge of map.edges) {
    const from = positions[edge.from];
    const to = positions[edge.to];
    if (!from || !to) continue;
    const fromNode = map.nodes[edge.from];
    const toNode   = map.nodes[edge.to];
    const travelled = fromNode.visited && toNode.visited;
    const onPath = (fromNode.visited || fromNode.accessible) && (toNode.visited || toNode.accessible);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', from.x);
    line.setAttribute('y1', from.y);
    line.setAttribute('x2', to.x);
    line.setAttribute('y2', to.y);
    line.setAttribute('stroke', travelled ? '#333' : onPath ? '#999' : '#222');
    line.setAttribute('stroke-width', onPath ? '2.5' : '1.5');
    if (!onPath) line.setAttribute('stroke-dasharray', '4,5');
    svg.appendChild(line);
  }


  // Draw ALL nodes (all are revealed)
  for (const [id, node] of Object.entries(map.nodes)) {
    const pos = positions[id];
    if (!pos) continue;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${pos.x},${pos.y})`);

    const isClickable = node.accessible && !node.visited;
    const isInaccessible = !node.accessible && !node.visited;
    const isCurrent = state.currentNode && node.id === state.currentNode.id;

    g.style.cursor = isClickable ? 'pointer' : 'default';
    if (isInaccessible) { g.style.opacity = '0.75'; }
    if (node.visited) g.style.filter = 'grayscale(0.5) brightness(0.62)';
    if (isClickable) g.style.filter = 'drop-shadow(0 0 6px #fff) drop-shadow(0 0 3px #ffe066)';

    const isBossNode = node.type === NODE_TYPES.BOSS;
    const sprite = getNodeSprite(node);

    if (sprite) {
      // ---- Sprite-based node ----

      // Sprite image, no circle background
      // Human figures (trainer/boss) are taller than wide; icons are square
      const isHumanFigure = node.type === NODE_TYPES.TRAINER || node.type === NODE_TYPES.BOSS || node.type === NODE_TYPES.SILVER;
      const iw = isHumanFigure ? (isBossNode ? 52 : 38) : (isBossNode ? 52 : 40);
      const ih = isHumanFigure ? (isBossNode ? 52 : 52) : (isBossNode ? 52 : 40);

      const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      img.setAttribute('href', sprite.replace(/ /g, '%20'));
      img.setAttribute('x', -(iw / 2));
      img.setAttribute('y', -(ih / 2));
      img.setAttribute('width', iw);
      img.setAttribute('height', ih);
      img.setAttribute('image-rendering', 'pixelated');
      img.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      g.appendChild(img);

      // Accessible: pulsing pixelated shadow under the sprite
      if (isClickable) {
        const px = 4; // pixel grid size
        const shadowY = ih / 2 - 2;
        const shadow = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        shadow.setAttribute('fill', '#fff');

        const anim = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
        anim.setAttribute('attributeName', 'opacity');
        anim.setAttribute('values', '0.55;0.1;0.55');
        anim.setAttribute('dur', '1.5s');
        anim.setAttribute('repeatCount', 'indefinite');
        shadow.appendChild(anim);

        // Three rows of rectangles snapped to px grid — narrow/wide/narrow
        const rows = [
          Math.round(iw * 0.35 / px) * px,
          Math.round(iw * 0.55 / px) * px,
          Math.round(iw * 0.35 / px) * px,
        ];
        rows.forEach((w, i) => {
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.setAttribute('x', -(w / 2));
          rect.setAttribute('y', shadowY + (i - 1) * px - px / 2);
          rect.setAttribute('width', w);
          rect.setAttribute('height', px);
          shadow.appendChild(rect);
        });

        g.insertBefore(shadow, img); // behind sprite
      }

      if (isCurrent) {
        const check = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        check.setAttribute('text-anchor', 'middle');
        check.setAttribute('dominant-baseline', 'central');
        check.setAttribute('font-size', '16');
        check.setAttribute('fill', '#fff');
        check.textContent = '✓';
        g.appendChild(check);
      }

      if (isBossNode && typeof state !== 'undefined' && state.isEndlessMode
          && window.matchMedia('(pointer: coarse)').matches) {
        const trainerData = typeof endlessState !== 'undefined' && endlessState.currentRegion
          ? endlessState.currentRegion.trainers[endlessState.mapIndexInRegion]
          : null;
        if (trainerData?.speciesIds?.length) {
          const ids = trainerData.speciesIds;
          const iconSize = 28;
          const gap = 3;
          const totalW = ids.length * iconSize + (ids.length - 1) * gap;
          const startX = -(totalW / 2);
          const startY = ih / 2 - 24;
          const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
          ids.forEach((id, i) => {
            const lvl = (trainerData.level ?? 0) + (trainerData.levelOffsets?.[i] ?? i);
            const cx = startX + i * (iconSize + gap) + iconSize / 2;

            const lvlText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            lvlText.setAttribute('x', cx);
            lvlText.setAttribute('y', startY - 2);
            lvlText.setAttribute('text-anchor', 'middle');
            lvlText.setAttribute('font-family', "'Press Start 2P', monospace");
            lvlText.setAttribute('font-size', '5');
            lvlText.setAttribute('fill', '#fff');
            lvlText.setAttribute('paint-order', 'stroke');
            lvlText.setAttribute('stroke', '#000');
            lvlText.setAttribute('stroke-width', '2');
            lvlText.textContent = `${lvl}`;
            g.appendChild(lvlText);

            const icon = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            icon.setAttribute('href', `${BASE}${id}.png`);
            icon.setAttribute('x', startX + i * (iconSize + gap));
            icon.setAttribute('y', startY);
            icon.setAttribute('width', iconSize);
            icon.setAttribute('height', iconSize);
            icon.setAttribute('image-rendering', 'pixelated');
            g.appendChild(icon);
          });
        }
      }

    } else {
      // ---- Circle-based node ----
      const r = isBossNode ? 22 : 18;
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', r);
      circle.setAttribute('fill', isInaccessible ? '#2a2a3a' : getNodeColor(node));
      circle.setAttribute('stroke', isClickable ? '#fff' : (isInaccessible ? '#444' : '#555'));
      circle.setAttribute('stroke-width', isClickable ? '3' : '1');

      if (isClickable) {
        const anim = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
        anim.setAttribute('attributeName', 'stroke-opacity');
        anim.setAttribute('values', '1;0.3;1');
        anim.setAttribute('dur', '1.5s');
        anim.setAttribute('repeatCount', 'indefinite');
        circle.appendChild(anim);
      }
      g.appendChild(circle);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('font-size', '14');
      text.setAttribute('fill', isInaccessible ? '#aaa' : '#fff');
      text.textContent = isCurrent ? '✓' : getNodeIcon(node);
      g.appendChild(text);
    }

    const label = getNodeLabel(node);
    let hoverLabel = label;
    if (node.type === NODE_TYPES.BOSS && typeof state !== 'undefined' && state.isEndlessMode) {
      const trainerData = typeof endlessState !== 'undefined' && endlessState.currentRegion
        ? endlessState.currentRegion.trainers[endlessState.mapIndexInRegion]
        : null;
      if (trainerData?.speciesIds?.length) {
        const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
        const imgs = trainerData.speciesIds.map(id =>
          `<img src="${BASE}${id}.png" style="width:28px;height:28px;image-rendering:pixelated;" onerror="this.style.display='none'">`
        ).join('');
        const name = trainerData.archetype?.name || '???';
        hoverLabel = `<div style="font-size:7px;margin-bottom:3px;text-align:center;">${name}</div><div style="display:flex;flex-wrap:wrap;gap:2px;justify-content:center;">${imgs}</div>`;
      }
    }
    g.addEventListener('mouseenter', e => { if (_hoverEnabled) _mapTooltip.show(hoverLabel, e.clientX, e.clientY); });
    g.addEventListener('mousemove',  e => { _mapTooltip.move(e.clientX, e.clientY); if (_hoverEnabled) _mapTooltip.show(hoverLabel, e.clientX, e.clientY); });
    g.addEventListener('mouseleave', () => _mapTooltip.hide());

    // Prevent native long-press image menu on mobile
    g.addEventListener('contextmenu', e => e.preventDefault());

    // Touch: long press shows tooltip, short tap enters node
    let _lpTimer = null;
    let _lpFired = false;
    g.addEventListener('touchstart', e => {
      _lpFired = false;
      const touch = e.touches[0];
      _lpTimer = setTimeout(() => {
        _lpFired = true;
        _mapTooltip.show(label, touch.clientX, touch.clientY);
      }, 400);
    }, { passive: true });
    g.addEventListener('touchmove', () => {
      clearTimeout(_lpTimer);
      _mapTooltip.hide();
    }, { passive: true });
    g.addEventListener('touchend', e => {
      clearTimeout(_lpTimer);
      if (_lpFired) {
        _mapTooltip.hide();
      } else if (isClickable) {
        onNodeClick(node);
      }
      e.preventDefault();
    });

    if (isClickable) {
      g.addEventListener('click', () => onNodeClick(node));
    }

    svg.appendChild(g);
  }

  container.appendChild(svg);
}

function getNodeColor(node) {
  if (node.visited) return '#333';
  const colors = {
    [NODE_TYPES.START]:      '#4a4a6a',
    [NODE_TYPES.BATTLE]:     '#6a2a2a',
    [NODE_TYPES.CATCH]:      '#2a6a2a',
    [NODE_TYPES.ITEM]:       '#2a4a6a',
    [NODE_TYPES.QUESTION]:   '#6a4a2a',
    [NODE_TYPES.BOSS]:       '#8a2a8a',
    [NODE_TYPES.POKECENTER]: '#006666',
    [NODE_TYPES.TRAINER]:    '#6a3a1a',
    [NODE_TYPES.LEGENDARY]:  '#7a6a00',
    [NODE_TYPES.MOVE_TUTOR]: '#3a4a6a',
    [NODE_TYPES.TRADE]:      '#1a5a5a',
    [NODE_TYPES.SILVER]:     '#5a2a7a',
  };
  return colors[node.type] || '#444';
}

function getNodeIcon(node) {
  if (node.visited) return '✓';
  const icons = {
    [NODE_TYPES.START]:      '★',
    [NODE_TYPES.BATTLE]:     '⚔',
    [NODE_TYPES.CATCH]:      '⬟',
    [NODE_TYPES.ITEM]:       '✦',
    [NODE_TYPES.QUESTION]:   '?',
    [NODE_TYPES.BOSS]:       '♛',
    [NODE_TYPES.POKECENTER]: '+',
    [NODE_TYPES.TRAINER]:    '⚑',
    [NODE_TYPES.LEGENDARY]:  '⚝',
    [NODE_TYPES.MOVE_TUTOR]: '♪',
    [NODE_TYPES.TRADE]:      '⇄',
    [NODE_TYPES.SILVER]:     '⚔',
  };
  return icons[node.type] || '●';
}

function getSilverHoverLabel() {
  if (typeof SILVER_ENCOUNTERS === 'undefined') {
    return 'Rival Silver';
  }
  // Encounter scales to the current map slot, not the win count, so skipping
  // earlier Silver fights doesn't trivialize a later one.
  const SILVER_ENC_BY_MAP = { 1: 0, 3: 1, 5: 2, 7: 3, 10: 4, 13: 5, 15: 6 };
  const mapIdx     = (typeof state !== 'undefined') ? state.currentMap : 1;
  const idx        = SILVER_ENC_BY_MAP[mapIdx] ?? 0;
  const data       = SILVER_ENCOUNTERS[Math.min(idx, SILVER_ENCOUNTERS.length - 1)];
  const team       = data.team.slice();
  const starterId  = typeof state !== 'undefined' ? state.starterSpeciesId : null;
  const starterArr = starterId && typeof SILVER_STARTER_LINES !== 'undefined' ? SILVER_STARTER_LINES[starterId] : null;
  if (starterArr && team.length) {
    const stage  = idx < 1 ? 0 : idx < 3 ? 1 : 2;
    const last   = team[team.length - 1];
    team[team.length - 1] = { ...starterArr[stage], level: last.level };
  }
  const teamHtml = team.map(p =>
    `<div style="color:#ccc;font-size:9px;">${p.name} <span style="color:#aaa;">Lv${p.level}</span></div>`
  ).join('');
  return `<div style="font-weight:bold;margin-bottom:4px;">Rival Silver</div>${teamHtml}`;
}

function getNodeLabel(node) {
  if (node.visited) return 'Visited';
  if (node.type === NODE_TYPES.BOSS) {
    const mi = node.mapIndex ?? -1;
    const isGen2 = typeof state !== 'undefined' && state.gen2Mode;
    const leaders = isGen2 ? (typeof JOHTO_GYM_LEADERS !== 'undefined' ? JOHTO_GYM_LEADERS : null) : (typeof GYM_LEADERS !== 'undefined' ? GYM_LEADERS : null);
    if (leaders && mi >= 0 && mi < leaders.length) {
      const leader = leaders[mi];
      const teamHtml = leader.team.map(p =>
        `<div style="color:#ccc;font-size:9px;">${p.name} <span style="color:#aaa;">Lv${p.level}</span></div>`
      ).join('');
      return `<div style="font-weight:bold;margin-bottom:4px;">${leader.name} — ${leader.type} Gym</div>${teamHtml}`;
    }
    if (isGen2 && mi === 8) return '<div style="font-weight:bold;">Red — Mt. Silver</div>';
    if (typeof ELITE_4 !== 'undefined' && mi === 8) {
      return '<div style="font-weight:bold;">Elite Four &amp; Champion</div>';
    }
    return 'Gym Leader';
  }
  const isGen2Mode = typeof state !== 'undefined' && state.gen2Mode;
  const labels = {
    [NODE_TYPES.START]:      'Start',
    [NODE_TYPES.BATTLE]:     isGen2Mode ? 'Wild Battle' : 'Wild Battle — +1 level',
    [NODE_TYPES.CATCH]:      'Catch Pokemon',
    [NODE_TYPES.ITEM]:       'Item',
    [NODE_TYPES.QUESTION]:   'Random Event',
    [NODE_TYPES.POKECENTER]: 'Pokemon Center',
    [NODE_TYPES.TRAINER]:    (node.trainerSprite && TRAINER_SPRITE_NAMES[node.trainerSprite])
      ? (isGen2Mode
          ? `${TRAINER_SPRITE_NAMES[node.trainerSprite]} — ${TRAINER_SPECIALTIES_GEN2[node.trainerSprite] || TRAINER_SPECIALTIES[node.trainerSprite] || 'Various Pokemon'}`
          : `${TRAINER_SPRITE_NAMES[node.trainerSprite]} — +2 Levels — ${TRAINER_SPECIALTIES[node.trainerSprite] || 'Various Pokemon'}`)
      : (isGen2Mode ? 'Trainer Battle' : 'Trainer Battle — +2 Levels'),
    [NODE_TYPES.LEGENDARY]:  'Legendary Pokemon',
    [NODE_TYPES.MOVE_TUTOR]: 'Move Tutor',
    [NODE_TYPES.TRADE]:      'Trade — swap a Pokémon for one 3 levels higher',
    [NODE_TYPES.SILVER]:     getSilverHoverLabel(),
  };
  return labels[node.type] || node.type;
}
