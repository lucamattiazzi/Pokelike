'use strict';
const fs   = require('fs');
const path = require('path');

/**
 * llm_agent.js
 *
 * LLM-driven decision agent with support for multiple backends:
 *
 *   Provider     | How to select              | Notes
 *   -------------|----------------------------|------------------------------
 *   anthropic    | default / --provider claude| Needs ANTHROPIC_API_KEY
 *   llama-cpp    | --provider llama           | OpenAI-compatible local server
 *   openai-compat| --provider openai          | Any OpenAI-compatible endpoint
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY   — Anthropic key (provider=anthropic)
 *   POKELIKE_MODEL      — model name override
 *   LLAMA_BASE_URL      — local server base URL (default http://localhost:8080/v1)
 *   OPENAI_API_KEY      — key for openai-compat provider (can be "none" for llama)
 *   OPENAI_BASE_URL     — base URL for openai-compat provider
 */

const BASE_SYSTEM_PROMPT = `
You are an expert Pokémon strategist playing a roguelike game.
Your goal is to WIN the run (defeat all 8 gym leaders + Elite Four).

Rules:
- You start with one of three starters (Bulbasaur/Charmander/Squirtle).
- Each map has branching paths; you pick one node per layer.
- Node types:
    - battle: if won, all pokemon are raised 1 level, if lost, game is over
    - catch: add a Pokémon, up to 6, then you might need to free one to swap with a new one
    - item: held item (max 1 per pokemon) or consumable
    - trainer: harder battle, if won all pokemon are raised 2 levels, if lost, game is over 
    - pokecenter: free heal all pokemon, only before boss battle
    - move_tutor: upgrade move power for a single pokemon
    - trade: swap a team member with a random pokemon 3 levels higher
    - legendary: rare strong encounter that can be caught
    - boss: gym leader, if won all pokemon are raised 2 levels, if lost, game is over 
- After winning battles, your Pokémon gain levels and may evolve.
- You can carry at most 6 Pokémon.  When the team is full you must release one.
- Items are held (one per Pokémon) or usable (bag).

Battle mechanics:
- Damage ≈ ((2·level/5 + 2) · movePower · Atk/Def / 50 + 2) · typeEff · STAB · itemMods · rand(0.85–1.00).
- Higher Speed attacks first each turn. Crit = ×1.5 damage, 6.25% chance (20% with Scope Lens).
- Physical vs Special split: a Pokémon uses Sp.Atk/Sp.Def if its base Special ≥ base Attack,
  otherwise Atk/Def. BST is the headline number, but the Atk/Special balance decides which
  stat it actually attacks with — match held items to that role.
- STAB: ×1.5 damage when the move's type matches one of the attacker's types.
- Dual-type defenders MULTIPLY effectiveness: weak to both types = ×4, resist both = ×0.25,
  immune via either type = ×0. Always check both defender types before choosing a fight.
- Statuses are minimal: poison ticks 1/8 max HP/round; freeze = skip turn (20% thaw/round).
- Round 101+ enters "overtime" — all damage is ×3, so stalemates resolve fast.

Moves & move_tutor:
- Each Pokémon has a moveTier ∈ {0, 1, 2}. Higher tier = stronger moves of its types
  (rough power: tier 0 ≈ 35–60, tier 1 ≈ 65–100, tier 2 ≈ 100–150).
- A move_tutor node bumps the chosen Pokémon's moveTier by +1 (cap 2). Picking tutor
  on a tier-2 Pokémon is wasted; biggest gain is upgrading a tier-0 attacker.
- A few Pokémon have fixed no-damage moves (e.g. Magikarp → Splash, Abra → Teleport)
  until they evolve.

Levels & evolution:
- Level cap is 100. Wild battle = +1 level for the team; trainer/boss = +2.
- Lucky Egg held item gives 30% chance of +1 bonus level after a battle.
- Evolutions trigger at species-specific levels (no stones, except Moon Stone as a
  usable bag item). Eviolite blocks evolution entirely but grants +50% Def & Sp.Def —
  strong on bulky non-final forms (e.g. Chansey, Porygon2).
- You cannot hold two Pokémon from the same evolution line; catch nodes filter these out.

HP, healing & key held items (one per Pokémon):
- HP carries between battles. The ONLY full heal is a pokecenter node.
- Damage boosters: Life Orb +30% all moves | Choice Band +40% phys (locks one move, −20% Def) |
  Choice Specs +40% spec (locks one move, −20% Sp.Def) | Expert Belt +30% on super-effective hits |
  Type gems (Charcoal/Mystic Water/Magnet/…) +50% to that type | Wide Lens +20% | Metronome +50%
  if 4+ team share the attacker's type.
- Survival/utility: Choice Scarf +50% Speed | Eviolite +50% Def & Sp.Def (non-final only) |
  Assault Vest +50% Sp.Def | Leftovers heals 10% max HP/round | Shell Bell heals 15% of damage
  dealt | Focus Sash survives one KO at full HP → 1 HP | Focus Band 20% to survive any KO →
  1 HP | Rocky Helmet reflects 12% of attacker's max HP on contact.
- Useful bag items include Max Revive (revive a fainted Pokémon), Rare Candy (+3 levels),
  Moon Stone (force-evolve), Scope Lens (raises crit chance — held).

Catch / Trade / Legendary:
- Caught Pokémon arrive near the current map's level. Legendaries arrive at the map's
  MAX level, so a caught legendary is immediately one of the strongest team members.
- Trade swaps your Pokémon for a random species at YOUR level + 3 (cap 100), inheriting
  the better of your moveTier and the map's tier. Trading away a Pokémon that's one level
  from evolving is a bad deal; trading away a stat-poor dead end is a great deal.

Strategy tips:
- Battling is (almost) the only way to raise the level of your pokemon and thus making them stronger.
- LEVEL UP EVERY OPPORTUNITY: you should fight most available battle/trainer node on each map.
  Skipping battles to take items/catches/pokecenters leaves you underlevelled at the boss — and
  the boss WILL out-level and out-stat your team. Fight first, optimise second.
  The goal is to get to 6 pokemon later in the game, not before the 4th level in any case.
- BRANCH RULE — when choosing a branch, prefer battle/trainer over catch/item/shiny UNLESS your
  current team size is ≤ the current map number (e.g. map 2 ⇒ catch only if team ≤ 2, map 5 ⇒
  catch only if team ≤ 5). At a catch node when above that threshold, choose SKIP.
  Exception: catch anyway if the candidate covers a type you're missing for the upcoming gym leader.
- Type coverage: having Pokémon that cover each other's weaknesses is crucial.
- BST (base stat total) is a rough strength proxy.
- Held items: Life Orb, Choice Band/Specs, and Shell Bell are very strong.
- Pokecenter nodes before the boss are guaranteed in the last content layer.
- Prioritise staying alive over maximising offence.
- In NUZLOCKE MODE (shown in game state): fainted Pokémon are gone permanently.
  Layer 1 has two catch nodes — always pick carefully. Survival trumps everything.

Starter tier guide:
- Squirtle (BEST): bulky, Water hits Brock (Rock) and Blaine (Fire) super-effectively, evolves
  into Blastoise. The safest pick for a new run.
- Bulbasaur (GOOD): Grass/Poison covers Brock (Rock) and Misty (Water) — the two hardest early
  gyms — super-effectively. Weak to Erika (Grass mirror is fine) but struggles vs Sabrina.
- Charmander (HARD MODE): loses to Brock and Misty (the first two gyms) and is fragile early.
  Only pick if you're confident you can catch a Water/Rock/Ground type fast in map 0.

Gym leader type matchups (use this to plan your team — every map should have at least one
Pokémon that's super-effective vs the gym leader's type):
- Map 0 — Brock (Rock):       use Water, Grass, Fighting, Ground
- Map 1 — Misty (Water):      use Electric, Grass
- Map 2 — Lt. Surge (Electric): use Ground (immune!)
- Map 3 — Erika (Grass):      use Fire, Ice, Flying, Bug, Poison
- Map 4 — Koga (Poison):      use Ground, Psychic
- Map 5 — Sabrina (Psychic):  use Bug, Ghost, Dark
- Map 6 — Blaine (Fire):      use Water, Ground, Rock
- Map 7 — Giovanni (Ground):  use Water, Grass, Ice

Type effectiveness (attacker → defenders | 2× super-effective / ½× resisted / 0× no effect):
  Normal   → 2×: —                                    | ½×: Rock, Steel              | 0×: Ghost
  Fire     → 2×: Grass, Ice, Bug, Steel               | ½×: Fire, Water, Rock, Dragon
  Water    → 2×: Fire, Ground, Rock                   | ½×: Water, Grass, Dragon
  Electric → 2×: Water, Flying                        | ½×: Electric, Grass, Dragon  | 0×: Ground
  Grass    → 2×: Water, Ground, Rock                  | ½×: Fire, Grass, Poison, Flying, Bug, Dragon, Steel
  Ice      → 2×: Grass, Ground, Flying, Dragon        | ½×: Fire, Water, Ice, Steel
  Fighting → 2×: Normal, Ice, Rock, Dark, Steel       | ½×: Poison, Flying, Psychic, Bug | 0×: Ghost
  Poison   → 2×: Grass                                | ½×: Poison, Ground, Rock, Ghost  | 0×: Steel
  Ground   → 2×: Fire, Electric, Poison, Rock, Steel  | ½×: Grass, Bug               | 0×: Flying
  Flying   → 2×: Grass, Fighting, Bug                 | ½×: Electric, Rock, Steel
  Psychic  → 2×: Fighting, Poison                     | ½×: Psychic, Steel           | 0×: Dark
  Bug      → 2×: Grass, Psychic, Dark                 | ½×: Fire, Fighting, Poison, Flying, Ghost, Steel
  Rock     → 2×: Fire, Ice, Flying, Bug               | ½×: Fighting, Ground, Steel
  Ghost    → 2×: Psychic, Ghost                       | ½×: Dark                     | 0×: Normal
  Dragon   → 2×: Dragon                               | ½×: Steel
  Dark     → 2×: Psychic, Ghost                       | ½×: Fighting, Dark
  Steel    → 2×: Ice, Rock                            | ½×: Fire, Water, Electric, Steel

Output format (strict JSON, nothing else):
{"choice": <0-based index of chosen option>, "reason": "<one short sentence>"}`;

function buildSystemPrompt(rules, memory) {
  let prompt = BASE_SYSTEM_PROMPT;

  if (memory) {
    prompt += `\n\nTACTICS MEMORY (lessons learned from previous runs — use as guidance):\n${memory}`;
  }

  if (rules?.length) {
    const rulesBlock = rules.map((r, i) => `  ${i + 1}. ${r}`).join('\n');
    prompt += `\n\nMANDATORY RULES (override default strategy — follow these strictly):\n${rulesBlock}`;
  }

  return prompt;
}

// ─── Memory file helpers ──────────────────────────────────────────────────────
//
// The memory file is a flat list of voted tactics, one per line, e.g.:
//
//   - Prioritise type coverage early. [seed:42, LOSS 1/9, fainted:3, votes:+2]
//
// Each line is a self-contained tactic with metadata in trailing brackets.
// Votes accumulate per-tactic; sampling at run start is lightly weighted by votes.

const META_RE = /\s*\[([^\]]+)\]\s*$/;

function parseMemoryFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('- '))
    .map(line => {
      const body = line.slice(2);
      const m    = body.match(META_RE);
      let text = body, meta = '', votes = 0;
      if (m) {
        text = body.slice(0, m.index).trim();
        meta = m[1];
        const v = meta.match(/votes:([+-]?\d+)/);
        if (v) votes = parseInt(v[1], 10);
      }
      return { text, meta, votes };
    });
}

function formatMemoryEntry(e) {
  const sign = e.votes >= 0 ? '+' : '';
  let meta   = e.meta || '';
  if (/votes:[+-]?\d+/.test(meta)) {
    meta = meta.replace(/votes:[+-]?\d+/, `votes:${sign}${e.votes}`);
  } else {
    meta = meta ? `${meta}, votes:${sign}${e.votes}` : `votes:${sign}${e.votes}`;
  }
  return `- ${e.text} [${meta}]`;
}

function rewriteMemoryFile(filePath, entries) {
  const body = entries.map(formatMemoryEntry).join('\n');
  fs.writeFileSync(filePath, '# Pokémon Roguelike Tactics Memory\n\n' + body + '\n');
}

// Weighted sampling without replacement (Efraimidis–Spirakis).
// Weight is exp(0.1 * votes): high-voted tactics are favoured, but every entry
// keeps a real chance — a -5 entry still has ~37% the weight of a 0 entry.
function sampleEntries(entries, n) {
  if (entries.length <= n) return [...entries];
  return entries
    .map(e => ({ e, key: -Math.log(Math.random() || 1e-12) / Math.exp(0.1 * e.votes) }))
    .sort((a, b) => a.key - b.key)
    .slice(0, n)
    .map(x => x.e);
}

// ─── Provider backends ────────────────────────────────────────────────────────

/**
 * Anthropic Messages API backend.
 */
class AnthropicBackend {
  constructor(opts = {}) {
    const Anthropic = require('@anthropic-ai/sdk');
    this._client = new Anthropic({ apiKey: opts.apiKey || process.env.ANTHROPIC_API_KEY });
    this._model  = opts.model || process.env.POKELIKE_MODEL || 'claude-haiku-4-5-20251001';
  }

  get label() { return `anthropic/${this._model}`; }

  async complete(systemPrompt, userPrompt) {
    const msg = await this._client.messages.create({
      model:      this._model,
      max_tokens: 128,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userPrompt }],
    });
    return msg.content?.[0]?.text?.trim() || '';
  }
}

/**
 * OpenAI-compatible chat completions backend.
 * Works with llama-cpp-python, ollama, LM Studio, vLLM, etc.
 *
 * llama-cpp-python server: python -m llama_cpp.server --model model.gguf --port 8080
 * ollama:                  OLLAMA_HOST=localhost:11434, model = "mistral" etc.
 */
class OpenAICompatBackend {
  constructor(opts = {}) {
    // Prefer explicit opts, then env vars, then defaults
    this._baseUrl = (opts.baseUrl || process.env.OPENAI_BASE_URL ||
                     process.env.LLAMA_BASE_URL || 'http://localhost:8080/v1')
                    .replace(/\/$/, '');
    this._apiKey  = opts.apiKey  || process.env.OPENAI_API_KEY || 'none';
    this._model   = opts.model   || process.env.POKELIKE_MODEL || 'local-model';
  }

  get label() { return `openai-compat/${this._model} @ ${this._baseUrl}`; }

  async complete(systemPrompt, userPrompt) {
    const body = JSON.stringify({
      model: this._model,
      messages: [
        { role: 'system',  content: systemPrompt },
        { role: 'user',    content: userPrompt   },
      ],
      max_tokens:  128,
      temperature: 0.3,
      // Ask for JSON output if the server supports it
      response_format: { type: 'json_object' },
    });

    const res = await fetch(`${this._baseUrl}/chat/completions`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this._apiKey}`,
      },
      body,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a backend from a provider string or options object.
 *
 * @param {string|object} provider  'anthropic' | 'llama' | 'openai' | options object
 * @param {object} [opts]  Additional options (model, apiKey, baseUrl)
 */
function createBackend(provider, opts = {}) {
  if (typeof provider === 'object') {
    // Called as createBackend({ provider, model, ... })
    opts     = provider;
    provider = opts.provider;
  }

  switch ((provider || 'anthropic').toLowerCase()) {
    case 'anthropic':
    case 'claude':
      return new AnthropicBackend(opts);

    case 'llama':
    case 'llama-cpp':
    case 'llamacpp':
    case 'openai':
    case 'openai-compat':
    case 'ollama':
    case 'lmstudio':
    case 'vllm':
      return new OpenAICompatBackend(opts);

    default:
      throw new Error(`Unknown provider: "${provider}".  Use 'anthropic' or 'llama'.`);
  }
}

// ─── LLMAgent ─────────────────────────────────────────────────────────────────

class LLMAgent {
  /**
   * @param {string|object} provider  Provider string or options object.
   *   Accepted forms:
   *     new LLMAgent()                          → Anthropic (env ANTHROPIC_API_KEY)
   *     new LLMAgent('llama')                   → llama-cpp on localhost:8080
   *     new LLMAgent({ provider:'llama', baseUrl:'http://localhost:11434/v1', model:'mistral' })
   *     new LLMAgent({ rules: ['only catch one pokemon per map', 'prefer fire types'] })
   */
  constructor(provider, opts = {}) {
    if (typeof provider === 'object' && provider !== null) opts = provider;
    this._backend        = createBackend(provider || 'anthropic', opts);
    this._callCount      = 0;
    this._memoryEntries  = opts.memoryEntries || [];
    this._systemPrompt   = buildSystemPrompt(opts.rules || [], opts.memory || '');
  }

  get callCount() { return this._callCount; }
  get label()     { return this._backend.label; }

  /**
   * Make a decision.
   *
   * @param {object} decision — from GameRunner (type, options/team, state, ...)
   * @returns {Promise<{choice: number, reason: string}>}
   */
  async decide(decision) {
    const prompt = formatPrompt(decision);
    const maxIdx = maxChoice(decision);
    this._callCount++;

    try {
      const text   = await this._backend.complete(this._systemPrompt, prompt);
      return parseResponse(text, maxIdx);
    } catch (err) {
      return { choice: 0, reason: `Backend error: ${err.message}` };
    }
  }

  /**
   * Vote on the memory entries that were sampled into this run's prompt,
   * then append 1–5 new tactical insights to the flat memory list.
   *
   * @param {object} result   — return value of playGame()
   * @param {string} filePath — path to the .md memory file
   */
  async appendMemory(result, filePath) {
    const allEntries = parseMemoryFile(filePath);

    // ── 1. Vote on entries shown to this agent during the run ───────────────
    const shown = this._memoryEntries || [];
    if (shown.length > 0) {
      const votes = await this._voteOnEntries(result, shown);
      // Re-identify shown entries in the current file by text (file may have
      // been rewritten by a concurrent worker since we sampled it).
      const byText = new Map(allEntries.map(e => [e.text, e]));
      for (const [i, e] of shown.entries()) {
        const delta = votes[i];
        if (!delta) continue;
        const target = byText.get(e.text);
        if (target) target.votes = Math.max(-99, Math.min(99, target.votes + delta));
      }
    }

    // ── 2. Generate 1–5 new insights for this run ───────────────────────────
    const s    = result.stats || {};
    const team = (result.finalTeam || [])
      .map(p => `${p.name} Lv${p.level} [${(p.types || []).join('/')}]`)
      .join(', ');

    const summary =
      `Outcome: ${result.outcome.toUpperCase()} | Maps cleared: ${result.mapsCleared}/9\n` +
      `Final team: ${team || '(empty)'}\n` +
      `Battles: ${s.battlesTotal ?? '?'} | Caught: ${s.pokemonCaught ?? '?'} | ` +
      `Fainted: ${s.pokemonFainted ?? '?'} | Items: ${s.itemsTaken ?? '?'}`;

    const existingList = allEntries.length
      ? allEntries.map(e => `- ${e.text}`).join('\n')
      : '(none yet)';

    const prompt =
      `You just finished this Pokémon roguelike run:\n\n${summary}\n\n` +
      `Tactics already in memory (do NOT repeat or paraphrase these):\n${existingList}\n\n` +
      `Write between 0 and 2 bullet points (starting with "- ") of NEW tactical ` +
      `insights for future runs that are not already covered above. Each bullet ` +
      `must be a single self-contained tactic (max 25 words). If you have nothing ` +
      `genuinely new to add, output nothing. No preamble, no headers.`;

    const text = await this._backend.complete(
      'You are a Pokémon strategy analyst. Output only between 0 and 2 bullet points, nothing else.',
      prompt
    ).catch(err => `- (memory write failed: ${err.message})`);

    const newBullets = text.split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('- '))
      .slice(0, 5)
      .map(l => l.slice(2).trim())
      .filter(Boolean);

    const meta = `seed:${result.seed}, ${result.outcome.toUpperCase()} ${result.mapsCleared}/9, ` +
                 `fainted:${s.pokemonFainted ?? '?'}`;

    for (const b of newBullets) {
      allEntries.push({ text: b, meta, votes: 0 });
    }
    rewriteMemoryFile(filePath, allEntries);
  }

  /**
   * Ask the model to rate each shown tactic entry.
   * Returns a plain object mapping entry index → vote (-1 | 0 | +1).
   */
  async _voteOnEntries(result, entries) {
    const s    = result.stats || {};
    const team = (result.finalTeam || []).map(p => `${p.name} Lv${p.level}`).join(', ');
    const runLine =
      `${result.outcome.toUpperCase()} (${result.mapsCleared}/9 maps) | ` +
      `Team: ${team || 'none'} | Battles: ${s.battlesTotal ?? '?'} | Fainted: ${s.pokemonFainted ?? '?'}`;

    const tacticLines = entries.map((e, i) => {
      const sign = e.votes >= 0 ? '+' : '';
      return `${i} [${sign}${e.votes}]: "${e.text}"`;
    }).join('\n');

    const prompt =
      `Rate each tactic based on your last run.\n` +
      `Run: ${runLine}\n\n` +
      `Tactics (index [current_votes]: "text"):\n${tacticLines}\n\n` +
      `Output ONLY a JSON object mapping index to vote.\n` +
      `+1 = this advice was correct and helped, -1 = this advice was wrong or harmful, 0 = not applicable.\n` +
      `Example: {"0":1,"1":0,"2":-1}`;

    const text = await this._backend.complete(
      'You are a game strategy reviewer. Output ONLY a valid JSON object. No explanation.',
      prompt
    ).catch(() => '{}');

    try {
      const cleaned = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed  = JSON.parse(cleaned);
      const out     = {};
      for (const [k, v] of Object.entries(parsed)) {
        const idx = parseInt(k, 10);
        if (!isNaN(idx) && [-1, 0, 1].includes(Number(v))) out[idx] = Number(v);
      }
      return out;
    } catch {
      return {}; // parse failure → no votes applied
    }
  }

  // ─── Static helpers (called by run_games.js) ──────────────────────────────

  /**
   * Sample memory entries for injection into the system prompt.
   *
   * Picks `n` entries via weighted sampling (weight = exp(0.1 * votes)) so
   * high-voted tactics are favoured but every entry retains a real chance.
   *
   * Returns { text, entries } — `text` is the formatted block for the prompt,
   * `entries` are the sampled objects (pass them back via `memoryEntries` so
   * the agent can vote on the exact set it saw).
   */
  static loadMemory(filePath, n = 10) {
    if (!filePath || !fs.existsSync(filePath)) return { text: '', entries: [] };
    const all = parseMemoryFile(filePath);
    if (!all.length) return { text: '', entries: [] };
    const sampled = sampleEntries(all, n);
    const text    = sampled.map(e => {
      const sign = e.votes >= 0 ? '+' : '';
      return `[${sign}${e.votes}] ${e.text}`;
    }).join('\n');
    return { text, entries: sampled };
  }

  static initMemoryFile(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '# Pokémon Roguelike Tactics Memory\n\n');
    }
  }
}

// ─── Prompt formatting (shared with random_agent for display) ─────────────────

function formatPrompt(decision) {
  const { type, state } = decision;
  const lines = [];

  if (state) {
    lines.push(`=== Game State ===`);
    lines.push(
      `Map: ${state.currentMap}/8 (${state.badges} badges)` +
      (state.catchesThisMap != null ? ` | Catches this map: ${state.catchesThisMap}` : '') +
      (state.nuzlocke ? ' | NUZLOCKE MODE' : '')
    );
    if (state.team?.length) {
      lines.push(`Team (${state.team.length}/6):`);
      for (const p of state.team) {
        lines.push(`  - ${p.name} Lv${p.level} [${p.types.join('/')}] BST:${p.bst} HP:${p.hp}${p.item ? ` @${p.item}` : ''}`);
      }
    }
    if (state.bagItems?.length) {
      lines.push(`Bag: ${state.bagItems.map(i => i.name).join(', ')}`);
    }
  }

  lines.push('');
  lines.push(`=== Decision: ${type} ===`);

  switch (type) {
    case 'starter': {
      lines.push('Choose your starter Pokémon:');
      for (const [i, p] of (decision.options || []).entries()) {
        const bst = p?.baseStats ? Object.values(p.baseStats).reduce((a, b) => a + b, 0) : '?';
        lines.push(`  ${i}: ${p?.name} [${(p?.types || []).join('/')}] BST:${bst}`);
      }
      break;
    }
    case 'branch': {
      lines.push('Choose which map node to visit:');
      for (const [i, n] of (decision.options || []).entries()) {
        lines.push(`  ${i}: ${n.type.toUpperCase()} (layer ${n.layer})`);
      }
      break;
    }
    case 'catch': {
      lines.push(`Choose a Pokémon to catch (${(decision.options||[]).length} = skip):`);
      for (const [i, p] of (decision.options || []).entries()) {
        const bst = p?.baseStats ? Object.values(p.baseStats).reduce((a, b) => a + b, 0) : '?';
        lines.push(`  ${i}: ${p?.name} Lv${p?.level} [${(p?.types || []).join('/')}] BST:${bst}${p?.isShiny ? ' ✨' : ''}`);
      }
      if (decision.canSkip) lines.push(`  ${(decision.options||[]).length}: SKIP`);
      break;
    }
    case 'swap': {
      const np = decision.newPokemon;
      const nbst = np?.baseStats ? Object.values(np.baseStats).reduce((a, b) => a + b, 0) : '?';
      lines.push(`Team is full.  New: ${np?.name} [${(np?.types||[]).join('/')}] BST:${nbst}`);
      lines.push('Choose which team member to RELEASE:');
      for (const [i, p] of (decision.team || []).entries()) {
        lines.push(`  ${i}: ${p.name} Lv${p.level} [${p.types.join('/')}]${p.heldItem ? ` @${p.heldItem.name}` : ''}`);
      }
      break;
    }
    case 'item': {
      lines.push(`Choose an item (${(decision.options||[]).length} = skip):`);
      for (const [i, it] of (decision.options || []).entries()) {
        lines.push(`  ${i}: ${it.name}${it.usable ? ' [USABLE]' : ''} — ${it.desc}`);
      }
      if (decision.canSkip) lines.push(`  ${(decision.options||[]).length}: SKIP`);
      break;
    }
    case 'item_assign': {
      const it = decision.item;
      lines.push(`Assign "${it?.name}" to a Pokémon (${(decision.team||[]).length} = bag):`);
      for (const [i, p] of (decision.team || []).entries()) {
        lines.push(`  ${i}: ${p.name} Lv${p.level} [${p.types.join('/')}]${p.heldItem ? ` (has ${p.heldItem.name})` : ''}`);
      }
      lines.push(`  ${(decision.team||[]).length}: Put in bag`);
      break;
    }
    case 'move_tutor': {
      lines.push('Choose which Pokémon gets a move tier upgrade:');
      for (const [i, p] of (decision.team || []).entries()) {
        lines.push(`  ${i}: ${p.name} Lv${p.level} tier:${p.moveTier ?? 1}`);
      }
      break;
    }
    case 'trade': {
      lines.push(`Choose a Pokémon to trade away (${(decision.team||[]).length} = skip):`);
      for (const [i, p] of (decision.team || []).entries()) {
        lines.push(`  ${i}: ${p.name} Lv${p.level} [${p.types.join('/')}]`);
      }
      if (decision.canSkip) lines.push(`  ${(decision.team||[]).length}: SKIP`);
      break;
    }
    case 'evolve_branch': {
      lines.push(`${decision.pokemon?.name} can evolve. Choose:`);
      for (const [i, e] of (decision.choices || []).entries()) {
        lines.push(`  ${i}: ${e.name}`);
      }
      break;
    }
  }

  return lines.join('\n');
}

function parseResponse(text, maxIdx) {
  try {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const obj     = JSON.parse(cleaned);
    const choice  = Math.max(0, Math.min(maxIdx, parseInt(obj.choice, 10) || 0));
    return { choice, reason: obj.reason || '' };
  } catch {
    const m = text.match(/\d+/);
    return { choice: m ? Math.min(maxIdx, parseInt(m[0], 10)) : 0, reason: text.slice(0, 120) };
  }
}

function maxChoice(decision) {
  switch (decision.type) {
    case 'starter':       return (decision.options?.length || 3) - 1;
    case 'branch':        return (decision.options?.length || 2) - 1;
    case 'catch':         return (decision.options?.length || 3) + (decision.canSkip ? 0 : -1);
    case 'swap':          return (decision.team?.length || 6) - 1;
    case 'item':          return (decision.options?.length || 3) + (decision.canSkip ? 0 : -1);
    case 'item_assign':   return (decision.team?.length || 6);
    case 'move_tutor':    return (decision.team?.length || 6) - 1;
    case 'trade':         return (decision.team?.length || 6) + (decision.canSkip ? 0 : -1);
    case 'evolve_branch': return (decision.choices?.length || 2) - 1;
    default:              return 0;
  }
}

module.exports = LLMAgent;
module.exports.createBackend  = createBackend;
module.exports.AnthropicBackend     = AnthropicBackend;
module.exports.OpenAICompatBackend  = OpenAICompatBackend;
module.exports.formatPrompt   = formatPrompt;
module.exports.maxChoice      = maxChoice;
