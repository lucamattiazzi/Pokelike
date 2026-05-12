// game.js - Central game state and entry point

// Seeded PRNG (mulberry32) — use rng() instead of Math.random() for all game logic
let _rngSeed = 0;
function rng() {
  _rngSeed = (_rngSeed + 0x6D2B79F5) | 0;
  let t = Math.imul(_rngSeed ^ (_rngSeed >>> 15), 1 | _rngSeed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function seedRng(seed) { _rngSeed = seed >>> 0; }
function getRngSeed() { return _rngSeed >>> 0; }

let state = {
  currentMap: 0,
  currentNode: null,
  team: [],
  items: [],
  badges: 0,
  map: null,
  eliteIndex: 0,
  trainer: 'boy',
  starterSpeciesId: null,
  maxTeamSize: 1,
  nuzlockeMode: false,
  gen2Mode: false,
  silverBeaten: 0,
};

// ---- Run persistence ----

function saveRun() {
  try {
    const saved = { ...state, currentNodeId: state.currentNode?.id || null, currentNode: null, rngSeed: getRngSeed() };
    localStorage.setItem('poke_current_run', JSON.stringify(saved));
  } catch {}
}

function loadRun() {
  try {
    const raw = localStorage.getItem('poke_current_run');
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (saved.rngSeed) seedRng(saved.rngSeed);
    state = saved;
    state.currentNode = saved.currentNodeId ? (state.map?.nodes?.[saved.currentNodeId] || null) : null;
    delete state.currentNodeId;
    delete state.rngSeed;
    return true;
  } catch { return false; }
}

function clearSavedRun() {
  localStorage.removeItem('poke_current_run');
}

// ---- Initialization ----

async function initGame() {
  applyDarkMode();
  showScreen('title-screen');
  if (typeof initCloudSave === 'function') initCloudSave();
  if (typeof syncToCloud === 'function') syncToCloud();
  // Generation toggle — selection is read when Normal/Nuzlocke is clicked
  // and persists across reloads via localStorage.
  let selectedGen = Number(localStorage.getItem('poke_selected_gen')) === 2 ? 2 : 1;
  const syncGenButtons = () => {
    document.querySelectorAll('#gen-toggle .gen-btn').forEach(b =>
      b.classList.toggle('gen-btn--active', Number(b.dataset.gen) === selectedGen));
  };
  syncGenButtons();
  document.querySelectorAll('#gen-toggle .gen-btn').forEach(btn => {
    btn.onclick = () => {
      selectedGen = Number(btn.dataset.gen) || 1;
      localStorage.setItem('poke_selected_gen', String(selectedGen));
      syncGenButtons();
    };
  });
  document.getElementById('btn-new-run').onclick  = () => startNewRun(false, selectedGen === 2);
  document.getElementById('btn-hard-run').onclick = () => startNewRun(true,  selectedGen === 2);

  const endlessBtn = document.getElementById('btn-endless-run');
  if (endlessBtn) {
    if (getHallOfFame().length > 0) {
      endlessBtn.onclick = () => showEndlessStageSelect();
      endlessBtn.disabled = false;
      endlessBtn.style.opacity = '';
      endlessBtn.style.pointerEvents = '';
      // Remove lock wrapper if it was injected in a previous initGame call
      const parent = endlessBtn.parentNode;
      if (parent && parent.id !== 'title-screen' && !parent.classList.contains('screen')) {
        const grandparent = parent.parentNode;
        if (grandparent) {
          if (endlessBtn.style.marginTop === '0' || endlessBtn.style.marginTop === '0px') {
            endlessBtn.style.marginTop = parent.style.marginTop || '';
          }
          grandparent.insertBefore(endlessBtn, parent);
          parent.remove();
        }
      }
    } else if (!endlessBtn.disabled) {
      endlessBtn.style.opacity = '0.45';
      endlessBtn.disabled = true;
      endlessBtn.style.pointerEvents = 'none';
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `position:relative;display:block;margin-top:${endlessBtn.style.marginTop || '6px'};`;
      endlessBtn.style.marginTop = '0';
      endlessBtn.parentNode.insertBefore(wrapper, endlessBtn);
      wrapper.appendChild(endlessBtn);
      const lockOverlay = document.createElement('div');
      lockOverlay.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:24px;cursor:not-allowed;';
      lockOverlay.innerHTML = '<img src="sprites/lock.png" style="height:36px;width:auto;image-rendering:pixelated;">';
      lockOverlay.addEventListener('mousemove', e => _itemTooltip.show('Beat the game first to unlock', e.clientX + 14, e.clientY - 8));
      lockOverlay.addEventListener('mouseleave', () => _itemTooltip.hide());
      wrapper.appendChild(lockOverlay);
    }
  }

  const continueEndlessBtn = document.getElementById('btn-continue-endless');
  if (continueEndlessBtn) {
    if (localStorage.getItem('poke_endless_state') && localStorage.getItem('poke_current_run')) {
      continueEndlessBtn.style.display = '';
      continueEndlessBtn.onclick = () => continueEndlessRun();
    } else {
      continueEndlessBtn.style.display = 'none';
    }
  }

  const continueBtn = document.getElementById('btn-continue-run');
  if (localStorage.getItem('poke_current_run') && !localStorage.getItem('poke_endless_state')) {
    continueBtn.style.display = '';
    continueBtn.onclick = async () => {
      if (!loadRun()) return;
      if (state.currentNode && !state.currentNode.visited) {
        await onNodeClick(state.currentNode);
      } else {
        showMapScreen();
      }
    };
  } else {
    continueBtn.style.display = 'none';
  }
}

async function startNewRun(nuzlockeMode = false, gen2Mode = false) {
  clearEndlessState();
  const savedTrainer = localStorage.getItem('poke_trainer') || null;
  const seed = (Date.now() ^ (Math.random() * 0x100000000 | 0)) >>> 0;
  seedRng(seed);
  state = { currentMap: 0, currentNode: null, team: [], items: [], badges: 0, map: null, eliteIndex: 0, trainer: savedTrainer || 'boy', starterSpeciesId: null, maxTeamSize: 1, nuzlockeMode, gen2Mode, silverBeaten: 0, usedPokecenter: false, pickedUpItem: false, runSeed: seed };
  if (savedTrainer) {
    await showStarterSelect();
  } else {
    await showTrainerSelect();
  }
}

async function showTrainerSelect() {
  showScreen('trainer-screen');
  const boyCard  = document.getElementById('trainer-boy');
  const girlCard = document.getElementById('trainer-girl');
  boyCard.querySelector('.trainer-icon-wrap').innerHTML  = TRAINER_SVG.boy;
  girlCard.querySelector('.trainer-icon-wrap').innerHTML = TRAINER_SVG.girl;

  await new Promise(resolve => {
    function pick(gender) {
      state.trainer = gender;
      localStorage.setItem('poke_trainer', gender);
      resolve();
    }
    boyCard.onclick   = () => pick('boy');
    boyCard.onkeydown = e => { if (e.key==='Enter'||e.key===' ') pick('boy'); };
    girlCard.onclick   = () => pick('girl');
    girlCard.onkeydown = e => { if (e.key==='Enter'||e.key===' ') pick('girl'); };
  });
  await showStarterSelect();
}

function makeMaxedStarsEl(speciesId) {
  const buffs = loadPersistentBuffs()[getEvoLineRoot(speciesId)] || {};
  const total = getTotalBuffPoints(buffs);
  const fullStars = Math.floor(total / 10);
  const halfStar = (total % 10) >= 1;
  if (!fullStars && !halfStar) return null;
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;top:3px;right:3px;display:flex;gap:1px;flex-wrap:wrap;justify-content:flex-end;max-width:40px;';
  el.innerHTML =
    Array.from({ length: fullStars }, () => `<span style="font-size:7px;color:gold;line-height:1;">★</span>`).join('') +
    (halfStar ? `<span style="font-size:7px;color:gold;line-height:1;display:inline-block;width:0.5em;overflow:hidden;">★</span>` : '');
  el.title = `${total} buff points`;
  return el;
}

async function showStarterSelect() {
  showScreen('starter-screen');
  const container = document.getElementById('starter-choices');
  container.innerHTML = '<div class="loading">Loading starters...</div>';

  if (state.isEndlessMode) {
    endlessState.currentRegion = rollRegion(endlessState.stageNumber, endlessState.regionNumber);
    endlessState._preRolled = true;
    const panel = document.getElementById('starter-region-panel');
    if (panel) {
      const region = endlessState.currentRegion;
      const header = `<div class="hud-label">Upcoming Region</div><div class="hud-label" style="font-size:7px;opacity:0.7;">${getStageName(region.stageNum)} R${region.regionNum}</div>`;
      const rows = region.trainers.map((trainer, i) => {
        const type = trainer.archetype?.type || '???';
        const name = trainer.archetype?.name || '???';
        const isBigBoss = i === 2;
        const typeClass = type.toLowerCase();
        const rowClass = isBigBoss ? 'region-stage-row boss' : 'region-stage-row';
        const speciesAttr = (trainer.speciesIds || []).join(',');
        return `<div class="${rowClass}" data-species="${speciesAttr}" style="cursor:default;">
          <span class="type-badge type-${typeClass}" style="font-size:6px;padding:1px 3px;">${type}</span>
          <span class="region-stage-name">${isBigBoss ? '★ ' : ''}${name}</span>
          <span class="region-stage-level">Lv${trainer.level}</span>
        </div>`;
      }).join('');
      panel.innerHTML = header + `<div class="region-stage-list">${rows}</div>`;
      if (typeof attachBossTeamTooltips === 'function') attachBossTeamTooltips(panel);
      panel.style.display = '';
    }
  }

  const startLevel = 5;
  const activeStarterIds = state.gen2Mode ? GEN2_STARTER_IDS : STARTER_IDS;
  const starters = state.isEndlessMode ? [] : await Promise.all(activeStarterIds.map(id => fetchPokemonById(id)));

  container.innerHTML = '';
  container.style.cssText = '';
  container.parentElement.querySelectorAll('.hof-starter-label').forEach(el => el.remove());

  if (state.isEndlessMode) {
    // --- Section 1: Region starters — only shown when no HoF runs exist yet ---
    const allHofEntries = getHallOfFame();
    if (allHofEntries.length === 0) {
      const starterIds = REGION_STARTERS[endlessState.stageNumber] || REGION_STARTERS[1];
      const starterSpecies = (await Promise.all(starterIds.map(id => fetchPokemonById(id)))).filter(Boolean);
      const starterRow = document.createElement('div');
      starterRow.className = 'starter-card-row';
      for (const species of starterSpecies) {
        const isShiny = rng() < (hasShinyCharm() ? 0.02 : 0.01);
        const inst = createInstance(species, startLevel, isShiny, 0);
        const starterCaught = !!(getPokedex()[inst.speciesId]?.caught);
        const wrapper = document.createElement('div');
        wrapper.innerHTML = renderPokemonCard(inst, true, false, starterCaught);
        const card = wrapper.querySelector('.poke-card');
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.addEventListener('click', () => selectStarter(inst));
        card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') selectStarter(inst); });
        starterRow.appendChild(card);
      }
      container.appendChild(starterRow);
    }

    // --- Section 2: HoF PC (past run Pokémon only) ---
    const seen = new Set();
    const hofIds = [];
    for (const entry of allHofEntries) {
      for (const p of entry.team) {
        const id = getEvoLineRoot(p.speciesId);
        if (!seen.has(id) && !LEGENDARY_ID_SET.has(id)) { seen.add(id); hofIds.push(id); }
      }
    }
    hofIds.sort((a, b) => a - b);
    const hofX = hofIds.length;
    const hofY = new Set([...ALL_CATCHABLE_IDS].map(id => getEvoLineRoot(id))).size;
    const hofSpecies = hofIds.length > 0
      ? (await Promise.all(hofIds.map(id => fetchPokemonById(id)))).filter(Boolean)
      : [];

    const hofBox = document.createElement('div');
    hofBox.className = 'pc-box';
    const hasEntries = hofSpecies.length > 0;
    const sortBtnsHtml = hasEntries
      ? `<div class="hof-sort-btns"><button class="hof-sort-btn active" data-sort="stars">★ Stars</button><button class="hof-sort-btn" data-sort="type">Type</button><button class="hof-sort-btn" data-sort="id">#</button><span class="hof-sort-sep"></span><button class="hof-sort-btn hof-filter-shiny" data-filter="shiny">★ Shiny</button></div>`
      : '';
    const hofTitle = hasEntries ? `HALL OF FAME PC (${hofX}/${hofY})` : 'HALL OF FAME PC';
    hofBox.innerHTML = `<div class="pc-box-titlebar${hasEntries ? ' with-sort' : ''}"><span>${hofTitle}</span>${sortBtnsHtml}</div><div class="pc-box-body"><div class="pc-box-grid" style="grid-template-columns:repeat(6,1fr);"></div></div>`;
    const grid = hofBox.querySelector('.pc-box-grid');

    if (!hasEntries) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;opacity:0.5;padding:12px;font-size:8px;">Complete a run to unlock Pokémon here</div>`;
    }

    const persistBuffs = loadPersistentBuffs();
    const _hofStats = ['hp','atk','def','speed','special'];
    function hofStarScore(speciesId) {
      const b = persistBuffs[getEvoLineRoot(speciesId)] || {};
      const maxed = _hofStats.filter(k => (b[k] ?? 0) >= 10).length;
      const partial = _hofStats.filter(k => { const v = b[k] ?? 0; return v > 0 && v < 10; }).length;
      return maxed + partial * 0.5;
    }

    const shinyRoots = new Set();
    for (const entry of allHofEntries) {
      for (const p of entry.team) {
        if (p.isShiny) shinyRoots.add(getEvoLineRoot(p.speciesId));
      }
    }

    const hofInstances = hofSpecies.map(species => {
      const isShiny = shinyRoots.has(getEvoLineRoot(species.id ?? species.speciesId));
      const inst = createInstance(species, startLevel, isShiny, 0);
      loadBuffsIntoPokemon(inst);
      return inst;
    });

    function buildHofGrid(instances) {
      grid.innerHTML = '';
      for (const inst of instances) {
        const typeBadges = (inst.types || []).map(t =>
          `<span class="type-badge type-${t.toLowerCase()}" style="font-size:5px;padding:1px 2px;">${t}</span>`).join('');
        const slot = document.createElement('div');
        slot.className = 'pc-slot';
        slot.setAttribute('role', 'button');
        slot.setAttribute('tabindex', '0');
        slot.innerHTML = `
          <img src="${inst.spriteUrl}" alt="${inst.name}">
          <div class="pc-slot-name">${inst.name}</div>
          <div class="pc-slot-lv">Lv.${startLevel}</div>
          <div style="display:flex;gap:2px;flex-wrap:wrap;justify-content:center;">${typeBadges}</div>`;
        const stars = makeMaxedStarsEl(inst.speciesId);
        if (stars) slot.appendChild(stars);
        if (inst.isShiny) {
          const shinyStar = document.createElement('span');
          shinyStar.textContent = '★';
          shinyStar.style.cssText = 'position:absolute;top:3px;left:3px;font-size:7px;color:#4af;line-height:1;';
          shinyStar.title = 'Shiny!';
          slot.appendChild(shinyStar);
        }
        slot.addEventListener('click', () => selectStarter(inst));
        slot.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') selectStarter(inst); });
        slot.addEventListener('mouseenter', () => showTeamHoverCard(inst, slot));
        slot.addEventListener('mouseleave', () => hideTeamHoverCard());
        grid.appendChild(slot);
      }
    }

    let showOnlyShiny = false;
    let currentSort = 'stars';

    function sortHof(mode) {
      const pool = showOnlyShiny ? hofInstances.filter(i => i.isShiny) : [...hofInstances];
      if (mode === 'stars') pool.sort((a, b) => { const d = hofStarScore(b.speciesId) - hofStarScore(a.speciesId); return d !== 0 ? d : a.speciesId - b.speciesId; });
      else if (mode === 'type') pool.sort((a, b) => { const ta = (a.types?.[0]||'').toLowerCase(), tb = (b.types?.[0]||'').toLowerCase(); return ta !== tb ? (ta < tb ? -1 : 1) : a.speciesId - b.speciesId; });
      else pool.sort((a, b) => a.speciesId - b.speciesId);
      buildHofGrid(pool);
    }

    if (hasEntries) {
      sortHof('stars');
      hofBox.querySelectorAll('.hof-sort-btn:not(.hof-filter-shiny)').forEach(btn => {
        btn.addEventListener('click', () => {
          hofBox.querySelectorAll('.hof-sort-btn:not(.hof-filter-shiny)').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentSort = btn.dataset.sort;
          sortHof(currentSort);
        });
      });
      const shinyFilterBtn = hofBox.querySelector('.hof-filter-shiny');
      if (shinyFilterBtn) {
        shinyFilterBtn.addEventListener('click', () => {
          showOnlyShiny = !showOnlyShiny;
          shinyFilterBtn.classList.toggle('active', showOnlyShiny);
          sortHof(currentSort);
        });
      }
    }

    container.appendChild(hofBox);
  } else {
    container.style.display = 'flex';
    container.style.justifyContent = 'center';
    container.style.flexWrap = 'wrap';
    container.style.gap = '16px';

    for (const species of starters) {
      if (!species) continue;
      const isShiny = rng() < (hasShinyCharm() ? 0.02 : 0.01);
      const inst = createInstance(species, startLevel, isShiny, 0);
      const starterCaught = !!(getPokedex()[inst.speciesId]?.caught);
      const wrapper = document.createElement('div');
      wrapper.innerHTML = renderPokemonCard(inst, true, false, starterCaught);
      const card = wrapper.querySelector('.poke-card');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.addEventListener('click', () => selectStarter(inst));
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') selectStarter(inst); });
      container.appendChild(card);
    }
  }
}

async function selectStarter(pokemon) {
  const normalUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.speciesId}.png`;
  markPokedexCaught(pokemon.speciesId, pokemon.name, pokemon.types, normalUrl);
  if (pokemon.isShiny) markShinyDexCaught(pokemon.speciesId, pokemon.name, pokemon.types, pokemon.spriteUrl);
  loadBuffsIntoPokemon(pokemon);
  state.team = [pokemon];
  state.starterSpeciesId = pokemon.speciesId;
  recordUsedStarter(pokemon.speciesId);
  state.maxTeamSize = 1;
  if (state.isEndlessMode) {
    startEndlessRegion();
  } else {
    startMap(0);
  }
}

// ---- Map Management ----

function startMap(mapIndex) {
  state.currentMap = mapIndex;
  state.map = generateMap(mapIndex, state.nuzlockeMode, state.gen2Mode);

  // Full heal between arenas (skip the very first map)
  if (mapIndex > 0) {
    for (const p of state.team) {
      p.currentHp = p.maxHp;
    }
  }

  const startNode = state.map.nodes['n0_0'];
  state.currentNode = startNode;

  showMapScreen();
}

function showMapScreen() {
  // In endless mode, delegate to the endless map renderer (which uses the correct click handler)
  if (state.isEndlessMode) { saveRun(); showEndlessMapScreen(); return; }

  if (typeof hideEndlessTraitPanel === 'function') hideEndlessTraitPanel();
  const regionPanel = document.getElementById('endless-region-panel');
  if (regionPanel) regionPanel.style.display = 'none';
  document.querySelectorAll('.map-badges-label').forEach(el => el.style.display = '');
  showScreen('map-screen');
  const mapInfo = document.getElementById('map-info');
  if (mapInfo) {
    if (state.gen2Mode) {
      const isElite = state.currentMap === 8;
      const leader = isElite ? null : JOHTO_GYM_LEADERS[state.currentMap];
      mapInfo.innerHTML = isElite
        ? `<span>Map 9: Elite Four &amp; Lance</span>`
        : `<span>Map ${state.currentMap+1}: vs <b>${leader.name}</b> (${leader.type})</span>`;
    } else {
      const isFinal = state.currentMap === 8;
      const leader = isFinal ? null : GYM_LEADERS[state.currentMap];
      mapInfo.innerHTML = isFinal
        ? `<span>Elite Four & Champion</span>`
        : `<span>Map ${state.currentMap+1}: vs <b>${leader.name}</b> (${leader.type})</span>`;
    }
  }
  const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/badges/';
  let badgeHtml;
  if (state.gen2Mode) {
    badgeHtml = Array.from({ length: 8 }, (_, i) => {
      const earned = i < state.badges;
      const label = JOHTO_GYM_LEADERS[i].badge;
      return earned
        ? `<img src="${BASE}${i + 9}.png" alt="${label}" title="${label}" class="badge-icon-img">`
        : `<span class="badge-icon-empty" title="${label}"></span>`;
    }).join('');
  } else {
    badgeHtml = Array.from({ length: 8 }, (_, i) => {
      const earned = i < state.badges;
      const label = GYM_LEADERS[i].badge;
      return earned
        ? `<img src="${BASE}${i + 1}.png" alt="${label}" title="${label}" class="badge-icon-img">`
        : `<span class="badge-icon-empty" title="${label}"></span>`;
    }).join('');
  }
  const badgeEl = document.getElementById('badge-count');
  if (badgeEl) badgeEl.innerHTML = badgeHtml;
  const badgePanelEl = document.getElementById('badge-count-panel');
  if (badgePanelEl) badgePanelEl.innerHTML = badgeHtml;

  renderTeamBar(state.team);
  renderItemBadges(state.items);

  const mapContainer = document.getElementById('map-container');
  let bgUrl;
  if (state.gen2Mode) {
    // Johto routes 1-9 (route 9 covers Elite Four at map 8)
    bgUrl = `ui/mapsGen2/${state.currentMap + 1}.png`;
  } else {
    bgUrl = `ui/mapsNormalMode/map${state.currentMap + 1}.png`;
  }
  mapContainer.style.backgroundImage = `url('${bgUrl}')`;
  renderMap(state.map, mapContainer, onNodeClick);
  saveRun();

  if (!localStorage.getItem('poke_tutorial_seen')) {
    showTutorialOverlay();
  }
}

function showTutorialOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'tutorial-overlay';

  // Find positions of the settings button and team bar
  const settingsBtn = document.querySelector('#map-screen button[title="Settings"]');
  const teamBar = document.getElementById('team-bar');

  if (settingsBtn) {
    const r = settingsBtn.getBoundingClientRect();
    const callout = document.createElement('div');
    callout.className = 'tutorial-callout arrow-right';
    callout.textContent = 'Open settings and turn on Auto Skip!';
    callout.style.top = (r.top + r.height / 2 - 30) + 'px';
    callout.style.right = (window.innerWidth - r.left + 10) + 'px';
    overlay.appendChild(callout);
  }

  if (teamBar) {
    const r = teamBar.getBoundingClientRect();
    const callout = document.createElement('div');
    callout.className = 'tutorial-callout arrow-up';
    callout.textContent = 'Click a Pokémon to swap positions in your team';
    callout.style.top = (r.bottom + 14) + 'px';
    callout.style.left = (r.left + r.width / 2 - 90) + 'px';
    overlay.appendChild(callout);
  }

  const dismiss = document.createElement('div');
  dismiss.className = 'tutorial-dismiss';
  dismiss.textContent = 'Click anywhere to dismiss';
  overlay.appendChild(dismiss);

  overlay.addEventListener('click', () => {
    localStorage.setItem('poke_tutorial_seen', '1');
    overlay.remove();
  });

  document.body.appendChild(overlay);
}

function showItemFoundToast(icon, name) {
  const toast = document.createElement('div');
  toast.className = 'item-found-toast';
  toast.innerHTML = `<span class="item-toast-icon">${icon}</span>
    <div class="ach-toast-text">
      <div class="item-toast-label">Item Found!</div>
      <div class="item-toast-name">${name}</div>
    </div>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}


let _nodeClickBusy = false;
async function onNodeClick(node) {
  if (_nodeClickBusy) return;
  if (!node.accessible) return;
  _nodeClickBusy = true;
  try {
  state.currentNode = node;
  // Lock sibling nodes before saving so F5 can't switch to a different path choice
  for (const n of Object.values(state.map.nodes)) {
    if (n.layer === node.layer && n.id !== node.id && n.accessible) {
      n.accessible = false;
    }
  }
  let resolvedType = node.type;

  if (node.type === NODE_TYPES.QUESTION) {
    if (state.savedQuestionResolve?.nodeId === node.id) {
      resolvedType = state.savedQuestionResolve.resolvedType;
    } else {
      resolvedType = resolveQuestionMark();
      state.savedQuestionResolve = { nodeId: node.id, resolvedType };
    }
  }
  saveRun();

  switch (resolvedType) {
    case NODE_TYPES.BATTLE:
      await doBattleNode(node);
      break;
    case NODE_TYPES.CATCH:
      await doCatchNode(node);
      break;
    case NODE_TYPES.ITEM:
      doItemNode(node);
      break;
    case NODE_TYPES.BOSS:
      await doBossNode(node);
      break;
    case NODE_TYPES.POKECENTER:
      doPokeCenterNode(node);
      break;
    case NODE_TYPES.TRAINER:
      await doTrainerNode(node);
      break;
    case NODE_TYPES.LEGENDARY:
      await doLegendaryNode(node);
      break;
    case NODE_TYPES.MOVE_TUTOR:
      await doMoveTutorNode(node);
      break;
    case NODE_TYPES.TRADE:
      if (state.isEndlessMode) { advanceFromNode(state.map, node.id); showMapScreen(); }
      else await doTradeNode(node);
      break;
    case NODE_TYPES.SILVER:
      await doSilverNode(node);
      break;
    case 'shiny':
      await doShinyNode(node);
      break;
    case 'mega':
      doItemNode(node);
      break;
    default:
      await doBattleNode(node);
  }
  } finally {
    _nodeClickBusy = false;
  }
}

function resolveQuestionMark() {
  const r = rng();
  if (r < 0.22) return NODE_TYPES.BATTLE;
  if (r < 0.42) return NODE_TYPES.TRAINER;
  if (r < 0.52) return state.nuzlockeMode ? NODE_TYPES.BATTLE : NODE_TYPES.CATCH;
  if (r < 0.65) return NODE_TYPES.ITEM;
  if (r < (hasShinyCharm() ? 0.79 : 0.72)) return 'shiny';
  return 'mega';
}

// ---- Node Handlers ----

function getCatchGenRange() {
  if (state.isEndlessMode) return { minGenId: 1, maxGenId: getEndlessMaxGenId(endlessState.stageNumber) };
  if (state.gen2Mode) return { minGenId: 152, maxGenId: 251 };
  return { minGenId: 1, maxGenId: 151 };
}

// Maps a max level to an appropriate map index for BST bucket selection.
function levelToMapIndex(maxLevel) {
  if (maxLevel <= 10) return 0;
  if (maxLevel <= 20) return 1;
  if (maxLevel <= 30) return 3;
  if (maxLevel <= 42) return 4;
  if (maxLevel <= 52) return 6;
  return 7;
}

// In endless mode, use a BST bucket matching the current level range instead of fakeMapIndex.
function getEncounterMapIndex() {
  if (state.isEndlessMode && state.endlessLevelRange) {
    return levelToMapIndex(state.endlessLevelRange[1]);
  }
  return state.currentMap;
}

// Returns a level scaled to the node's layer.
function getLevelForNode(node) {
  if (state.isEndlessMode) {
    // Endless R1M1: level exactly equals layer number (1–7), no spread
    if (endlessState.regionNumber === 1 && endlessState.mapIndexInRegion === 0) return node.layer;
    const [minL, maxL] = state.endlessLevelRange;
    const t = Math.min(1, Math.max(0, (node.layer - 1) / 6)); // 0.0 at layer 1, 1.0 at layer 7
    const base = Math.round(minL + t * (maxL - minL));
    const spread = Math.max(1, Math.round((maxL - minL) / 8));
    return Math.min(maxL, Math.max(minL, base + Math.floor(rng() * spread)));
  }
  // Gen 2: deterministic per-layer curve. Layers 1-7 use fixed offsets so each
  // map reads cleanly as Lv mapMin..mapMin+9 (e.g. 1,2,3,5,6,8,9 in map 1, gym
  // at 10). Boss layer 8 uses leader data, not this function.
  if (state.gen2Mode) {
    const [minL, maxL] = GEN2_MAP_LEVEL_RANGES[state.currentMap];
    if (node.layer >= GEN2_LAYER_OFFSETS.length + 1) return maxL;
    const layerIdx = Math.min(GEN2_LAYER_OFFSETS.length, Math.max(1, node.layer)) - 1;
    return minL + GEN2_LAYER_OFFSETS[layerIdx];
  }
  // Non-gen2: spread levels evenly across layers 1..7 (highest non-boss layer).
  const [minL, maxL] = MAP_LEVEL_RANGES[state.currentMap];
  const t = Math.min(1, Math.max(0, (node.layer - 1) / 6));
  const base = Math.round(minL + t * (maxL - minL));
  const spread = Math.max(1, Math.round((maxL - minL) / 8));
  return Math.min(maxL, Math.max(minL, base + Math.floor(rng() * spread)));
}

async function doBattleNode(node) {
  // Gen 2: wild Pokemon scale below the node's level on a stair-step curve —
  // -1 from map 2, -2 from map 4, -3 from map 6, -4 from map 8 onward.
  // Other modes keep the legacy -1 from map 2 onward.
  const reduction = state.gen2Mode
    ? Math.min(4, Math.floor((state.currentMap + 1) / 2))
    : (!state.isEndlessMode && state.currentMap >= 1 ? 1 : 0);
  const level = Math.max(1, getLevelForNode(node) - reduction);
  let choices = await getCatchChoices(getEncounterMapIndex(), 3, getCatchGenRange().maxGenId, !state.isEndlessMode, getCatchGenRange().minGenId);
  const lvlFiltered = choices.filter(sp => minLevelForSpecies(sp.id ?? sp.speciesId) <= level);
  if (lvlFiltered.length > 0) choices = lvlFiltered;

  // On the first layer of the first map, exclude enemies super effective against the starter
  if (state.currentMap === 0 && node.layer === 1 && state.team.length > 0) {
    const starterTypes = state.team[0].types || [];
    const isSafe = sp => !(sp.types || []).some(et =>
      starterTypes.some(st => (TYPE_CHART[et]?.[st] || 1) >= 2)
    );
    const safe = choices.filter(isSafe);
    if (safe.length > 0) {
      choices = safe;
    } else {
      // Fallback: Eevee (Normal type, never super effective)
      const eevee = await fetchPokemonById(133);
      if (eevee) choices = [eevee];
    }
  }

  const rawSpecies = choices[Math.floor(rng() * choices.length)];
  if (!rawSpecies) {
    advanceFromNode(state.map, node.id);
    showMapScreen();
    return;
  }
  const rawId = rawSpecies.id ?? rawSpecies.speciesId;
  const evoId = resolveEvoForLevel(rawId, level);
  const enemySpecies = evoId !== rawId ? (await fetchPokemonById(evoId) || rawSpecies) : rawSpecies;
  const enemy = createInstance(enemySpecies, level, false, getMoveТierForMap(state.currentMap));
  const titleEl = document.getElementById('battle-title');
  const subEl = document.getElementById('battle-subtitle');
  if (titleEl) titleEl.textContent = `Wild ${enemy.name} appeared!`;
  if (subEl) subEl.textContent = `Level ${enemy.level}`;
  const won = await new Promise(resolve => {
    runBattleScreen([enemy], false, () => resolve(true), () => resolve(false), null, [], 1);
  });
  if (!won) { showGameOver(); return; }
  if (state.isEndlessMode) await applyEndlessBugTrait();
  advanceFromNode(state.map, node.id);
  showMapScreen();
}

async function doBossNode(node) {
  if (state.gen2Mode) {
    if (state.currentMap === 8) { await doGen2Elite4(); return; }
    const leader = JOHTO_GYM_LEADERS[state.currentMap];
    const enemyTeam = leader.team.map(p => ({
      ...createInstance(p, p.level, false, leader.moveTier ?? 1),
      heldItem: p.heldItem || null,
    }));
    showScreen('battle-screen');
    document.getElementById('battle-title').textContent = `Gym Battle vs ${leader.name}!`;
    document.getElementById('battle-subtitle').textContent = `${leader.badge} is on the line!`;
    await runBattleScreen(enemyTeam, true, () => {
      state.badges++;
      advanceFromNode(state.map, node.id);
      showBadgeScreen(leader);
      const ach = unlockAchievement(`gym_${state.currentMap}`);
      if (ach) showAchievementToast(ach);
    }, () => { showGameOver(); }, leader.name);
    return;
  }

  if (state.currentMap === 8) {
    await doElite4();
    return;
  }
  const leader = GYM_LEADERS[state.currentMap];
  const enemyTeam = leader.team.map(p => ({
    ...createInstance(p, p.level, false, leader.moveTier ?? 1),
    heldItem: p.heldItem || null,
  }));

  showScreen('battle-screen');
  document.getElementById('battle-title').textContent = `Gym Battle vs ${leader.name}!`;
  document.getElementById('battle-subtitle').textContent = `${leader.badge} is on the line!`;
  await runBattleScreen(enemyTeam, true, () => {
    state.badges++;
    advanceFromNode(state.map, node.id);
    showBadgeScreen(leader);
    const ach = unlockAchievement(`gym_${state.currentMap}`);
    if (ach) showAchievementToast(ach);
  }, () => {
    showGameOver();
  }, leader.name);
}

async function doElite4() {
  const bosses = ELITE_4;
  for (let i = state.eliteIndex; i < bosses.length; i++) {
    state.eliteIndex = i;
    const boss = bosses[i];
    const enemyTeam = boss.team.map(p => createInstance(p, p.level, false, 2));

    showScreen('battle-screen');
    document.getElementById('battle-title').textContent = `${boss.title}: ${boss.name}!`;
    document.getElementById('battle-subtitle').textContent = i === 4 ? 'Final Battle!' : `Elite Four - Battle ${i+1}/4`;
    const won = await new Promise(resolve => {
      runBattleScreen(enemyTeam, true, () => resolve(true), () => resolve(false), boss.name);
    });

    if (!won) { showGameOver(); return; }
    if (i < bosses.length - 1) {
      await showEliteTransition(boss.name, i + 1);
    }
  }
  const eliteAch = unlockAchievement('elite_four');
  if (eliteAch) showAchievementToast(eliteAch);
  showWinScreen();
}

async function doSilverNode(node) {
  // Encounter index is keyed off the current map so skipping earlier Silver
  // fights doesn't make a later one trivial.
  const SILVER_ENC_BY_MAP = { 1: 0, 3: 1, 5: 2, 7: 3 };
  const encounterIdx = Math.min(
    SILVER_ENC_BY_MAP[state.currentMap] ?? (state.silverBeaten || 0),
    SILVER_ENCOUNTERS.length - 1,
  );
  const silverData = SILVER_ENCOUNTERS[encounterIdx];
  // Move tier scales with the current map so enc 0 isn't slammed with T2 moves.
  const silverTier = getMoveТierForMap(state.currentMap);
  const enemyTeam = silverData.team.map(p => ({
    ...createInstance(p, p.level, false, silverTier),
    heldItem: p.heldItem || null,
  }));
  const starterLine = SILVER_STARTER_LINES[state.starterSpeciesId];
  if (starterLine) {
    // Use natural evolution thresholds against the encounter level.
    const lastIdx = enemyTeam.length - 1;
    const lvl = enemyTeam[lastIdx].level;
    const evolvedId = resolveEvoForLevel(starterLine[0].speciesId, lvl);
    const stageIdx = Math.max(0, starterLine.findIndex(s => s.speciesId === evolvedId));
    const starterSpecies = starterLine[stageIdx];
    enemyTeam[lastIdx] = { ...createInstance(starterSpecies, lvl, false, silverTier), heldItem: starterSpecies.heldItem || null };
  }
  showScreen('battle-screen');
  document.getElementById('battle-title').textContent = 'Silver wants to battle!';
  document.getElementById('battle-subtitle').textContent = 'Rival Battle — Double XP';
  const won = await new Promise(resolve => {
    // Silver gives +4 base (Double XP), to every team member regardless of
    // whether they participated or fainted. Lucky egg etc. still apply.
    runBattleScreen(enemyTeam, true, () => resolve(true), () => resolve(false), 'silver', [], 4, null, null, true);
  });
  if (!won) { showGameOver(); return; }
  // Full heal after the rival battle.
  for (const p of state.team) p.currentHp = p.maxHp;
  state.silverBeaten = (state.silverBeaten || 0) + 1;
  advanceFromNode(state.map, node.id);
  showMapScreen();
}

function showEliteTransition(defeatedName, nextIndex, bossArray = ELITE_4) {
  return new Promise(resolve => {
    const el = document.getElementById('transition-screen');
    if (!el) { resolve(); return; }
    document.getElementById('transition-msg').textContent = `${defeatedName} defeated!`;
    document.getElementById('transition-sub').textContent =
      nextIndex < bossArray.length - 1 ? `Next: ${bossArray[nextIndex].name}...` : `The Champion awaits!`;
    showScreen('transition-screen');
    setTimeout(() => resolve(), 2000);
  });
}

// Prep screen shown between Elite 4 / Champion battles. Shows the next
// opponent's roster, lets the player drag-reorder their team and use items,
// then proceeds on Continue.
function showElitePrepScreen({ title, subtitle, nextBoss }) {
  return new Promise(resolve => {
    document.getElementById('elite-prep-title').textContent = title;
    document.getElementById('elite-prep-sub').textContent = subtitle;

    const enemyEl = document.getElementById('elite-prep-enemy-team');
    enemyEl.innerHTML = nextBoss.team.map(p => {
      const sprite = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.speciesId}.png`;
      const types  = (p.types || []).map(t => `<span class="type-badge type-${t.toLowerCase()}" style="font-size:5px;padding:1px 2px;">${t}</span>`).join('');
      const item   = p.heldItem ? `<div style="font-size:7px;color:var(--text-dim);margin-top:2px;">${itemIconHtml(p.heldItem, 12)}</div>` : '';
      return `<div class="elite-prep-enemy-slot">
        <img src="${sprite}" alt="${p.name}" onerror="this.style.display='none'">
        <div class="name">${p.name}</div>
        <div class="lv">Lv ${p.level}</div>
        <div class="types">${types}</div>
        ${item}
      </div>`;
    }).join('');

    const teamEl  = document.getElementById('elite-prep-player-team');
    const itemsEl = document.getElementById('elite-prep-items');
    const refresh = () => {
      renderTeamBar(state.team, teamEl, false, true, refresh);
      renderItemBadges(state.items, itemsEl, refresh);
    };
    refresh();

    showScreen('elite-prep-screen');

    const btn = document.getElementById('btn-elite-prep-continue');
    const onContinue = () => {
      btn.removeEventListener('click', onContinue);
      resolve();
    };
    btn.addEventListener('click', onContinue);
  });
}

async function doGen2Elite4() {
  const bosses = GEN2_ELITE_4;
  const resumeFrom = state.eliteIndex;
  for (let i = state.eliteIndex; i < bosses.length; i++) {
    state.eliteIndex = i;
    saveRun();
    const boss = bosses[i];
    // Prep screen before each Elite battle — but skip it on the resumed
    // fight so reloading drops the player straight back into the battle.
    const isResumedFight = i === resumeFrom && resumeFrom > 0;
    if (!isResumedFight) {
      const prevName = i === 0 ? null : bosses[i - 1].name;
      await showElitePrepScreen({
        title: prevName ? `${prevName} defeated!` : 'The Elite Four await!',
        subtitle: `Next: ${boss.name} (${boss.type}) — Battle ${i + 1}/${bosses.length}`,
        nextBoss: boss,
      });
    }
    const enemyTeam = boss.team.map(p => ({ ...createInstance(p, p.level, false, 2), heldItem: p.heldItem || null }));
    showScreen('battle-screen');
    document.getElementById('battle-title').textContent = `${boss.title}: ${boss.name}!`;
    document.getElementById('battle-subtitle').textContent =
      i < bosses.length - 1 ? `Elite Four — Battle ${i + 1}/${bosses.length - 1}` : 'Final Battle!';
    const won = await new Promise(resolve => {
      runBattleScreen(enemyTeam, true, () => resolve(true), () => resolve(false), boss.name);
    });
    if (!won) { showGameOver(); return; }
  }
  const eliteAch = unlockAchievement('elite_four');
  if (eliteAch) showAchievementToast(eliteAch);
  const winAch = unlockAchievement('gen2_win');
  if (winAch) showAchievementToast(winAch);
  state.eliteIndex = 0;
  showWinScreen();
}




async function doCatchNode(node) {
  showScreen('catch-screen');
  renderTeamBar(state.team, document.getElementById('catch-team-bar'), true);
  const choicesEl = document.getElementById('catch-choices');

  let instances, rerollPool, level;

  if (state.savedCatch?.nodeId === node.id && Array.isArray(state.savedCatch.instances)) {
    // Restore persisted choices after a page refresh so the same Pokemon are always shown
    ({ instances, rerollPool, level } = state.savedCatch);
  } else {
    choicesEl.innerHTML = '<div class="loading">Finding Pokemon...</div>';

    let choices = await getCatchChoices(getEncounterMapIndex(), 18, getCatchGenRange().maxGenId, !state.isEndlessMode, getCatchGenRange().minGenId);
    const isFirstMap = state.currentMap === 0 || (state.isEndlessMode && endlessState.regionNumber === 1 && endlessState.mapIndexInRegion === 0);
    level = isFirstMap ? Math.max(4, getLevelForNode(node)) : getLevelForNode(node);
    const lvlFiltered = choices.filter(sp => minLevelForSpecies(sp.id ?? sp.speciesId) <= level);
    if (lvlFiltered.length > 0) {
      // Pad with ineligible choices if filtering drops below 3 so there are always 3 options
      choices = lvlFiltered.length < 3
        ? [...lvlFiltered, ...choices.filter(sp => !lvlFiltered.includes(sp))].slice(0, 3)
        : lvlFiltered;
    }

    // Nuzlocke map 1: restrict to curated pool (Gen 1 only)
    if (state.nuzlockeMode && state.currentMap === 0 && !state.gen2Mode) {
      const nuzlockeMap1Ids = new Set([10,11,27,54,56,60,69,72,74,79,81,86,96,98,100,102,111,116,118,120,129,133]);
      const filtered = choices.filter(sp => nuzlockeMap1Ids.has(sp.id ?? sp.speciesId));
      if (filtered.length > 0) choices = filtered;
    }

    // Map 1, layer 1: guarantee at least one Grass AND one Water Pokemon (non-nuzlocke only)
    if (!state.nuzlockeMode && state.currentMap === 0 && node.layer === 1) {
      const grassIds = state.gen2Mode ? [187, 191] : [43, 69, 102]; // Gen2: Hoppip, Sunkern | Gen1: Oddish, Bellsprout, Exeggcute
      const waterIds = state.gen2Mode ? [183, 194, 223] : [54, 60, 72, 79, 86, 98, 116, 118, 120, 129]; // Gen2: Marill, Wooper, Remoraid
      if (!choices.some(p => p.types?.includes('Grass'))) {
        const id = grassIds[Math.floor(rng() * grassIds.length)];
        const r = await fetchPokemonById(id);
        if (r) choices[0] = r;
      }
      if (!choices.some(p => p.types?.includes('Water'))) {
        const id = waterIds[Math.floor(rng() * waterIds.length)];
        const r = await fetchPokemonById(id);
        if (r) {
          const slot = choices.findIndex(p => !p.types?.includes('Grass'));
          choices[slot === -1 ? 2 : slot] = r;
        }
      }
    }

    // Save all level-filtered candidates before team-dup filters (for reroll pool variety)
    const allCandidates = [...choices];

    const teamRoots = new Set(state.team.map(p => getEvoLineRoot(p.speciesId)));
    if (state.nuzlockeMode) {
      const filtered = choices.filter(sp => !teamRoots.has(getEvoLineRoot(sp.id)));
      choices = (filtered.length > 0 ? filtered : choices).slice(0, 1);
    }
    if (state.isEndlessMode) {
      const filtered = choices.filter(sp => !teamRoots.has(getEvoLineRoot(sp.id ?? sp.speciesId)));
      if (filtered.length > 0) {
        choices = filtered;
        if (choices.length < 3) {
          const lowerIdx = Math.max(0, getEncounterMapIndex() - 1);
          if (lowerIdx < getEncounterMapIndex()) {
            const maxGen = getEndlessMaxGenId(endlessState.stageNumber);
            const lowerPool = await getCatchChoices(lowerIdx, 18, maxGen);
            const choiceRoots = new Set(choices.map(sp => getEvoLineRoot(sp.id ?? sp.speciesId)));
            const extras = lowerPool.filter(sp =>
              !teamRoots.has(getEvoLineRoot(sp.id ?? sp.speciesId)) &&
              !choiceRoots.has(getEvoLineRoot(sp.id ?? sp.speciesId))
            );
            choices = [...choices, ...extras].slice(0, 3);
          }
        }
      }
    }
    const displayedIds = new Set(choices.slice(0, 3).map(sp => sp.id ?? sp.speciesId));
    rerollPool = allCandidates.filter(sp => !displayedIds.has(sp.id ?? sp.speciesId));
    choices = choices.slice(0, 3);

    instances = choices.map(sp => createInstance(sp, sp._legendary ? level + 5 : level, rng() < (hasShinyCharm() ? 0.02 : 0.01), getMoveТierForMap(state.currentMap)));

    state.savedCatch = { nodeId: node.id, instances, rerollPool, level };
    saveRun();
  }

  const rerolled = new Set();

  function renderCatchSlot(inst, slotIdx) {
    loadBuffsIntoPokemon(inst);
    const caught = inst.isShiny
      ? !!(getShinyDex()[inst.speciesId])
      : !!(getPokedex()[inst.speciesId]?.caught);
    const myRoot = getEvoLineRoot(inst.speciesId);
    const hofStarterBadge = inst.isShiny
      ? (!caught && getUsedStarters().some(id => getEvoLineRoot(id) === myRoot))
      : getHallOfFame().some(e => e.team?.some(p => getEvoLineRoot(p.speciesId) === myRoot));
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderPokemonCard(inst, true, false, caught, hofStarterBadge);
    const card = wrapper.querySelector('.poke-card');
    card.style.cursor = 'pointer';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.addEventListener('click', () => catchPokemon(inst, node));
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') catchPokemon(inst, node); });
    const wrap = document.createElement('div');
    wrap.className = 'poke-choice-wrap';
    wrap.appendChild(card);
    wrap.insertAdjacentHTML('beforeend', renderTraitPreview(inst, state.team));
    if (state.isEndlessMode && !rerolled.has(slotIdx)) {
      const btn = document.createElement('button');
      btn.className = 'btn-secondary reroll-btn';
      btn.textContent = 'Reroll';
      btn.addEventListener('click', async () => {
        rerolled.add(slotIdx);
        btn.disabled = true;
        // Exclude other displayed slots AND current team members (by evo-line root)
        const otherRoots = new Set([
          ...instances.filter((_, i) => i !== slotIdx).map(i => getEvoLineRoot(i.speciesId)),
          ...state.team.map(p => getEvoLineRoot(p.speciesId)),
        ]);
        let src = rerollPool.filter(sp => !otherRoots.has(getEvoLineRoot(sp.id ?? sp.speciesId)));
        if (src.length === 0) {
          const fresh = await getCatchChoices(getEncounterMapIndex(), 6, getCatchGenRange().maxGenId, !state.isEndlessMode, getCatchGenRange().minGenId);
          const otherRootsPost = new Set([
            ...instances.filter((_, i) => i !== slotIdx).map(i => getEvoLineRoot(i.speciesId)),
            ...state.team.map(p => getEvoLineRoot(p.speciesId)),
          ]);
          src = fresh.filter(sp => !otherRootsPost.has(getEvoLineRoot(sp.id ?? sp.speciesId)));
          if (src.length === 0) src = fresh;
        }
        if (src.length === 0) return;
        const pick = src[Math.floor(rng() * src.length)];
        // Remove picked from pool so subsequent rerolls can't get the same pokemon
        const pickIdx = rerollPool.indexOf(pick);
        if (pickIdx !== -1) rerollPool.splice(pickIdx, 1);
        const newInst = createInstance(pick, level, rng() < (hasShinyCharm() ? 0.02 : 0.01), getMoveТierForMap(state.currentMap));
        instances[slotIdx] = newInst;
        choicesEl.replaceChild(renderCatchSlot(newInst, slotIdx), choicesEl.children[slotIdx]);
      });
      wrap.appendChild(btn);
    }
    return wrap;
  }

  choicesEl.innerHTML = '';
  for (let i = 0; i < instances.length; i++) {
    choicesEl.appendChild(renderCatchSlot(instances[i], i));
  }

  document.getElementById('btn-skip-catch').onclick = () => {
    state.savedCatch = null;
    state.savedQuestionResolve = null;
    advanceFromNode(state.map, node.id);
    showMapScreen();
  };
}

function checkStarterCollectionAchievements() {
  const stage = endlessState.stageNumber;
  const starterIds = REGION_STARTERS[stage];
  if (!starterIds) return;
  const hof = getHallOfFame();
  const used = new Set(
    hof
      .filter(e => e.endless && e.stageNumber === stage && e.starterSpeciesId)
      .map(e => e.starterSpeciesId)
  );
  if (starterIds.some(id => used.has(id))) {
    const ach = unlockAchievement(`starters_stage_${stage}`);
    if (ach) showAchievementToast(ach);
  }
}

function checkDexAchievements() {
  if (isPokedexComplete()) {
    const ach = unlockAchievement('pokedex_complete');
    if (ach) showAchievementToast(ach);
  }
  const shinyCount = [...ALL_CATCHABLE_IDS, ...LEGENDARY_IDS].filter(id => getShinyDex()[id]).length;
  for (const threshold of [100, 200, 300, 400, 500, 600]) {
    if (shinyCount >= threshold) {
      const ach = unlockAchievement(`shinydex_${threshold}`);
      if (ach) showAchievementToast(ach);
    }
  }
  if (isShinyDexComplete()) {
    const ach = unlockAchievement('shinydex_complete');
    if (ach) showAchievementToast(ach);
  }
  if (isShinyGenDexComplete(1, 649)) {
    const ach = unlockAchievement('shinydex_all');
    if (ach) showAchievementToast(ach);
  }
  const genRanges = [
    ['pokedex_gen2', 152, 251],
    ['pokedex_gen3', 252, 386],
    ['pokedex_gen4', 387, 493],
    ['pokedex_gen5', 494, 649],
  ];
  for (const [id, min, max] of genRanges) {
    if (isGenDexComplete(min, max)) {
      const ach = unlockAchievement(id);
      if (ach) showAchievementToast(ach);
    }
  }
}

function catchPokemon(pokemon, node) {
  const normalUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.speciesId}.png`;
  markPokedexCaught(pokemon.speciesId, pokemon.name, pokemon.types, normalUrl);
  if (pokemon.isShiny) markShinyDexCaught(pokemon.speciesId, pokemon.name, pokemon.types, pokemon.spriteUrl);
  checkDexAchievements();
  if (state.team.length < 6) {
    loadBuffsIntoPokemon(pokemon);
    state.team.push(pokemon);
    if (state.team.length > state.maxTeamSize) state.maxTeamSize = state.team.length;
    state.savedCatch = null;
    state.savedQuestionResolve = null;
    advanceFromNode(state.map, node.id);
    showMapScreen();
  } else {
    showSwapScreen(pokemon, node);
  }
}

function showSwapScreen(newPoke, node) {
  showScreen('swap-screen');
  const hasRoom = state.team.length < 6;
  const h2 = document.querySelector('#swap-screen h2');
  if (h2) h2.textContent = hasRoom ? 'New Pokémon!' : 'Team Full!';
  const swapCaught = !!(getPokedex()[newPoke.speciesId]?.caught);
  document.getElementById('swap-incoming').innerHTML = `<div style="display:flex;justify-content:center;">${renderPokemonCard(newPoke, true, false, swapCaught)}</div>`;
  const el = document.getElementById('swap-choices');
  el.innerHTML = '';
  document.getElementById('swap-prompt').textContent = hasRoom ? 'Add to team or keep team as-is:' : 'Choose a Pokémon to release:';

  // Trait overlay (endless mode only)
  let traitOverlay = document.getElementById('swap-trait-overlay');
  if (traitOverlay) traitOverlay.remove();
  if (state.isEndlessMode) {
    traitOverlay = document.createElement('div');
    traitOverlay.id = 'swap-trait-overlay';
    traitOverlay.style.cssText = [
      'position:fixed', 'right:16px', 'top:50%', 'transform:translateY(-50%)',
      'background:var(--bg-card)', 'border:2px solid var(--border)', 'border-radius:8px',
      'padding:10px 12px', 'min-width:150px', 'display:none', 'z-index:200',
      'font-family:"Press Start 2P",monospace', 'box-shadow:2px 2px 0 #000',
    ].join(';');
    document.body.appendChild(traitOverlay);
  }

  const cleanup = () => { if (traitOverlay) traitOverlay.remove(); };

  if (hasRoom) {
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-primary';
    addBtn.style.cssText = 'width:100%;margin-bottom:10px;';
    addBtn.textContent = `Add ${newPoke.name} to team!`;
    addBtn.addEventListener('click', () => {
      cleanup();
      loadBuffsIntoPokemon(newPoke);
      state.team.push(newPoke);
      if (state.team.length > state.maxTeamSize) state.maxTeamSize = state.team.length;
      state.savedCatch = null;
      state.savedQuestionResolve = null;
      advanceFromNode(state.map, node.id);
      state.currentNode = null;
      showMapNotification(`${newPoke.name} joined your team!`);
      showMapScreen();
    });
    el.appendChild(addBtn);
  }

  for (let i = 0; i < state.team.length; i++) {
    if (hasRoom) break;
    const p = state.team[i];
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderPokemonCard(p, true, false);
    const card = wrapper.querySelector('.poke-card');
    card.style.cursor = 'pointer';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    const idx = i;
    card.addEventListener('click', () => {
      cleanup();
      if (newPoke.isShiny) markShinyDexCaught(newPoke.speciesId, newPoke.name, newPoke.types, newPoke.spriteUrl);
      const released = state.team[idx];
      if (released.heldItem) state.items.push(released.heldItem);
      loadBuffsIntoPokemon(newPoke);
      state.team.splice(idx, 1, newPoke);
      state.savedCatch = null;
      state.savedQuestionResolve = null;
      advanceFromNode(state.map, node.id);
      state.currentNode = null;
      showMapScreen();
    });
    if (traitOverlay) {
      card.addEventListener('mouseenter', () => {
        const hypothetical = state.team.map((m, j) => j === idx ? newPoke : m);
        const cur  = getTraitDisplayData(state.team);
        const next = getTraitDisplayData(hypothetical);
        const curMap  = Object.fromEntries(cur.map(e  => [e.type, e]));
        const nextMap = Object.fromEntries(next.map(e => [e.type, e]));
        const allTypes = [...new Set([...cur.map(e => e.type), ...next.map(e => e.type)])];
        const rows = allTypes.map(type => {
          const c = curMap[type]  || { tier: 0, count: 0 };
          const n = nextMap[type] || { tier: 0, count: 0 };
          const diff = n.tier - c.tier;
          const diffHtml = diff > 0
            ? `<span style="color:#4f4;font-size:7px;">+${diff}</span>`
            : diff < 0
              ? `<span style="color:#f44;font-size:7px;">${diff}</span>`
              : '';
          const tierDots = (t) => '●'.repeat(t) + '○'.repeat(3 - t);
          return `<div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;">
            <span class="type-badge type-${type.toLowerCase()}" style="font-size:5px;padding:1px 3px;min-width:36px;text-align:center;">${type}</span>
            <span style="font-size:7px;color:var(--text-dim);">${tierDots(n.tier)}</span>
            ${diffHtml}
          </div>`;
        }).join('');
        traitOverlay.innerHTML = `
          <div style="font-size:6px;color:var(--text-dim);margin-bottom:6px;letter-spacing:1px;">TRAITS AFTER</div>
          ${rows || '<div style="font-size:6px;color:var(--text-dim);">No active traits</div>'}`;
        traitOverlay.style.display = 'block';
      });
      card.addEventListener('mouseleave', () => { traitOverlay.style.display = 'none'; });
    }
    el.appendChild(card);
  }

  document.getElementById('btn-cancel-swap').onclick = () => {
    cleanup();
    state.savedCatch = null;
    state.savedQuestionResolve = null;
    advanceFromNode(state.map, node.id);
    state.currentNode = null;
    showMapScreen();
  };
}

function doItemNode(node) {
  showScreen('item-screen');
  renderTeamBar(state.team, document.getElementById('item-team-bar'));

  // Exclude held-type items already in bag or on a Pokemon (usable items can stack)
  const usedIds = new Set([
    ...state.items.filter(it => !it.usable).map(it => it.id),
    ...state.team.filter(p => p.heldItem).map(p => p.heldItem.id),
  ]);
  const heldAvailable = ITEM_POOL.filter(it =>
    !usedIds.has(it.id) && (it.minMap === undefined || state.currentMap >= it.minMap)
  );

  // Usable items: filter out ones that can't be applied to current team
  const canUseMaxRevive   = state.team.some(p => p.currentHp <= 0);
  const canUseFullRestore = state.team.some(p => p.currentHp > 0 && p.currentHp < p.maxHp);
  const canUseEvoStone    = state.team.some(p => {
    if (p.speciesId === 133) return true;
    const evo = EVOLUTIONS[p.speciesId];
    return evo && evo.into !== p.speciesId;
  });
  const canUseTm          = state.team.some(p => (p.moveTier ?? 1) < 2);
  const usableAvailable = USABLE_ITEM_POOL.filter(it => {
    if (it.id === 'max_revive')   return canUseMaxRevive;
    if (it.id === 'full_restore') return canUseFullRestore;
    if (it.id === 'moon_stone')   return canUseEvoStone;
    if (it.id === 'tm_normal')    return canUseTm;
    return true;
  });

  const available = [...heldAvailable, ...usableAvailable];
  // Fisher-Yates shuffle — sort(() => rng() - 0.5) is famously biased.
  const shuffled = [...available];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const picks = shuffled.slice(0, 3);

  const el = document.getElementById('item-choices');
  el.innerHTML = '';
  for (const item of picks) {
    const div = document.createElement('div');
    div.className = 'item-card';
    div.innerHTML = `<div class="item-icon">${itemIconHtml(item, 36)}</div>
      <div class="item-name">${item.name}</div>
      <div class="item-desc">${item.desc}</div>
      ${item.usable ? '<div style="font-size:9px;color:#4af;margin-top:4px;">USABLE ITEM</div>' : ''}`;
    div.style.cursor = 'pointer';
    div.addEventListener('click', () => {
      state.pickedUpItem = true;
      if (item.usable) {
        state.items.push({ ...item });
        advanceFromNode(state.map, node.id);
        showMapScreen();
      } else {
        openItemEquipModal(item, {
          onComplete: () => { advanceFromNode(state.map, node.id); showMapScreen(); },
        });
      }
    });
    el.appendChild(div);
  }

  const itemSkipBtn = document.getElementById('btn-skip-item');
  itemSkipBtn.style.display = '';
  itemSkipBtn.onclick = () => {
    advanceFromNode(state.map, node.id);
    showMapScreen();
  };
}

function openItemEquipModal(item, { fromBagIdx = -1, fromPokemonIdx = -1, onComplete = null } = {}) {
  document.getElementById('item-equip-modal')?.remove();

  const done = onComplete || (() => {
    renderItemBadges(state.items);
    renderTeamBar(state.team);
  });

  const modal = document.createElement('div');
  modal.id = 'item-equip-modal';
  modal.className = 'item-equip-overlay';

  const rows = state.team.map((p, i) => {
    const isSelf = fromPokemonIdx === i;
    const hasHeld = !!p.heldItem;
    const btnLabel = isSelf ? 'Holding' : hasHeld ? 'Swap' : 'Equip';
    return `<div class="equip-pokemon-row">
      <img src="${p.spriteUrl}" class="equip-poke-sprite" onerror="this.style.display='none'">
      <div class="equip-poke-info">
        <div class="equip-poke-name">${p.nickname || p.name}</div>
        <div class="equip-poke-lv">Lv${p.level}</div>
      </div>
      <div class="equip-held-slot">
        ${hasHeld
          ? `<span class="equip-held-item" title="${p.heldItem.desc}">${itemIconHtml(p.heldItem, 18)} ${p.heldItem.name}</span>`
          : '<span class="equip-empty-slot">— empty —</span>'}
      </div>
      <div class="equip-btn-group">
        ${isSelf
          ? `<button class="equip-btn equip-btn-unequip" data-unequip="${i}">Unequip</button>`
          : `<button class="equip-btn${hasHeld ? ' equip-btn-swap' : ''}" data-idx="${i}">${btnLabel}</button>`}
        ${hasHeld && !isSelf ? `<button class="equip-btn equip-btn-unequip" data-unequip="${i}" title="Unequip ${p.heldItem.name}">×</button>` : ''}
      </div>
    </div>`;
  }).join('');

  modal.innerHTML = `
    <div class="item-equip-box">
      <div class="equip-item-header">
        <span class="equip-item-icon">${itemIconHtml(item, 32)}</span>
        <div>
          <div class="equip-item-name">${item.name}</div>
          <div class="equip-item-desc">${item.desc}</div>
        </div>
      </div>
      <div class="equip-pokemon-list">${rows}</div>
      <button id="btn-equip-to-bag" class="btn-secondary" style="width:100%;margin-top:8px;">
        ${fromPokemonIdx >= 0 ? '⬇ Unequip (return to bag)' : 'Keep in Bag'}
      </button>
      <button id="btn-equip-cancel" class="btn-secondary" style="width:100%;margin-top:4px;">Cancel</button>
    </div>`;

  document.body.appendChild(modal);

  // Unequip buttons — strip item off a Pokemon and bag it, without equipping current item
  modal.querySelectorAll('[data-unequip]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.unequip);
      const pokemon = state.team[idx];
      if (pokemon.heldItem) {
        state.items.push(pokemon.heldItem);
        pokemon.heldItem = null;
      }
      modal.remove();
      done();
    });
  });

  modal.querySelectorAll('button[data-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      const pokemon = state.team[idx];
      const displaced = pokemon.heldItem;

      // Remove item from its source
      if (fromBagIdx >= 0) {
        state.items.splice(fromBagIdx, 1);
        if (displaced) state.items.push(displaced);
      } else if (fromPokemonIdx >= 0) {
        // True swap: give the displaced item back to the source Pokemon
        state.team[fromPokemonIdx].heldItem = displaced || null;
      } else {
        // Brand new item from a node — displaced item goes to bag
        if (displaced) state.items.push(displaced);
      }

      pokemon.heldItem = item;
      modal.remove();
      done();
    });
  });

  modal.querySelector('#btn-equip-to-bag').addEventListener('click', () => {
    if (fromPokemonIdx >= 0) {
      state.team[fromPokemonIdx].heldItem = null;
      state.items.push(item);
    } else if (fromBagIdx < 0) {
      // Brand new item — put in bag
      state.items.push(item);
    }
    // fromBagIdx >= 0 means it's already in bag — do nothing
    modal.remove();
    done();
  });

  modal.querySelector('#btn-equip-cancel').addEventListener('click', () => {
    modal.remove();
  });

}

function openUsableItemModal(item, bagIdx, afterUse = null) {
  // Escape Rope auto-triggers from runBattleScreen on a non-boss loss; clicking
  // it manually just informs the player so they don't accidentally consume it.
  if (item.id === 'escape_rope') {
    showMapNotification('🪢 Escape Rope auto-uses on a non-boss loss to save your run.');
    return;
  }
  document.getElementById('usable-item-modal')?.remove();

  const canTarget = p => {
    if (item.id === 'max_revive')   return p.currentHp <= 0;
    if (item.id === 'full_restore') return p.currentHp > 0 && p.currentHp < p.maxHp;
    if (item.id === 'moon_stone') {
      if (p.currentHp <= 0) return false;
      if (p.speciesId === 133) return true;
      const evo = EVOLUTIONS[p.speciesId];
      return !!(evo && evo.into !== p.speciesId);
    }
    if (item.id === 'tm_normal') return p.currentHp > 0 && (p.moveTier ?? 1) < 2;
    return true;
  };

  const rows = state.team.map((p, i) => {
    const enabled = canTarget(p);
    const statusText = p.currentHp <= 0 ? 'Fainted' : `${p.currentHp}/${p.maxHp} HP`;
    return `<div class="equip-pokemon-row" data-idx="${i}"
        style="${enabled ? 'cursor:pointer;' : 'opacity:0.4;cursor:default;pointer-events:none;'}">
      <img src="${p.spriteUrl}" class="equip-poke-sprite" onerror="this.style.display='none'">
      <div class="equip-poke-info">
        <div class="equip-poke-name">${p.nickname || p.name}</div>
        <div class="equip-poke-lv">Lv${p.level} — ${statusText}</div>
      </div>
    </div>`;
  }).join('');

  const modal = document.createElement('div');
  modal.id = 'usable-item-modal';
  modal.className = 'item-equip-overlay';
  modal.innerHTML = `
    <div class="item-equip-box">
      <div class="equip-item-header">
        <span class="equip-item-icon">${itemIconHtml(item, 32)}</span>
        <div>
          <div class="equip-item-name">${item.name}</div>
          <div class="equip-item-desc">${item.desc}</div>
        </div>
      </div>
      <div class="equip-pokemon-list">${rows}</div>
      <button id="btn-cancel-use" class="btn-secondary" style="width:100%;margin-top:8px;">Cancel</button>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelector('#btn-cancel-use').addEventListener('click', () => modal.remove());

  modal.querySelectorAll('[data-idx]').forEach(row => {
    if (row.style.pointerEvents === 'none') return;
    row.addEventListener('click', async () => {
      const idx = parseInt(row.dataset.idx);
      const pokemon = state.team[idx];
      modal.remove();
      state.items.splice(bagIdx, 1);

      if (item.id === 'max_revive') {
        pokemon.currentHp = pokemon.maxHp;
        showMapNotification(`${pokemon.nickname || pokemon.name} was revived!`);
        renderItemBadges(state.items);
        renderTeamBar(state.team);

      } else if (item.id === 'full_restore') {
        pokemon.currentHp = pokemon.maxHp;
        showMapNotification(`${pokemon.nickname || pokemon.name} was fully restored!`);
        renderItemBadges(state.items);
        renderTeamBar(state.team);

      } else if (item.id === 'rare_candy') {
        for (let i = 0; i < 3; i++) {
          if (pokemon.level < 100) pokemon.level++;
        }
        showMapNotification(`${pokemon.nickname || pokemon.name} grew to Lv ${pokemon.level}!`);
        renderItemBadges(state.items);
        renderTeamBar(state.team);
        await checkAndEvolveTeam();

      } else if (item.id === 'moon_stone') {
        renderItemBadges(state.items);
        await applyEvolution(pokemon);

      } else if (item.id === 'tm_normal') {
        pokemon.moveTier = Math.min(2, (pokemon.moveTier ?? 1) + 1);
        const newMove = getBestMove(pokemon.types || ['Normal'], pokemon.baseStats, pokemon.speciesId, pokemon.moveTier, pokemon.heldItem);
        showMapNotification(`${pokemon.nickname || pokemon.name} learned ${newMove.name}!`);
        renderItemBadges(state.items);
        renderTeamBar(state.team);

      }
      if (afterUse) afterUse();
    });
  });
}

async function applyEvolution(pokemon) {
  let evo;
  const branchingChoices = BRANCHING_EVOLUTIONS[pokemon.speciesId];
  if (branchingChoices) {
    evo = await showBranchingChoice(pokemon, branchingChoices);
  } else {
    evo = EVOLUTIONS[pokemon.speciesId];
    if (!evo) return;
  }

  if (pokemon.heldItem?.id === 'eviolite') return;
  await playEvoAnimation(pokemon, evo);

  const oldHpRatio = pokemon.currentHp / pokemon.maxHp;
  const newSpecies = await fetchPokemonById(evo.into);

  pokemon.speciesId = evo.into;
  pokemon.name      = evo.name;
  pokemon.spriteUrl = pokemon.isShiny
    ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${evo.into}.png`
    : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${evo.into}.png`;

  if (newSpecies) {
    pokemon.types     = newSpecies.types;
    pokemon.baseStats = newSpecies.baseStats;
    const hpBuff      = pokemon.statBuffs?.hp ?? 0;
    const newMax      = Math.floor(calcHp(newSpecies.baseStats.hp, pokemon.level) * (1 + 0.1 * hpBuff));
    pokemon.maxHp     = newMax;
    pokemon.currentHp = Math.max(1, Math.floor(oldHpRatio * newMax));
  }

  const normalUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.speciesId}.png`;
  markPokedexCaught(pokemon.speciesId, pokemon.name, pokemon.types, normalUrl);
  if (pokemon.isShiny) markShinyDexCaught(pokemon.speciesId, pokemon.name, pokemon.types, pokemon.spriteUrl);
  checkDexAchievements();
  renderItemBadges(state.items);
  renderTeamBar(state.team);
  saveRun();
}

function doPokeCenterNode(node) {
  state.usedPokecenter = true;
  for (const p of state.team) p.currentHp = p.maxHp;
  advanceFromNode(state.map, node.id);
  showMapScreen();
  showMapNotification('🏥 Your team was fully healed!');
}

// ---- Trainer Battle Node ----

// Species pools for each trainer archetype (Gen 1 IDs).
// null = use the map's random BST pool instead.
const TRAINER_BATTLE_CONFIG = {
  bugCatcher:  { name: 'Bug Catcher',   sprite: 'bugcatcher',
                 pool: [10,11,12,13,14,15,46,47,48,49,123,127],
                 gen2Pool: [165,166,167,168,193,204,205,213,214] },
  hiker:       { name: 'Hiker',         sprite: 'hiker',
                 pool: [27,28,50,51,66,67,68,74,75,76,95,111,112],
                 gen2Pool: [74,75,76,95,194,195,208,220,221] },
  fisher:      { name: 'Fisherman',     sprite: 'fisherman',
                 pool: [54,55,60,61,62,72,73,86,87,90,91,98,99,116,117,118,119,129,130],
                 gen2Pool: [170,171,183,184,186,194,222,223,224] },
  Scientist:   { name: 'Scientist',     sprite: 'scientist',
                 pool: [81,82,88,89,92,93,94,100,101,137],
                 gen2Pool: [81,82,201,233,239] },
  teamRocket:  { name: 'Rocket Grunt',  sprite: 'teamrocket',
                 pool: [19,20,23,24,41,42,52,53,88,89,109,110],
                 gen2Pool: [19,20,41,42,52,88,89,169,228,229] },
  policeman:   { name: 'Officer',       sprite: 'policeman',
                 pool: [58,59],
                 gen2Pool: [58,59,228,229] },
  fireSpitter: { name: 'Fire Trainer',  sprite: 'burglar',
                 pool: [4,5,6,37,38,58,59,77,78,126,136],
                 gen2Pool: [37,38,58,59,126,136,228,229,240] },
  aceTrainer:  { name: 'Ace Trainer',   sprite: 'acetrainer',
                 pool: null,
                 gen2Pool: [56,63,66,79,96,102,106,107,116,147,177,196,201,202,203,214,236,238] },
  oldGuy:      { name: 'Old Man',       sprite: 'gentleman',
                 pool: null,
                 gen2Pool: [16,21,41,84,128,161,163,198,209,225,227,234,241] },
};

async function doTrainerNode(node) {
  const key = node.trainerSprite || 'aceTrainer';
  const config = TRAINER_BATTLE_CONFIG[key] || TRAINER_BATTLE_CONFIG.aceTrainer;
  let teamSize;
  if (state.isEndlessMode) {
    const slot = (endlessState.regionNumber - 1) * 3 + endlessState.mapIndexInRegion;
    const bossSize = ENDLESS_TEAM_SIZES[slot] ?? 4;
    teamSize = Math.max(1, bossSize - 1);
  } else {
    teamSize = state.currentMap === 0 ? 1 : state.currentMap <= 2 ? 2 : 3;
  }
  // Gen 2: random trainers run below the node level — -1 from map 2, -2 from
  // map 3, -3 from map 5 onward. Gym leaders / Silver / Elite 4 unaffected.
  const trainerReduction = state.gen2Mode
    ? (state.currentMap >= 4 ? 3 : state.currentMap >= 2 ? 2 : state.currentMap >= 1 ? 1 : 0)
    : 0;
  const level = Math.max(1, getLevelForNode(node) - trainerReduction);
  const moveTier = getMoveТierForMap(state.currentMap);

  let speciesList;
  const activePool = (state.gen2Mode && config.gen2Pool) ? config.gen2Pool : config.pool;
  if (activePool) {
    // Dedupe pool, filter out evolved forms the battle level can't reach, then shuffle
    const eligible = [...new Set(activePool)]
      .filter(id => minLevelForSpecies(id) <= level);
    const raw = eligible.length ? eligible : [...new Set(activePool)]; // fallback: use full pool
    // Collapse evolution chains: at high level, e.g. Zubat/Golbat/Crobat all
    // resolve to Crobat, which would let a trainer roll 3 of the same mon.
    // Keep one pool entry per distinct evolved species.
    const seenEvolved = new Set();
    const pool = [];
    for (const id of raw) {
      const ev = resolveEvoForLevel(id, level);
      if (seenEvolved.has(ev)) continue;
      seenEvolved.add(ev);
      pool.push(id);
    }
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const ids = Array.from({ length: teamSize }, (_, i) => resolveEvoForLevel(shuffled[i % shuffled.length], level));
    const fetched = await Promise.all(ids.map(id => fetchPokemonById(id)));
    speciesList = fetched.filter(Boolean);
  } else {
    const rawChoices = await getCatchChoices(getEncounterMapIndex(), 3, getCatchGenRange().maxGenId, !state.isEndlessMode, getCatchGenRange().minGenId);
    speciesList = (await Promise.all(rawChoices.slice(0, teamSize).map(async sp => {
      const rawId = sp.id ?? sp.speciesId;
      const evoId = resolveEvoForLevel(rawId, level);
      return evoId !== rawId ? (await fetchPokemonById(evoId) || sp) : sp;
    }))).filter(Boolean);
  }

  if (!speciesList.length) { advanceFromNode(state.map, node.id); showMapScreen(); return; }
  const enemyTeam = speciesList.map(sp => createInstance(sp, level, false, moveTier));

  const titleEl = document.getElementById('battle-title');
  const subEl   = document.getElementById('battle-subtitle');
  if (titleEl) titleEl.textContent = `${config.name} wants to battle!`;
  if (subEl)   subEl.textContent   = `${enemyTeam.length} Pokémon — Lv ~${level}`;

  const won = await new Promise(resolve => {
    runBattleScreen(enemyTeam, false, () => resolve(true), () => resolve(false), config.sprite, [], 2, true);
  });
  if (!won) { showGameOver(); return; }
  if (state.isEndlessMode) await applyEndlessBugTrait();
  advanceFromNode(state.map, node.id);
  showMapScreen();
}

// ---- Legendary Node ----

async function doLegendaryNode(node) {
  const teamLegendIds = state.team.map(p => p.speciesId);
  const maxLegendId = state.isEndlessMode ? getEndlessMaxGenId(endlessState.stageNumber) : (state.gen2Mode ? 251 : 151);
  const minLegendId = state.gen2Mode ? 152 : 1;
  const available = LEGENDARY_IDS.filter(id => id >= minLegendId && id <= maxLegendId && !teamLegendIds.includes(id));
  if (available.length === 0) { advanceFromNode(state.map, node.id); showMapScreen(); return; }
  const legendId = available[Math.floor(rng() * available.length)];
  const species = await fetchPokemonById(legendId);
  if (!species) { advanceFromNode(state.map, node.id); showMapScreen(); return; }

  const level = state.isEndlessMode ? getLevelForNode(node) + 5 : (state.gen2Mode ? GEN2_MAP_LEVEL_RANGES : MAP_LEVEL_RANGES)[state.currentMap][1];
  const legendary = createInstance(species, level, rng() < (hasShinyCharm() ? 0.02 : 0.01), 2);

  const titleEl = document.getElementById('battle-title');
  const subEl = document.getElementById('battle-subtitle');
  if (titleEl) titleEl.textContent = `A legendary ${legendary.name} appeared!`;
  if (subEl) subEl.textContent = `Lv ${legendary.level} — Defeat it to add it to your team!`;

  await runBattleScreen([legendary], false, async () => {
    // Escape Rope was used — skip the capture flow but keep the run going.
    if (state._escapedViaRope) {
      state._escapedViaRope = false;
      advanceFromNode(state.map, node.id);
      showMapScreen();
      return;
    }
    // Win — offer to add legendary to team
    const normalUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${legendary.speciesId}.png`;
    markPokedexCaught(legendary.speciesId, legendary.name, legendary.types, normalUrl);
    if (legendary.isShiny) markShinyDexCaught(legendary.speciesId, legendary.name, legendary.types, legendary.spriteUrl);
    checkDexAchievements();
    showSwapScreen(legendary, node);
  }, () => {
    showGameOver();
  }, null, [], 0); // Legendary battles give 0 extra levels (already challenging enough)
}

// ---- Move Tutor Node ----

function doMoveTutorNode(node) {
  document.getElementById('item-equip-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'item-equip-modal';
  modal.className = 'item-equip-overlay';

  const rows = state.team.map((p, i) => {
    const tier = p.moveTier ?? 1;
    const maxed = tier >= 2;
    const currentMove = getBestMove(p.types || ['Normal'], p.baseStats, p.speciesId, tier, p.heldItem);
    const nextMove = !maxed ? getBestMove(p.types || ['Normal'], p.baseStats, p.speciesId, tier + 1, p.heldItem) : null;
    const tierLabel = ['Tier 1', 'Tier 2', 'Mastered'][tier];
    return `<div class="equip-pokemon-row" style="${maxed ? 'opacity:0.45;' : ''}">
      <img src="${p.spriteUrl}" class="equip-poke-sprite" onerror="this.style.display='none'">
      <div class="equip-poke-info">
        <div class="equip-poke-name">${p.nickname || p.name}</div>
        <div class="equip-poke-lv">Lv${p.level} &bull; ${currentMove.name} (${tierLabel})</div>
      </div>
      <div class="equip-btn-group">
        ${maxed
          ? `<span style="font-size:10px;color:#888;">Already mastered!</span>`
          : `<button class="equip-btn" data-tutor="${i}">→ ${nextMove.name}</button>`}
      </div>
    </div>`;
  }).join('');

  modal.innerHTML = `
    <div class="item-equip-box">
      <div class="equip-item-header">
        <span class="equip-item-icon" style="font-size:28px;">♪</span>
        <div>
          <div class="equip-item-name">Move Tutor</div>
          <div class="equip-item-desc">Teach one Pokémon a more powerful move.</div>
        </div>
      </div>
      <div class="equip-pokemon-list">${rows}</div>
      <button id="btn-skip-tutor" class="btn-secondary" style="width:100%;margin-top:8px;">Skip</button>
    </div>`;

  document.body.appendChild(modal);

  const finish = () => {
    modal.remove();
    advanceFromNode(state.map, node.id);
    showMapScreen();
  };

  modal.querySelectorAll('button[data-tutor]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.tutor);
      const pokemon = state.team[idx];
      pokemon.moveTier = Math.min(2, (pokemon.moveTier ?? 1) + 1);
      const newMove = getBestMove(pokemon.types || ['Normal'], pokemon.baseStats, pokemon.speciesId, pokemon.moveTier, pokemon.heldItem);
      modal.remove();
      advanceFromNode(state.map, node.id);
      showMapScreen();
      showMapNotification(`${pokemon.nickname || pokemon.name} learned ${newMove.name}!`);
    });
  });

  modal.querySelector('#btn-skip-tutor').addEventListener('click', finish);
}

// ---- Trade Node ----

async function doTradeNode(node) {
  showScreen('trade-screen');
  document.getElementById('trade-desc').textContent = "Trade one of your Pokémon for a random Pokémon 3 levels higher.";

  const listEl = document.getElementById('trade-team-list');
  listEl.innerHTML = '';

  for (let i = 0; i < state.team.length; i++) {
    const mine = state.team[i];
    const typeBadges = (mine.types || []).map(t =>
      `<span class="type-badge type-${t.toLowerCase()}">${t}</span>`
    ).join('');

    const li = document.createElement('li');
    li.className = 'trade-member-row';
    li.innerHTML = `
      <img class="trade-member-sprite" src="${mine.spriteUrl || ''}" alt="${mine.name}" loading="lazy">
      <div class="trade-member-info">
        <div class="trade-member-name">${mine.nickname || mine.name}</div>
        <div class="trade-member-level">Lv ${mine.level}</div>
        <div class="trade-member-types">${typeBadges}</div>
      </div>
      <div class="trade-member-arrow">→</div>
    `;

    const idx = i;
    const doTrade = async () => {
      let pool = await getCatchChoices(getEncounterMapIndex(), 3, getCatchGenRange().maxGenId, !state.isEndlessMode, getCatchGenRange().minGenId);
      // Never offer the same species back. The bucket has dozens of options,
      // so this filter essentially never empties; fall back if it somehow does.
      const filtered = pool.filter(sp => (sp.id ?? sp.speciesId) !== mine.speciesId);
      const choices = filtered.length > 0 ? filtered : pool;
      const species = choices[Math.floor(rng() * choices.length)];
      if (!species) { advanceFromNode(state.map, node.id); showMapScreen(); return; }
      const offerLevel = Math.min(100, mine.level + 3);
      const offer = createInstance(species, offerLevel, rng() < (hasShinyCharm() ? 0.02 : 0.01), Math.max(getMoveТierForMap(state.currentMap), mine.moveTier ?? 0));
      const released = state.team[idx];
      if (released.heldItem) state.items.push(released.heldItem);
      loadBuffsIntoPokemon(offer);
      state.team.splice(idx, 1, offer);
      const normalUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${offer.speciesId}.png`;
      markPokedexCaught(offer.speciesId, offer.name, offer.types, normalUrl);
      if (offer.isShiny) markShinyDexCaught(offer.speciesId, offer.name, offer.types, offer.spriteUrl);
      checkDexAchievements();
      advanceFromNode(state.map, node.id);

      // Show full-screen reveal
      showScreen('shiny-screen');
      document.getElementById('shiny-content').innerHTML = `
        <div class="shiny-title">You received ${offer.name}!</div>
        <div style="color:var(--text-dim);font-size:10px;margin-bottom:8px;">
          ${released.nickname || released.name} was sent to the trainer.</div>
        ${renderPokemonCard(offer, false, false, false)}
        <button id="btn-trade-continue" class="btn-primary" style="margin-top:12px;">Continue</button>
      `;
      document.getElementById('btn-trade-continue').onclick = () => showMapScreen();
    };

    li.addEventListener('click', doTrade);
    listEl.appendChild(li);
  }

  document.getElementById('btn-skip-trade').onclick = () => {
    advanceFromNode(state.map, node.id);
    showMapScreen();
  };
}

async function doShinyNode(node) {
  let choices = await getCatchChoices(getEncounterMapIndex(), 3, getCatchGenRange().maxGenId, !state.isEndlessMode, getCatchGenRange().minGenId);
  const level = getLevelForNode(node);
  const species = choices[0];
  if (!species) { advanceFromNode(state.map, node.id); showMapScreen(); return; }

  const shiny = createInstance(species, level, true, getMoveТierForMap(state.currentMap));
  loadBuffsIntoPokemon(shiny);

  const shinyCaught = !!(getShinyDex()[shiny.speciesId]);
  const shinyRoot = getEvoLineRoot(shiny.speciesId);
  const shinyStarterBadge = !shinyCaught && getHallOfFame().some(e => e.team?.some(p => getEvoLineRoot(p.speciesId) === shinyRoot));
  showScreen('shiny-screen');
  document.getElementById('shiny-content').innerHTML = `
    <div class="shiny-title">✨ A Shiny Pokemon appeared!</div>
    <div class="poke-choice-wrap">
      ${renderPokemonCard(shiny, false, false, shinyCaught, shinyStarterBadge)}
      ${renderTraitPreview(shiny, state.team)}
    </div>
    <button id="btn-take-shiny" class="btn-primary">Take ${shiny.name}!</button>
    <button id="btn-skip-shiny" class="btn-secondary" style="margin-top:6px;">Skip</button>
  `;
  document.getElementById('btn-take-shiny').onclick = () => {
    const normalUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${shiny.speciesId}.png`;
    markPokedexCaught(shiny.speciesId, shiny.name, shiny.types, normalUrl);
    markShinyDexCaught(shiny.speciesId, shiny.name, shiny.types, shiny.spriteUrl);
    checkDexAchievements();
    if (state.team.length < 6) {
      loadBuffsIntoPokemon(shiny);
      state.team.push(shiny);
      if (state.team.length > state.maxTeamSize) state.maxTeamSize = state.team.length;
      advanceFromNode(state.map, node.id);
      showMapScreen();
    } else {
      showSwapScreen(shiny, node);
    }
  };
  document.getElementById('btn-skip-shiny').onclick = () => {
    advanceFromNode(state.map, node.id);
    showMapScreen();
  };
}


// ---- Battle Screen ----

function runBattleScreen(enemyTeam, isBoss, onWin, onLose, enemyName = null, enemyItems = [], baseGainOverride = null, showPlayerPortrait = null, traitsConfig = null, forceAllParticipants = false) {
  // Clear stale Escape Rope flag from a previous battle.
  state._escapedViaRope = false;
  // In endless mode, always apply traits — compute them if not pre-computed by the caller
  if (state.isEndlessMode && traitsConfig === null) {
    const tiers = computeTraitTiers(state.team);
    traitsConfig = buildTraitsConfig(tiers, {});
    renderBattleTraitBars(tiers, null);
  }

  return new Promise(async resolve => {
    // Clean up trait bars when the battle resolves (works for both win and loss paths)
    const _origResolve = resolve;
    resolve = (val) => { if (state.isEndlessMode) clearBattleTraitBars(); _origResolve(val); };
    showScreen('battle-screen');
    const showPlayer = showPlayerPortrait !== null ? showPlayerPortrait : !!(isBoss || enemyName);
    renderTrainerIcons(state.trainer, enemyName || null, showPlayer);

    const pTeamCopy = state.team.map(p => ({ ...p }));
    // enemyTeam HP init (runBattle will deep-copy, but we need initial state for animation)
    const eTeamInit = enemyTeam.map(p => ({
      ...p,
      currentHp: p.currentHp !== undefined ? p.currentHp : calcHp(p.baseStats.hp, p.level),
      maxHp: p.maxHp !== undefined ? p.maxHp : calcHp(p.baseStats.hp, p.level),
    }));

    renderBattleField(pTeamCopy, eTeamInit);

    // Pre-compute the full battle result
    const { playerWon, detailedLog, pTeam: resultP, eTeam: resultE, playerParticipants } = runBattle(
      pTeamCopy, enemyTeam, state.items, enemyItems, null, traitsConfig
    );

    // Read auto-skip settings
    const settings = getSettings();
    const autoSkip = settings.autoSkipAllBattles || (!isBoss && settings.autoSkipBattles);

    // Set up Skip button
    const skipBtn = document.getElementById('btn-auto-battle');
    skipBtn.disabled = false;
    skipBtn.textContent = 'Skip';
    battleSpeedMultiplier = autoSkip ? SKIP_SPEED : 1;
    skipBtn.style.display = autoSkip ? 'none' : 'block';
    let manuallySkipped = false;
    if (!autoSkip) {
      skipBtn.onclick = () => { battleSpeedMultiplier = SKIP_SPEED; skipBtn.disabled = true; manuallySkipped = true; };
    }

    const continueEl = document.getElementById('btn-continue-battle');
    continueEl.style.display = 'none';
    continueEl.textContent = 'Continue';
    continueEl.disabled = false;

    // Auto-speed-up after 30s if the player hasn't already skipped
    const autoSpeedTimer = setTimeout(() => {
      if (battleSpeedMultiplier < OVERTIME_SPEED) battleSpeedMultiplier = OVERTIME_SPEED;
    }, 30_000);

    // Auto-start visual animation
    await animateBattleVisually(detailedLog, pTeamCopy, eTeamInit);
    clearTimeout(autoSpeedTimer);
    document.getElementById('overtime-banner')?.remove();

    // Show final HP state after animation
    renderBattleField(resultP, resultE);

    if (playerWon) {
      // Sync battle-result HP onto state team, then apply level gains
      for (let i = 0; i < state.team.length; i++) {
        if (resultP[i]) state.team[i].currentHp = resultP[i].currentHp;
      }
      const maxEnemyLevel = Math.max(...resultE.map(p => p.level));
      const effectiveParticipants = forceAllParticipants
        ? new Set(state.team.map((_, i) => i))
        : playerParticipants;
      const levelUps = applyLevelGain(state.team, state.nuzlockeMode ? [] : state.items, effectiveParticipants, maxEnemyLevel, state.nuzlockeMode, baseGainOverride, state.isEndlessMode ? Infinity : 100);
      const skipAll = autoSkip || manuallySkipped;
      battleSpeedMultiplier = skipAll ? SKIP_SPEED : 1;
      skipBtn.textContent = 'Skip';
      skipBtn.style.display = skipAll ? 'none' : 'block';
      if (!skipAll) {
        skipBtn.disabled = false;
        skipBtn.onclick = () => { battleSpeedMultiplier = SKIP_SPEED; skipBtn.disabled = true; manuallySkipped = true; };
      }

      const continueBtn = document.getElementById('btn-continue-battle');
      if (!skipAll) {
        continueBtn.style.display = 'block';
        continueBtn.onclick = () => { battleSpeedMultiplier = 1000; manuallySkipped = true; continueBtn.disabled = true; };
      }

      await animateLevelUp(levelUps);
      skipBtn.style.display = 'none';
      await checkAndEvolveTeam();

      // Nuzlocke: remove fainted Pokemon permanently, return their items to bag
      if (state.nuzlockeMode) {
        const fainted = state.team.filter(p => p.currentHp <= 0);
        for (const p of fainted) {
          if (p.heldItem) state.items.push(p.heldItem);
        }
        state.team = state.team.filter(p => p.currentHp > 0);
        if (fainted.length > 0) { renderTeamBar(state.team); renderItemBadges(state.items); }
        if (state.team.length === 0) {
          showGameOver();
          resolve(false);
          return;
        }
      }

      if (skipAll || manuallySkipped) {
        if (onWin) onWin();
        resolve(true);
      } else {
        continueBtn.disabled = false;
        continueBtn.onclick = () => { if (onWin) onWin(); resolve(true); };
      }
    } else {
      skipBtn.style.display = 'none';
      const continueBtnEl = document.getElementById('btn-continue-battle');
      continueBtnEl.style.display = 'block';
      continueBtnEl.textContent = 'Continue...';

      // Escape Rope: on non-boss loss, offer to consume a rope and revive the
      // last fainted slot at 1 HP instead of game-over.
      const ropeIdx = (!isBoss && !state.isEndlessMode)
        ? state.items.findIndex(it => it.id === 'escape_rope')
        : -1;
      if (ropeIdx !== -1) {
        const ropeBtn = document.createElement('button');
        ropeBtn.className = 'btn-primary';
        ropeBtn.textContent = '🪢 Use Escape Rope';
        ropeBtn.style.cssText = 'margin-left:8px;';
        ropeBtn.onclick = () => {
          state.items.splice(ropeIdx, 1);
          // Whole team fainted; revive only the last slot at 1 HP.
          for (const p of state.team) p.currentHp = 0;
          const lastIdx = state.team.length - 1;
          if (state.team[lastIdx]) state.team[lastIdx].currentHp = 1;
          renderTeamBar(state.team);
          renderItemBadges(state.items);
          state._escapedViaRope = true;
          ropeBtn.remove();
          continueBtnEl.textContent = 'Continue';
          continueBtnEl.onclick = () => { if (onWin) onWin(); resolve(true); };
        };
        continueBtnEl.parentElement?.insertBefore(ropeBtn, continueBtnEl.nextSibling);
      }

      continueBtnEl.onclick = () => {
        if (onLose) onLose();
        resolve(false);
      };
    }
  });
}

// ---- End Screens ----

function showBadgeScreen(leader) {
  showScreen('badge-screen');
  document.getElementById('badge-msg').textContent = `You earned the ${leader.badge}!`;
  document.getElementById('badge-leader').textContent = '';
  document.getElementById('badge-count-display').textContent = `Badges: ${state.badges}/8`;
  const badgeImg = document.getElementById('badge-icon-img');
  if (badgeImg) {
    if (state.gen2Mode) {
      // Johto sprites are at indices 9-16
      badgeImg.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/badges/${state.badges + 8}.png`;
    } else {
      badgeImg.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/badges/${state.badges}.png`;
    }
  }

  const nextBtn = document.getElementById('btn-next-map');
  // Spacebar shortcut while the badge screen is visible
  const onKey = (e) => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    if (!document.getElementById('badge-screen')?.classList.contains('active')) return;
    e.preventDefault();
    advance();
  };
  const advance = () => {
    document.removeEventListener('keydown', onKey);
    if (state.currentMap >= 7) {
      state.eliteIndex = 0;
      startMap(8);
    } else {
      startMap(state.currentMap + 1);
    }
  };
  nextBtn.onclick = advance;
  document.addEventListener('keydown', onKey);
}

async function showGameOver() {
  localStorage.setItem('poke_win_streak', '0');
  clearSavedRun();
  if (typeof syncToCloud === 'function') {
    await Promise.race([syncToCloud(), new Promise(r => setTimeout(r, 3000))]);
  }
  initGame();
}

function showWinScreen() {
  showScreen('win-screen');
  document.getElementById('win-team').innerHTML = state.team.map(p => {
    const itemHtml = p.heldItem
      ? `<div style="display:flex;align-items:center;gap:4px;font-size:8px;color:var(--text-dim);margin-top:4px;">${itemIconHtml(p.heldItem, 14)}<span>${p.heldItem.name}</span></div>`
      : '';
    return `<div style="display:flex;flex-direction:column;align-items:center;">${renderPokemonCard(p, false, false)}${itemHtml}</div>`;
  }).join('');
  document.getElementById('btn-play-again').onclick = () => startNewRun(state.nuzlockeMode, state.gen2Mode);

  // Track elite four wins
  const wins = incrementEliteWins();
  saveHallOfFameEntry(state.team, wins, state.nuzlockeMode, false, null, state.starterSpeciesId);
  const winsEl = document.getElementById('win-run-count');
  if (winsEl) winsEl.textContent = `Championship #${wins}`;
  if (wins === 10) {
    const ach = unlockAchievement('elite_10');
    if (ach) setTimeout(() => showAchievementToast(ach), 3000);
  }
  if (wins === 100) {
    const ach = unlockAchievement('elite_100');
    if (ach) setTimeout(() => showAchievementToast(ach), 3000);
  }

  // Starter line achievement
  const sid = state.starterSpeciesId;
  const starterAchId = [1,2,3].includes(sid) ? 'starter_1'
    : [4,5,6].includes(sid) ? 'starter_4'
    : [7,8,9].includes(sid) ? 'starter_7' : null;
  if (starterAchId) {
    const ach = unlockAchievement(starterAchId);
    if (ach) setTimeout(() => showAchievementToast(ach), 600);
  }

  // Solo run achievement
  if (state.maxTeamSize === 1) {
    const ach = unlockAchievement('solo_run');
    if (ach) setTimeout(() => showAchievementToast(ach), 1400);
  }

  // Hard mode win achievement
  if (state.nuzlockeMode) {
    const ach = unlockAchievement('nuzlocke_win');
    if (ach) setTimeout(() => showAchievementToast(ach), 2200);
  }

  // All 3 legendary birds on team
  const birdIds = [144, 145, 146];
  if (birdIds.every(id => state.team.some(p => p.speciesId === id))) {
    const ach = unlockAchievement('three_birds');
    if (ach) setTimeout(() => showAchievementToast(ach), 800);
  }

  // No Pokémon Center used
  if (!state.usedPokecenter) {
    const ach = unlockAchievement('no_pokecenter');
    if (ach) setTimeout(() => showAchievementToast(ach), 1000);
  }

  // No items picked up
  if (!state.pickedUpItem) {
    const ach = unlockAchievement('no_items');
    if (ach) setTimeout(() => showAchievementToast(ach), 1200);
  }

  // 4 of 6 Pokémon share a type
  if (state.team.length === 6) {
    const typeCounts = {};
    for (const p of state.team) {
      for (const t of p.types) {
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      }
    }
    if (Object.values(typeCounts).some(c => c >= 4)) {
      const ach = unlockAchievement('type_quartet');
      if (ach) setTimeout(() => showAchievementToast(ach), 1600);
    }
  }

  // Full team of shinies
  if (state.team.length >= 3 && state.team.every(p => p.isShiny)) {
    const ach = unlockAchievement('all_shiny_win');
    if (ach) setTimeout(() => showAchievementToast(ach), 2000);
  }

  // Consecutive win streak
  const streak = (parseInt(localStorage.getItem('poke_win_streak') || '0', 10)) + 1;
  localStorage.setItem('poke_win_streak', String(streak));
  if (streak >= 2) {
    const ach = unlockAchievement('back_to_back');
    if (ach) setTimeout(() => showAchievementToast(ach), 2400);
  }
  if (streak >= 3) {
    const ach = unlockAchievement('back_3_back');
    if (ach) setTimeout(() => showAchievementToast(ach), 2800);
  }

  clearSavedRun();
  if (typeof syncToCloud === 'function') syncToCloud();
}

function shareEndlessRun(stageNum, team) {
  const stageName = typeof getStageName === 'function' ? getStageName(stageNum) : `Stage ${stageNum}`;
  const teamLines = team.map(p => {
    const shiny = p.isShiny ? ' ✨' : '';
    return `${p.nickname || p.name} Lv.${p.level}${shiny}`;
  }).join('\n');
  const text = `🏆 Cleared ${stageName} in Pokelike Battle Tower!\n\nMy team:\n${teamLines}\n\n${window.location.href}`;

  if (navigator.share) {
    navigator.share({ title: 'Pokelike', text }).catch(() => {});
  } else {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }
}

function shareRun() {
  const wins = getEliteWins();
  const teamLines = state.team.map(p => {
    const shiny = p.isShiny ? ' ✨' : '';
    return `${p.nickname || p.name} Lv.${p.level}${shiny}`;
  }).join('\n');
  const modeTag = state.nuzlockeMode ? ' (Nuzlocke)' : '';
  const text = `🏆 Championship #${wins}${modeTag} on Pokelike!\n\nMy team:\n${teamLines}\n\n${window.location.href}`;

  if (navigator.share) {
    navigator.share({ title: 'Pokelike', text }).catch(() => {});
  } else {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }
}

// ── Endless Mode ─────────────────────────────────────────────────────────────

function getUnlockedStageCount() {
  const hof = getHallOfFame();
  const maxCompleted = hof
    .filter(e => e.endless && e.stageNumber)
    .reduce((max, e) => Math.max(max, e.stageNumber), 0);
  return Math.max(1, maxCompleted + 1);
}

function unlockNextStage(_completedStage) {
  // Unlock is now derived from Hall of Fame entries — no localStorage needed.
}

const MAX_ACCESSIBLE_STAGE = 5;

const STAGE_META = [
  null,
  { label: 'Kanto',  gens: 'Gen 1',   color: '#e8503a' },
  { label: 'Johto',  gens: 'Gen 1-2', color: '#c0a050' },
  { label: 'Hoenn',  gens: 'Gen 1-3', color: '#60a878' },
  { label: 'Sinnoh', gens: 'Gen 1-4', color: '#7878c8' },
  { label: 'Unova',  gens: 'Gen 1-5', color: '#808080' },
];

const STAGE_REGION_BG = [
  null,
  'ui/regions/HGSS_Kanto.jpg',
  'ui/regions/Johtoart.jpg',
  'ui/regions/ORAS_Hoenn_Map.jpg',
  'ui/regions/Pt_Artwork_Sinnoh-Karte_(mit_Zerrwelt).jpg',
  'ui/regions/Einall_S2W2.png',
];

function getStageName(n) { return STAGE_META[n]?.label || `Stage ${n}`; }

// Starter Pokémon for each endless stage (base forms)
const REGION_STARTERS = [
  null,
  [1,   4,   7],   // Kanto
  [152, 155, 158], // Johto
  [252, 255, 258], // Hoenn
  [387, 390, 393], // Sinnoh
  [495, 498, 501], // Unova
];

function showEndlessStageSelect() {
  const unlocked = Math.min(getUnlockedStageCount(), MAX_ACCESSIBLE_STAGE);
  const list = document.getElementById('stage-select-list');
  if (!list) return;
  list.innerHTML = '';
  const maxShow = Math.min(unlocked + 1, MAX_ACCESSIBLE_STAGE); // one locked preview, but never beyond the last defined stage
  for (let s = 1; s <= maxShow; s++) {
    const isLocked = s > unlocked;
    const meta = STAGE_META[Math.min(s, 5)];
    const btn = document.createElement('button');
    btn.className = isLocked ? 'btn-secondary' : 'btn-primary';
    const borderColor = (!isLocked && meta) ? meta.color : '';
    const bg = STAGE_REGION_BG[s];
    const bgStyle = bg
      ? `background-image:url('${bg}');background-size:cover;background-position:center;`
      : `background:linear-gradient(135deg,#1a0a3e,#3a0a6e);`;
    btn.style.cssText = `width:200px;${isLocked ? `opacity:0.45;cursor:not-allowed;${bgStyle}` : `${bgStyle}${borderColor ? `border-color:${borderColor};box-shadow:0 0 6px ${borderColor}55;` : ''}`}`;
    if (isLocked) {
      btn.innerHTML = `<div style="background:rgba(0,0,0,0.55);padding:4px 8px;border-radius:4px;color:#fff;">🔒 ${getStageName(s)}</div>`;
    } else if (meta) {
      btn.innerHTML = `<div style="background:rgba(0,0,0,0.5);padding:4px 8px;border-radius:4px;color:#fff;"><div>▶ ${meta.label}</div><div style="font-size:5px;opacity:0.85;margin-top:2px;">${meta.gens}</div></div>`;
    } else {
      btn.innerHTML = `<div style="background:rgba(0,0,0,0.5);padding:4px 8px;border-radius:4px;color:#fff;"><div>▶ ${getStageName(s)}</div><div style="font-size:5px;opacity:0.85;margin-top:2px;">All Gens</div></div>`;
    }
    if (!isLocked) btn.addEventListener('click', () => startEndlessRun(s));
    list.appendChild(btn);
  }
  showScreen('endless-stage-select');
}

async function startEndlessRun(stageNum = 1) {
  clearSavedRun();
  const seed = (Date.now() ^ (Math.random() * 0x100000000 | 0)) >>> 0;
  seedRng(seed);
  const savedTrainer = localStorage.getItem('poke_trainer') || 'boy';
  state = {
    currentMap: 0, currentNode: null, team: [], items: [], badges: 0,
    map: null, eliteIndex: 0, trainer: savedTrainer, starterSpeciesId: null,
    maxTeamSize: 1, nuzlockeMode: false, usedPokecenter: false, pickedUpItem: false,
    runSeed: seed, isEndlessMode: true,
  };
  endlessState = {
    active: true, stageNumber: stageNum, regionNumber: 1, mapIndexInRegion: 0,
    currentRegion: null, traitTiers: {},
  };
  clearEndlessState();
  if (!localStorage.getItem('poke_trainer')) {
    await showTrainerSelect();
  } else {
    await showStarterSelect();
  }
}

async function continueEndlessRun() {
  try {
    if (!loadRun()) return;
    if (!loadEndlessState()) return;
    if (!endlessState.active) { initGame(); return; }
    if (!state.map) {
      const isFirstMap = endlessState.regionNumber === 1 && endlessState.mapIndexInRegion === 0;
      const fakeMapIndex = isFirstMap ? 2 : Math.min(7, endlessState.stageNumber + endlessState.regionNumber);
      state.map = generateMap(fakeMapIndex, false);
    }
    if (endlessState.currentRegion) {
      if (state.currentNode && !state.currentNode.visited) {
        await onEndlessNodeClick(state.currentNode);
      } else {
        showEndlessMapScreen();
      }
    } else {
      startEndlessRegion();
    }
  } catch (e) {
    console.error('continueEndlessRun failed:', e);
    initGame();
  }
}

async function startEndlessRegion() {
  if (!endlessState._preRolled) {
    endlessState.currentRegion = rollRegion(endlessState.stageNumber, endlessState.regionNumber);
  }
  endlessState._preRolled = false;
  endlessState.mapIndexInRegion = 0;
  saveEndlessState();

  startEndlessMap();
}

function startEndlessMap() {
  // Full heal at the start of every map in endless mode
  for (const p of state.team) p.currentHp = p.maxHp;

  // R1M1 always uses fakeMapIndex 2 so move tier and layout stay identical to stage 1.
  // Other maps scale with stage+region as before.
  const isFirstMap = endlessState.regionNumber === 1 && endlessState.mapIndexInRegion === 0;
  const fakeMapIndex = isFirstMap ? 2 : Math.min(7, endlessState.stageNumber + endlessState.regionNumber);
  state.currentMap = fakeMapIndex;
  state.map = generateMap(fakeMapIndex, false);
  state.endlessLevelRange = getEndlessLevelRange(endlessState.stageNumber, endlessState.regionNumber, endlessState.mapIndexInRegion);

  // Pick map background based on trainer type; finalBoss for stage final boss
  const _btTrainer    = endlessState.currentRegion?.trainers[endlessState.mapIndexInRegion];
  const _btType       = (_btTrainer?.archetype?.type || '').split('/')[0].toLowerCase() || 'normal';
  const _isFinalBoss  = endlessState.mapIndexInRegion === 2 && endlessState.regionNumber === 3;
  endlessState.currentMapBg = _isFinalBoss
    ? 'ui/mapsBattleTower/finalBoss.png'
    : `ui/mapsBattleTower/${_btType}.png`;

  saveEndlessState();
  saveRun();
  showEndlessMapScreen();
}

function showEndlessMapScreen() {
  showScreen('map-screen');
  const region = endlessState.currentRegion;
  const mapNum = endlessState.mapIndexInRegion + 1;
  const isBoss = endlessState.mapIndexInRegion === 2;
  const isFinalBoss = isBoss && endlessState.regionNumber === 3;
  const trainerName = region.trainers[endlessState.mapIndexInRegion]?.archetype?.name || '???';

  const mapInfo = document.getElementById('map-info');
  if (mapInfo) {
    const label = isFinalBoss ? 'STAGE FINAL BOSS' : isBoss ? 'BIG BOSS' : `Map ${mapNum}/2`;
    mapInfo.innerHTML = `<span style="font-size:9px">${getStageName(endlessState.stageNumber)} R${endlessState.regionNumber} — ${label}: <b>${trainerName}</b></span>`;
  }

  const badgeCountEl = document.getElementById('badge-count');
  if (badgeCountEl) badgeCountEl.innerHTML = '';
  const badgePanelEndless = document.getElementById('badge-count-panel');
  if (badgePanelEndless) badgePanelEndless.innerHTML = '';
  document.querySelectorAll('.map-badges-label').forEach(el => el.style.display = 'none');

  renderTeamBar(state.team);
  renderItemBadges(state.items);
  renderEndlessTraitPanel(state.team);
  renderEndlessRegionPanel(endlessState.currentRegion, endlessState.mapIndexInRegion);

  const mapContainer = document.getElementById('map-container');
  const bg = endlessState.currentMapBg || 'ui/mapsNormalMode/map1.png';
  mapContainer.style.backgroundImage = `url('${bg}')`;
  renderMap(state.map, mapContainer, onEndlessNodeClick);
}

async function onEndlessNodeClick(node) {
  if (!node.accessible) return;
  state.currentNode = node;
  // Lock sibling nodes before saving so F5 can't switch to a different path choice
  for (const n of Object.values(state.map.nodes)) {
    if (n.layer === node.layer && n.id !== node.id && n.accessible) {
      n.accessible = false;
    }
  }
  if (node.type === NODE_TYPES.BOSS) {
    saveRun();
    saveEndlessState();
    await doEndlessBossNode();
    return;
  }
  // Non-boss nodes use the standard handler. showMapScreen() auto-delegates to showEndlessMapScreen().
  await onNodeClick(node);
}

async function applyEndlessBugTrait() {
  endlessState.traitTiers = computeTraitTiers(state.team);
  const bugBonus = getBugLevelBonus(endlessState.traitTiers);
  if (bugBonus <= 0) return;
  const leveled = [];
  for (const p of state.team) {
    if (p.currentHp > 0) {
      const oldLevel = p.level;
      p.level = p.level + bugBonus;
      const hpBuff = p.statBuffs?.hp ?? 0;
      const buffMult = 1 + 0.1 * hpBuff;
      p.maxHp = Math.floor(calcHp(p.baseStats.hp, p.level) * buffMult);
      p.currentHp = Math.min(p.currentHp + (p.maxHp - Math.floor(calcHp(p.baseStats.hp, oldLevel) * buffMult)), p.maxHp);
      leveled.push({ name: p.nickname || p.name, spriteUrl: p.spriteUrl, level: p.level });
    }
  }
  const { autoSkipAllBattles, autoSkipBattles } = getSettings();
  const skipFast = autoSkipAllBattles || autoSkipBattles;
  if (leveled.length) showBugLevelUpBanner(leveled, skipFast ? 250 : 1500);
  await new Promise(r => setTimeout(r, skipFast ? 400 : 1600));
  await checkAndEvolveTeam();
}

async function doEndlessBossNode() {
  const region = endlessState.currentRegion;
  const trainerData = region.trainers[endlessState.mapIndexInRegion];
  const isBigBoss = endlessState.mapIndexInRegion === 2;

  // Fetch all species — use fetchIds when available (supports form slugs like 'deoxys-attack')
  const fetchIds = trainerData.fetchIds || trainerData.speciesIds;
  const speciesArr = await Promise.all(fetchIds.map(id => fetchPokemonById(id)));
  const enemyTeam = speciesArr
    .map((sp, i) => ({ sp, i }))
    .filter(({ sp }) => sp != null)
    .map(({ sp, i }) => {
      const offset = trainerData.levelOffsets ? (trainerData.levelOffsets[i] ?? i) : i;
      return createInstance(sp, trainerData.level + offset, false, Math.min(2, trainerData.moveTier));
    });

  if (enemyTeam.length === 0) {
    // Fallback if fetching fails
    advanceEndless();
    return;
  }

  // Compute traits right before the fight (enemy bosses also get type trait benefits)
  endlessState.traitTiers = computeTraitTiers(state.team);
  const enemyTiers = trainerData.allTraits != null
    ? Object.fromEntries(Object.keys(TRAIT_DESCRIPTIONS).map(t => [t, trainerData.allTraits]))
    : trainerData.specificTraits
      ? trainerData.specificTraits
      : trainerData.copyPlayerTraits
        ? computeMirroredTraits(endlessState.traitTiers, computeTraitTiers(enemyTeam, 0))
        : computeTraitTiers(enemyTeam, trainerData.traitBonus ?? 0);
  const traitsConfig = buildTraitsConfig(endlessState.traitTiers, enemyTiers);
  renderBattleTraitBars(endlessState.traitTiers, enemyTiers);

  const isStageFinal = isBigBoss && endlessState.regionNumber === 3;
  const title = isStageFinal
    ? `${getStageName(endlessState.stageNumber)} Final Boss: ${trainerData.archetype.name}!`
    : isBigBoss ? `Big Boss: ${trainerData.archetype.name}!`
    : `Trainer: ${trainerData.archetype.name}!`;
  const battleInfoEl = document.getElementById('battle-title');
  if (battleInfoEl) battleInfoEl.textContent = title;
  const battleSubEl = document.getElementById('battle-subtitle');
  if (battleSubEl) battleSubEl.textContent = '';
  const enemySideLabel = document.getElementById('enemy-side-label');
  if (enemySideLabel) enemySideLabel.textContent = trainerData.archetype.name;

  const won = await runBattleScreen(
    enemyTeam, true, null, null,
    trainerData.archetype.sprite,
    [],
    null, // baseGainOverride — use default level gain
    true, // showPlayerPortrait
    traitsConfig
  );
  // clearTraitBar() is handled automatically by runBattleScreen in endless mode

  if (!won) {
    clearEndlessState();
    clearSavedRun();
    showGameOver();
    return;
  }

  await applyEndlessBugTrait();

  if (isBigBoss) await showStatBuffScreen();

  advanceEndless();
}

async function showStatBuffScreen() {
  return new Promise(resolve => {
    const titleEl  = document.getElementById('stat-buff-title');
    const subEl    = document.getElementById('stat-buff-subtitle');
    const choicesEl = document.getElementById('stat-buff-choices');

    const STATS = [
      ['hp',      'HP',  'stat-hp'],
      ['atk',     'ATK', 'stat-atk'],
      ['def',     'DEF', 'stat-def'],
      ['speed',   'Spe', 'stat-spe'],
      ['special', 'SP.A', 'stat-spa'],
      ['spdef',   'SP.D', 'stat-spd'],
    ];

    function showPhase1() {
      showScreen('stat-buff-screen');
      titleEl.textContent = 'Region Cleared!';
      const maxPts = getMaxBuffPoints();
      subEl.textContent = maxPts > 0 ? `Choose a Pokémon to power up (cap: ${maxPts} pts)` : 'Beat a stage to unlock buffs';
      choicesEl.innerHTML = '';
      for (const p of state.team) {
        const totalPts = getTotalBuffPoints(p.statBuffs || {});
        const capped = totalPts >= maxPts;
        const wrap = document.createElement('div');
        wrap.className = 'stat-buff-poke-wrap';
        wrap.innerHTML = renderPokemonCard(p, false, false);
        const label = document.createElement('div');
        label.style.cssText = 'font-size:8px;text-align:center;margin-top:2px;color:' + (capped ? '#888' : '#c8a0ff') + ';';
        label.textContent = maxPts > 0 ? `${totalPts}/${maxPts} pts` : '—';
        wrap.appendChild(label);
        const card = wrap.querySelector('.poke-card');
        if (capped || maxPts === 0) {
          card.style.opacity = '0.45';
          card.style.cursor = 'default';
        } else {
          card.style.cursor = 'pointer';
          card.addEventListener('click', () => showPhase2(p));
        }
        choicesEl.appendChild(wrap);
      }

      const skip = document.createElement('button');
      skip.className = 'btn-secondary';
      skip.style.cssText = 'margin-top:12px;width:100%;';
      skip.textContent = 'Skip';
      skip.addEventListener('click', () => resolve());
      choicesEl.appendChild(skip);
    }

    function showPhase2(pokemon) {
      titleEl.textContent = pokemon.nickname || pokemon.name;
      const maxPts = getMaxBuffPoints();
      const totalPts = getTotalBuffPoints(pokemon.statBuffs || {});
      const atCap = totalPts >= maxPts;
      subEl.textContent = atCap
        ? `Fully buffed (${totalPts}/${maxPts} pts)`
        : `Choose a stat to boost (+10%) — ${totalPts}/${maxPts} pts used`;
      choicesEl.innerHTML = '';

      const isSpecialAttacker = (pokemon.baseStats?.special ?? 0) >= (pokemon.baseStats?.atk ?? 0);
      const hiddenAttackStat = isSpecialAttacker ? 'atk' : 'special';

      for (const [key, lbl, cls] of STATS) {
        if (key === hiddenAttackStat) continue;
        if (!pokemon.statBuffs) pokemon.statBuffs = {};
        const buffCount = pokemon.statBuffs[key] ?? 0;
        const maxed = buffCount >= 10 || atCap;
        const rawVal = key === 'spdef'
          ? (pokemon.baseStats?.spdef ?? pokemon.baseStats?.special ?? 0)
          : (pokemon.baseStats?.[key] ?? 0);
        const grayPct = Math.round((rawVal / 255) * 100);
        const bluePct = Math.round((buffCount / 10) * grayPct);

        const row = document.createElement('div');
        row.className = `stat-buff-row${maxed ? ' maxed' : ''}`;
        row.innerHTML = `
          <span class="stat-buff-lbl">${lbl}</span>
          <div class="stat-buff-bar-wrap">
            <div class="stat-bar-bg">
              <div class="stat-bar-fill ${cls}" style="width:${grayPct}%"></div>
              ${buffCount > 0 ? `<div class="stat-buff-overlay" style="width:${bluePct}%"></div>` : ''}
            </div>
          </div>
          <span class="stat-buff-count">${buffCount}/10</span>
        `;
        if (!maxed) {
          row.addEventListener('click', () => {
            applyStatBuff(pokemon, key);
            checkMaxStatAchievements(pokemon);
            resolve();
          });
        }
        choicesEl.appendChild(row);
      }

      const back = document.createElement('button');
      back.className = 'btn-secondary';
      back.style.cssText = 'margin-top:12px;width:100%;';
      back.textContent = '← Back';
      back.addEventListener('click', showPhase1);
      choicesEl.appendChild(back);
    }

    showPhase1();
  });
}

function loadPersistentBuffs() {
  try {
    const store = JSON.parse(localStorage.getItem('poke_stat_buffs') || '{}');
    // Migrate old evo-line root IDs whenever a baby-form pre-evolution is added
    const migrations = [
      [143, 446],  // Snorlax   → Munchlax
      [122, 439],  // Mr. Mime  → Mime Jr.
      [113, 440],  // Chansey   → Happiny
      [185, 438],  // Sudowoodo → Bonsly
      [226, 458],  // Mantine   → Mantyke
      [315, 406],  // Roselia   → Budew
      [416, 415],  // Vespiquen → Combee
      [424, 190],  // Ambipom   → Aipom
      [414, 412],  // Mothim    → Burmy
      [413, 412],  // Wormadam  → Burmy
    ];
    let dirty = false;
    for (const [oldKey, newKey] of migrations) {
      if (store[oldKey] !== undefined && store[newKey] === undefined) {
        store[newKey] = store[oldKey];
        delete store[oldKey];
        dirty = true;
      }
    }
    if (dirty) savePersistentBuffs(store);
    return store;
  } catch { return {}; }
}
function savePersistentBuffs(store) {
  try { localStorage.setItem('poke_stat_buffs', JSON.stringify(store)); } catch {}
}

function getMaxBuffPoints() {
  return Math.min((endlessState?.stageNumber ?? 1) * 10, 50);
}

function getTotalBuffPoints(buffs) {
  // atk and special always mirror each other, so count only the higher of the two
  const atkPts = Math.max(buffs.atk ?? 0, buffs.special ?? 0);
  return atkPts + (buffs.hp ?? 0) + (buffs.def ?? 0) + (buffs.speed ?? 0) + (buffs.spdef ?? 0);
}

// Returns the base-form species ID for any member of an evolution line.
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

function loadBuffsIntoPokemon(p) {
  if (!state.isEndlessMode) return;
  const store = loadPersistentBuffs();
  const buffs = store[getEvoLineRoot(p.speciesId)];
  if (!buffs) return;
  p.statBuffs = { ...buffs };
  const hpBuff = buffs.hp ?? 0;
  if (hpBuff > 0) {
    const buffedMaxHp = Math.floor(calcHp(p.baseStats.hp, p.level) * (1 + 0.1 * hpBuff));
    const diff = buffedMaxHp - p.maxHp;
    p.maxHp = buffedMaxHp;
    p.currentHp = Math.min(p.currentHp + diff, p.maxHp);
  }
}

function checkMaxStatAchievements(pokemon) {
  const BUFF_KEYS = ['hp', 'atk', 'def', 'speed', 'special', 'spdef'];
  const maxedCount = BUFF_KEYS.filter(k => (pokemon.statBuffs?.[k] ?? 0) >= 10).length;
  for (const threshold of [1, 2, 3, 4]) {
    if (maxedCount >= threshold) {
      const ach = unlockAchievement(`max_stats_${threshold}`);
      if (ach) showAchievementToast(ach);
    }
  }
  if (maxedCount >= 5) {
    const ach = unlockAchievement('max_stats_all');
    if (ach) showAchievementToast(ach);
  }
}

function applyStatBuff(pokemon, statKey) {
  if (!pokemon.statBuffs) pokemon.statBuffs = {};
  pokemon.statBuffs[statKey] = Math.min(10, (pokemon.statBuffs[statKey] ?? 0) + 1);
  // Mirror attack buffs so physical/special evolution switches don't lose progress
  if (statKey === 'atk')     pokemon.statBuffs.special = Math.min(10, (pokemon.statBuffs.special ?? 0) + 1);
  if (statKey === 'special') pokemon.statBuffs.atk     = Math.min(10, (pokemon.statBuffs.atk     ?? 0) + 1);
  if (statKey === 'hp') {
    const hpGain = Math.floor(calcHp(pokemon.baseStats.hp, pokemon.level) * 0.1);
    pokemon.maxHp += hpGain;
    pokemon.currentHp = Math.min(pokemon.currentHp + hpGain, pokemon.maxHp);
  }
  // Persist buffs by evo line root so they apply to the whole evolution line
  const store = loadPersistentBuffs();
  store[getEvoLineRoot(pokemon.speciesId)] = { ...pokemon.statBuffs };
  savePersistentBuffs(store);
  saveRun();
  saveEndlessState();
  if (typeof syncToCloud === 'function') syncToCloud();
}

function advanceEndless() {
  endlessState.mapIndexInRegion++;
  saveEndlessState();

  if (endlessState.mapIndexInRegion >= 3) {
    endlessState.regionNumber++;
    if (endlessState.regionNumber > 3) {
      // All 3 regions cleared — the stage final boss was the last big boss, so go to next stage
      const completedStage = endlessState.stageNumber;
      saveHallOfFameEntry(state.team, completedStage, false, true, completedStage, state.starterSpeciesId);
      unlockNextStage(completedStage);
      [1, 2, 3, 4, 5].forEach(threshold => {
        if (completedStage === threshold) {
          const ach = unlockAchievement(`endless_stage_${threshold}`);
          if (ach) showAchievementToast(ach);
        }
      });
      checkStarterCollectionAchievements();
      clearEndlessState();
      clearSavedRun();
      if (typeof syncToCloud === 'function') syncToCloud();
      renderStageComplete(completedStage, state.team, () => {
        showEndlessStageSelect();
      });
    } else {
      startEndlessRegion();
    }
  } else {
    startEndlessMap();
  }
}

// ---- Keyboard shortcuts ----
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
  const activeScreen = document.querySelector('.screen.active')?.id;

  // Space = skip/cancel on any screen that has such a button
  if (e.code === 'Space' && !e.shiftKey) {
    const skipMap = {
      'battle-screen': 'btn-auto-battle',
      'catch-screen':  'btn-skip-catch',
      'item-screen':   'btn-skip-item',
      'swap-screen':   'btn-cancel-swap',
      'trade-screen':  'btn-skip-trade',
    };
    const btnId = skipMap[activeScreen];
    if (btnId) {
      const btn = document.getElementById(btnId);
      if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
      return;
    }
  }

  if (activeScreen === 'catch-screen') {
    const idx = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
    if (idx === -1) return;
    const slot = document.getElementById('catch-choices')?.children[idx];
    if (!slot) return;
    e.preventDefault();
    if (e.shiftKey) {
      slot.querySelector('.reroll-btn')?.click();
    } else {
      slot.querySelector('.poke-card')?.click();
    }
    return;
  }

  if (activeScreen === 'item-screen' && !e.shiftKey) {
    const idx = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
    if (idx === -1) return;
    const slot = document.getElementById('item-choices')?.children[idx];
    if (!slot) return;
    e.preventDefault();
    slot.click();
    return;
  }

  if (activeScreen === 'swap-screen' && !e.shiftKey) {
    const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(e.code);
    if (idx === -1) return;
    const slot = document.getElementById('swap-choices')?.children[idx];
    if (!slot) return;
    e.preventDefault();
    slot.click();
    return;
  }

  if (activeScreen === 'map-screen' && !e.shiftKey) {
    const idx = ['Digit1', 'Digit2'].indexOf(e.code);
    if (idx === -1) return;
    if (!state?.map) return;
    const accessible = Object.values(state.map.nodes)
      .filter(n => n.accessible && !n.visited)
      .sort((a, b) => a.layer !== b.layer ? a.layer - b.layer : a.col - b.col);
    const node = accessible[idx];
    if (!node) return;
    e.preventDefault();
    if (state.isEndlessMode) onEndlessNodeClick(node);
    else onNodeClick(node);
  }
});

// ---- Boot ----
window.addEventListener('DOMContentLoaded', initGame);
