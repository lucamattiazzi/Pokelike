const SAVE_SERVER = 'https://save.pokelike.xyz';
const SAVE_SCHEMA_VERSION = 2;

const SYNC_KEYS = [
  'poke_trainer', 'poke_tutorial_seen', 'poke_settings',
  'poke_achievements', 'poke_dex', 'poke_shiny_dex',
  'poke_elite_wins', 'poke_hall_of_fame', 'poke_last_run_won',
  'poke_stat_buffs', 'poke_used_starters', 'poke_last_used',
];

// Primitive keys use "newest wins" by per-key updatedAt timestamp.
// Collection keys do union-merge with per-item conflict resolution.
const PRIMITIVE_KEYS = new Set([
  'poke_trainer', 'poke_tutorial_seen', 'poke_settings',
  'poke_last_run_won', 'poke_elite_wins',
]);

function _getSaveUuid() { return localStorage.getItem('poke_save_uuid'); }
function _getUsername()  { return localStorage.getItem('poke_username'); }

function _getMeta() {
  try { return JSON.parse(localStorage.getItem('poke_meta') || '{}'); }
  catch { return {}; }
}
function _setMeta(meta) {
  try { localStorage.setItem('poke_meta', JSON.stringify(meta)); } catch {}
}
function _touchKey(key) {
  const m = _getMeta();
  m[key] = Date.now();
  _setMeta(m);
}

// Wrap localStorage.setItem to track updates for SYNC_KEYS. This lets the
// cloud merger pick the newer side for primitive keys without needing every
// caller to remember to bump a timestamp.
(function patchSetItem() {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.__pokePatched) return;
  const origSet = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function(key, val) {
    origSet(key, val);
    if (SYNC_KEYS.includes(key)) _touchKey(key);
  };
  localStorage.__pokePatched = true;
})();

function _getLocalSave() {
  const save = { lastSaved: Date.now(), v: SAVE_SCHEMA_VERSION, meta: _getMeta() };
  for (const key of SYNC_KEYS) {
    const val = localStorage.getItem(key);
    if (val !== null) save[key] = val;
  }
  return save;
}

function _applyCloudSave(save) {
  const cloudMeta = save.meta || {};
  const localMeta = _getMeta();
  const mergeReport = { primitiveSwaps: [], collectionMerges: [], dropped: 0 };

  // For a primitive key, prefer whichever side has the newer updatedAt. If
  // local has no record at all (older client), take cloud.
  function takeNewerPrimitive(key) {
    const localVal = localStorage.getItem(key);
    const cloudVal = save[key];
    if (cloudVal === undefined) return;
    if (localVal === null) { localStorage.setItem(key, cloudVal); mergeReport.primitiveSwaps.push(key); return; }
    const lt = localMeta[key] ?? 0;
    const ct = cloudMeta[key] ?? 0;
    if (ct > lt && cloudVal !== localVal) {
      localStorage.setItem(key, cloudVal);
      mergeReport.primitiveSwaps.push(key);
    }
  }

  for (const key of SYNC_KEYS) {
    if (save[key] === undefined) continue;

    if (key === 'poke_hall_of_fame') {
      const parse = s => { try { return JSON.parse(s || '[]'); } catch { return []; } };
      const local = parse(localStorage.getItem(key));
      const cloud = parse(save[key]);
      // Index by stable hash (savedAt OR runNumber+date+endless fallback).
      const hash = e => e.savedAt ? `t:${e.savedAt}` : `r:${e.runNumber}|${e.date}|${!!e.endless}`;
      const seen = new Set();
      const merged = [];
      for (const e of [...local, ...cloud]) {
        const h = hash(e);
        if (seen.has(h)) continue;
        seen.add(h);
        merged.push(e);
      }
      merged.sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0));
      localStorage.setItem(key, JSON.stringify(merged));
      mergeReport.collectionMerges.push(key);
      continue;
    }

    if (key === 'poke_achievements') {
      const parse = s => { try { return JSON.parse(s || '[]'); } catch { return []; } };
      const merged = [...new Set([...parse(localStorage.getItem(key)), ...parse(save[key])])];
      localStorage.setItem(key, JSON.stringify(merged));
      mergeReport.collectionMerges.push(key);
      continue;
    }

    if (key === 'poke_used_starters') {
      const parse = s => { try { return JSON.parse(s || '[]'); } catch { return []; } };
      const merged = [...new Set([...parse(localStorage.getItem(key)), ...parse(save[key])])];
      localStorage.setItem(key, JSON.stringify(merged));
      mergeReport.collectionMerges.push(key);
      continue;
    }

    if (key === 'poke_elite_wins') {
      // Numeric: max() never loses progress.
      const localVal = parseInt(localStorage.getItem(key) || '0', 10);
      const cloudVal = parseInt(save[key] || '0', 10);
      localStorage.setItem(key, String(Math.max(localVal, cloudVal)));
      continue;
    }

    if (key === 'poke_dex') {
      const parse = s => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
      const local = parse(localStorage.getItem(key));
      const cloud = parse(save[key]);
      const merged = { ...local };
      // Bring in cloud species the local dex doesn't have at all.
      for (const [id, ce] of Object.entries(cloud)) {
        if (!merged[id]) { merged[id] = ce; continue; }
        // Caught flag: once caught, always caught.
        if (ce.caught) merged[id].caught = true;
        // Preserve richer fields (name/types/sprite) if local lacks them.
        if (!merged[id].name && ce.name) merged[id].name = ce.name;
        if (!merged[id].types && ce.types) merged[id].types = ce.types;
        if (!merged[id].spriteUrl && ce.spriteUrl) merged[id].spriteUrl = ce.spriteUrl;
      }
      localStorage.setItem(key, JSON.stringify(merged));
      mergeReport.collectionMerges.push(key);
      continue;
    }

    if (key === 'poke_shiny_dex') {
      const parse = s => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
      const local = parse(localStorage.getItem(key));
      const cloud = parse(save[key]);
      const merged = { ...local };
      for (const [id, ce] of Object.entries(cloud)) {
        if (!merged[id]) merged[id] = ce;
      }
      localStorage.setItem(key, JSON.stringify(merged));
      mergeReport.collectionMerges.push(key);
      continue;
    }

    if (key === 'poke_stat_buffs') {
      const parse = s => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
      const local = parse(localStorage.getItem(key));
      const cloud = parse(save[key]);
      const merged = { ...local };
      // Bring in cloud species the local store doesn't have, and max-merge
      // the ones it does. Loss-free: a stat earned anywhere wins.
      for (const [specId, cBufs] of Object.entries(cloud)) {
        if (!merged[specId]) { merged[specId] = cBufs; continue; }
        for (const stat of ['hp', 'atk', 'def', 'special', 'spdef', 'speed']) {
          merged[specId][stat] = Math.max(merged[specId][stat] ?? 0, cBufs[stat] ?? 0);
        }
      }
      localStorage.setItem(key, JSON.stringify(merged));
      mergeReport.collectionMerges.push(key);
      continue;
    }

    if (key === 'poke_last_used') {
      // Per-evo-line timestamp. Newest wins per line.
      const parse = s => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
      const local = parse(localStorage.getItem(key));
      const cloud = parse(save[key]);
      const merged = { ...local };
      for (const [id, t] of Object.entries(cloud)) {
        merged[id] = Math.max(merged[id] ?? 0, Number(t) || 0);
      }
      localStorage.setItem(key, JSON.stringify(merged));
      mergeReport.collectionMerges.push(key);
      continue;
    }

    if (PRIMITIVE_KEYS.has(key)) {
      takeNewerPrimitive(key);
      continue;
    }

    localStorage.setItem(key, save[key]);
  }

  // Persist merged meta as max(local, cloud) per key so subsequent compares
  // use the latest known timestamp.
  const newMeta = { ...localMeta };
  for (const [k, t] of Object.entries(cloudMeta)) {
    newMeta[k] = Math.max(newMeta[k] ?? 0, Number(t) || 0);
  }
  _setMeta(newMeta);

  localStorage.setItem('poke_last_cloud_sync', String(save.lastSaved));
  if (typeof applyDarkMode === 'function') applyDarkMode();
  if (typeof window !== 'undefined') window._lastCloudMergeReport = mergeReport;
}

async function syncToCloud() {
  const uuid = _getSaveUuid();
  if (!uuid) return;
  try {
    const save = _getLocalSave();
    const res = await fetch(`${SAVE_SERVER}/save/${uuid}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(save),
    });
    if (res.ok) localStorage.setItem('poke_last_cloud_sync', String(save.lastSaved));
  } catch (e) {
    console.warn('Sync failed:', e);
  }
}

async function _loadFromServer() {
  const uuid = _getSaveUuid();
  if (!uuid) return;
  try {
    const res = await fetch(`${SAVE_SERVER}/save/${uuid}`);
    if (!res.ok) { await syncToCloud(); return; }
    const cloudSave = await res.json();
    const hasLocal = SYNC_KEYS.some(k => localStorage.getItem(k) !== null);
    const firstTime = !localStorage.getItem('poke_last_cloud_sync');
    if (hasLocal && firstTime) {
      if (confirm('A cloud save was found. Load it? (Local progress will be overwritten)')) {
        _applyCloudSave(cloudSave);
      } else {
        await syncToCloud();
      }
    } else {
      _applyCloudSave(cloudSave);
    }
  } catch (e) {
    console.warn('Load from server failed:', e);
  }
}

function _updateSyncUI() {
  const btn  = document.getElementById('btn-cloud-sync');
  const info = document.getElementById('cloud-sync-info');
  if (!btn) return;
  const username = _getUsername();
  if (username) {
    btn.textContent = `☁ ${username}`;
    btn.onclick = _showAccountModal;
    if (info) { info.textContent = 'cloud save active'; info.style.display = 'block'; }
  } else {
    btn.textContent = '☁ Log In / Register';
    btn.onclick = _showAuthModal;
    if (info) info.style.display = 'none';
  }
}

function _showAuthModal() {
  document.getElementById('save-auth-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'save-auth-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999;';
  modal.innerHTML = `
    <div style="background:var(--bg2);border:2px solid var(--border);padding:24px;max-width:360px;width:90%;font-family:monospace;display:flex;flex-direction:column;gap:10px;">
      <div style="font-family:'Press Start 2P',monospace;font-size:10px;color:var(--accent);">☁ CLOUD SAVE</div>
      <input id="auth-username" placeholder="Username" autocomplete="username"
        style="background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:8px;font-size:12px;font-family:monospace;">
      <input id="auth-password" type="password" placeholder="Password" autocomplete="current-password"
        style="background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:8px;font-size:12px;font-family:monospace;">
      <div id="auth-error" style="color:#e05050;font-size:9px;display:none;"></div>
      <div style="display:flex;gap:8px;">
        <button id="auth-login-btn" class="btn-secondary" style="flex:1;">Log In</button>
        <button id="auth-register-btn" class="btn-secondary" style="flex:1;">Register</button>
      </div>
      <button id="auth-close-btn" class="btn-secondary" style="width:100%;margin-top:2px;">Cancel</button>
    </div>`;
  document.body.appendChild(modal);

  const errEl = document.getElementById('auth-error');
  const showErr = msg => { errEl.textContent = msg; errEl.style.display = 'block'; };

  async function doAuth(endpoint) {
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    if (!username || !password) { showErr('Enter username and password.'); return; }
    errEl.style.display = 'none';
    const btn = document.getElementById(endpoint === '/login' ? 'auth-login-btn' : 'auth-register-btn');
    btn.disabled = true; btn.textContent = '...';
    try {
      const res = await fetch(`${SAVE_SERVER}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { showErr(data.error || 'Something went wrong.'); btn.disabled = false; btn.textContent = endpoint === '/login' ? 'Log In' : 'Register'; return; }
      localStorage.setItem('poke_save_uuid', data.uuid);
      localStorage.setItem('poke_username', data.username);
      modal.remove();
      _updateSyncUI();
      await _loadFromServer();
      if (typeof initGame === 'function') initGame();
    } catch (e) {
      showErr('Could not reach save server.'); btn.disabled = false; btn.textContent = endpoint === '/login' ? 'Log In' : 'Register';
    }
  }

  document.getElementById('auth-login-btn').onclick    = () => doAuth('/login');
  document.getElementById('auth-register-btn').onclick = () => doAuth('/register');
  document.getElementById('auth-close-btn').onclick    = () => modal.remove();
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  // Submit on Enter
  modal.addEventListener('keydown', e => { if (e.key === 'Enter') doAuth('/login'); });
}

function _showAccountModal() {
  document.getElementById('save-auth-modal')?.remove();
  const username = _getUsername();
  const modal = document.createElement('div');
  modal.id = 'save-auth-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999;';
  modal.innerHTML = `
    <div style="background:var(--bg2);border:2px solid var(--border);padding:24px;max-width:360px;width:90%;font-family:monospace;display:flex;flex-direction:column;gap:10px;">
      <div style="font-family:'Press Start 2P',monospace;font-size:10px;color:var(--accent);">☁ CLOUD SAVE</div>
      <div style="font-size:11px;color:var(--text);">Signed in as <b>${username}</b></div>
      <div style="font-size:9px;color:var(--text-dim);">Saves sync automatically.</div>
      <button id="account-signout-btn" class="btn-secondary" style="width:100%;margin-top:4px;">Sign Out</button>
      <button id="account-close-btn" class="btn-secondary" style="width:100%;">Close</button>
    </div>`;
  document.body.appendChild(modal);

  document.getElementById('account-signout-btn').onclick = () => {
    if (!confirm('Sign out? Your local save will remain but won\'t sync until you log back in.')) return;
    localStorage.removeItem('poke_save_uuid');
    localStorage.removeItem('poke_username');
    localStorage.removeItem('poke_last_cloud_sync');
    modal.remove();
    _updateSyncUI();
  };
  document.getElementById('account-close-btn').onclick = () => modal.remove();
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function initCloudSave() {
  _updateSyncUI();
  if (_getSaveUuid()) _loadFromServer();
}
