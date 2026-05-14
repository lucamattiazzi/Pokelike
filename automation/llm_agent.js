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

const BASE_SYSTEM_PROMPT = `You are an expert Pokémon strategist playing a roguelike game.
Your goal is to WIN the run (defeat all 8 gym leaders + Elite Four).

Rules:
- You start with one of three starters (Bulbasaur/Charmander/Squirtle).
- Each map has branching paths; you pick one node per layer.
- Node types: battle, catch (add a Pokémon), item (held item or consumable),
  trainer (harder battle), pokecenter (free heal), move_tutor (upgrade move power),
  trade (swap a team member), legendary (rare strong encounter), boss (gym leader).
- After winning battles, your Pokémon gain levels and may evolve.
- You can carry at most 6 Pokémon. When the team is full you must release one.
- Items are held (one per Pokémon) or usable (bag).
- Losing any battle ends the run immediately.

CRITICAL — LEVELLING:
- Each battle gives roughly +1 level to your Pokémon. The boss is always 4–6 levels
  above the wild encounters on the same map. You MUST fight every battle node you can
  or you will arrive at the boss fatally underlevelled.
- Never skip a battle or trainer node if your team still needs levels.
- Target: be within 2 levels of the boss before fighting it.

GYM LEADER TYPES (boss of each map) — build your team to counter these:
  Map 0: Brock     — Rock/Ground  → bring Water or Grass
  Map 1: Misty     — Water        → bring Electric or Grass
  Map 2: Lt. Surge — Electric     → bring Ground
  Map 3: Erika     — Grass        → bring Fire, Poison, or Flying
  Map 4: Koga      — Poison       → bring Ground or Psychic
  Map 5: Sabrina   — Psychic      → bring Bug, Ghost, or Dark
  Map 6: Blaine    — Fire         → bring Water or Rock
  Map 7: Giovanni  — Ground       → bring Water, Ice, or Grass
  Maps 8+: Elite Four — mixed; need a full balanced team

STARTER GUIDE:
  Squirtle (Water)   — best overall: counters map-0 (Rock) and map-6 (Fire)
  Bulbasaur (Grass)  — solid: counters map-0 (Rock) and map-1 (Water)
  Charmander (Fire)  — hard mode: weak to map-0 (Rock) and map-1 (Water)

Strategy tips:
- BST (base stat total) is a rough strength proxy — prefer higher BST when equal type.
- Catch on map 0 layer 1: the pool is guaranteed to include Grass and Water options.
  Always catch at least one counter for the upcoming boss.
- Held items: Life Orb, Choice Band/Specs, and Shell Bell are very strong.
  Equip them on your highest-BST or most-used attacker.
- Use pokecenter nodes before the boss — they are guaranteed before the final layer.
- Prioritise staying alive over maximising offence.
- In NUZLOCKE MODE: fainted Pokémon are gone permanently. Survival trumps everything.

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

// Parse the .md file into an array of entry objects.
function parseMemoryFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content  = fs.readFileSync(filePath, 'utf8');
  const sections = content.split(/(?=^## Run )/m)
    .filter(s => s.trimStart().startsWith('## Run'));
  return sections.map(section => {
    const lines  = section.trimEnd().split('\n');
    const header = lines[0];
    const m      = header.match(/\|\s*votes:([+-]?\d+)\s*$/);
    const votes  = m ? parseInt(m[1], 10) : 0;
    const bullets = lines.slice(1).filter(l => l.trim());
    return { header, votes, bullets };
  });
}

// Serialise one entry back to markdown (updating the vote count in the header).
function formatMemoryEntry(entry) {
  const base   = entry.header.replace(/\s*\|\s*votes:[+-]?\d+\s*$/, '');
  const header = `${base} | votes:${entry.votes >= 0 ? '+' : ''}${entry.votes}`;
  return header + '\n' + entry.bullets.join('\n');
}

// Rewrite the whole file preserving all entries with updated vote counts.
function rewriteMemoryFile(filePath, entries) {
  const body = entries.map(formatMemoryEntry).join('\n\n');
  fs.writeFileSync(filePath, '# Pokémon Roguelike Tactics Memory\n\n' + body + '\n');
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
    this._backend      = createBackend(provider || 'anthropic', opts);
    this._callCount    = 0;
    this._systemPrompt = buildSystemPrompt(opts.rules || [], opts.memory || '');
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
   * Vote on the currently-loaded memory entries, then append new insights.
   * Entries that helped get +1; misleading ones get -1; the file is rewritten
   * with updated scores before the new entry is appended.
   *
   * @param {object} result     — return value of playGame()
   * @param {string} filePath   — path to the .md memory file
   * @param {number} maxEntries — how many entries were loaded (must match loadMemory call)
   */
  async appendMemory(result, filePath, maxEntries = 10) {
    // ── 1. Vote on entries that were shown to the model ────────────────────────
    const allEntries = parseMemoryFile(filePath);
    const loaded     = [...allEntries]
      .sort((a, b) => b.votes - a.votes)
      .slice(0, maxEntries);

    if (loaded.length > 0) {
      const votes = await this._voteOnEntries(result, loaded);
      for (const [i, entry] of loaded.entries()) {
        entry.votes = Math.max(-99, Math.min(99, entry.votes + (votes[i] ?? 0)));
      }
      rewriteMemoryFile(filePath, allEntries);
    }

    // ── 2. Generate and append new insights ────────────────────────────────────
    const s    = result.stats || {};
    const team = (result.finalTeam || [])
      .map(p => `${p.name} Lv${p.level} [${(p.types || []).join('/')}]`)
      .join(', ');

    const summary =
      `Outcome: ${result.outcome.toUpperCase()} | Maps cleared: ${result.mapsCleared}/9\n` +
      `Final team: ${team || '(empty)'}\n` +
      `Battles: ${s.battlesTotal ?? '?'} | Caught: ${s.pokemonCaught ?? '?'} | ` +
      `Fainted: ${s.pokemonFainted ?? '?'} | Items: ${s.itemsTaken ?? '?'}`;

    const prompt =
      `You just finished this Pokémon roguelike run:\n\n${summary}\n\n` +
      `Write exactly 2 bullet points (starting with "- ") of tactical insights ` +
      `for future runs. Focus on what you'd do differently or what worked. ` +
      `Be specific and concise (max 25 words each). No preamble, no headers.`;

    const text = await this._backend.complete(
      'You are a Pokémon strategy analyst. Output only two bullet points, nothing else.',
      prompt
    ).catch(err => `- (memory write failed: ${err.message})`);

    const date   = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const header = `\n## Run | ${date} | Seed: ${result.seed} | ` +
                   `${result.outcome.toUpperCase()} (${result.mapsCleared}/9 maps) | votes:0\n`;

    fs.appendFileSync(filePath, header + text.trim() + '\n');
  }

  /**
   * Ask the model to rate each loaded tactic entry.
   * Returns a plain object mapping entry index → vote (-1 | 0 | +1).
   */
  async _voteOnEntries(result, entries) {
    const s    = result.stats || {};
    const team = (result.finalTeam || []).map(p => `${p.name} Lv${p.level}`).join(', ');
    const runLine =
      `${result.outcome.toUpperCase()} (${result.mapsCleared}/9 maps) | ` +
      `Team: ${team || 'none'} | Battles: ${s.battlesTotal ?? '?'} | Fainted: ${s.pokemonFainted ?? '?'}`;

    const tacticLines = entries.map((e, i) => {
      const badge  = `[${e.votes >= 0 ? '+' : ''}${e.votes}]`;
      const bullet = e.bullets[0]?.replace(/^-\s*/, '') || '';
      return `${i} ${badge}: "${bullet}"`;
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
   * Load and format memory entries for injection into the system prompt.
   * Sorts by votes descending and prefixes each bullet with its vote badge.
   */
  static loadMemory(filePath, maxEntries = 10) {
    if (!filePath || !fs.existsSync(filePath)) return '';
    const entries = parseMemoryFile(filePath);
    if (!entries.length) return '';
    return [...entries]
      .sort((a, b) => b.votes - a.votes)
      .slice(0, maxEntries)
      .map(e => {
        const badge = `[${e.votes >= 0 ? '+' : ''}${e.votes}]`;
        return e.bullets.map(b => `${badge} ${b.replace(/^-\s*/, '')}`).join('\n');
      })
      .join('\n');
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
