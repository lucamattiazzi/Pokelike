'use strict';
/**
 * llm_agent.js
 *
 * LLM-driven decision agent.  Uses Claude (Haiku by default for speed/cost) to
 * make strategic choices at every decision point in the game.
 *
 * Each call formats the current game state and the available options as a
 * compact JSON prompt, asks the model for a choice index (0-based), and
 * returns it.  The model is also asked for brief reasoning which gets
 * appended to the decision record for later analysis.
 */

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.POKELIKE_MODEL || 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You are an expert Pokémon strategist playing a roguelike game.
Your goal is to WIN the run (defeat all 8 gym leaders + Elite Four).

Rules:
- You start with one of three starters (Bulbasaur/Charmander/Squirtle).
- Each map has branching paths; you pick one node per layer.
- Node types: battle, catch (add a Pokémon), item (held item or consumable),
  trainer (harder battle), pokecenter (free heal), move_tutor (upgrade move power),
  trade (swap a team member), legendary (rare strong encounter), boss (gym leader).
- After winning battles, your Pokémon gain levels and may evolve.
- You can carry at most 6 Pokémon.  When the team is full you must release one.
- Items are held (one per Pokémon) or usable (bag).

Strategy tips:
- Type coverage: having Pokémon that cover each other's weaknesses is crucial.
- BST (base stat total) is a rough strength proxy.
- Early catch nodes on map 0 are very valuable — grab high-BST or type-diverse Pokémon.
- Held items: Life Orb, Choice Band/Specs, and Shell Bell are very strong.
- Pokecenter nodes before the boss are guaranteed in the last content layer.
- Prioritise staying alive over maximising offence.

Output format (strict JSON, nothing else):
{"choice": <0-based index of chosen option>, "reason": "<one short sentence>"}`;

class LLMAgent {
  constructor(apiKey) {
    this._client = new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });
    this._callCount = 0;
  }

  get callCount() { return this._callCount; }

  /**
   * Make a decision.
   *
   * @param {object} decision — from GameRunner (type, options/team, state, ...)
   * @returns {Promise<{choice: number, reason: string}>}
   */
  async decide(decision) {
    const prompt = this._formatPrompt(decision);
    this._callCount++;

    try {
      const msg = await this._client.messages.create({
        model:      MODEL,
        max_tokens: 128,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: prompt }],
      });

      const text = msg.content?.[0]?.text?.trim() || '';
      const parsed = this._parseResponse(text, this._maxChoice(decision));
      return parsed;
    } catch (err) {
      // On API failure fall back to choice 0
      return { choice: 0, reason: `API error: ${err.message}` };
    }
  }

  // ─── Format the decision as a user prompt ──────────────────────────────────
  _formatPrompt(decision) {
    const { type, state } = decision;
    const lines = [];

    if (state) {
      lines.push(`=== Game State ===`);
      lines.push(`Map: ${state.currentMap}/8 (${state.badges} badges)`);
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
        lines.push(`Choose a Pokémon to catch (${decision.options.length + (decision.canSkip ? 1 : 0) - 1} = skip):`);
        for (const [i, p] of (decision.options || []).entries()) {
          const bst = p?.baseStats ? Object.values(p.baseStats).reduce((a, b) => a + b, 0) : '?';
          lines.push(`  ${i}: ${p?.name} Lv${p?.level} [${(p?.types || []).join('/')}] BST:${bst}${p?.isShiny ? ' ✨' : ''}`);
        }
        if (decision.canSkip) {
          lines.push(`  ${(decision.options || []).length}: SKIP (don't catch)`);
        }
        break;
      }

      case 'swap': {
        const np = decision.newPokemon;
        const nbst = np?.baseStats ? Object.values(np.baseStats).reduce((a, b) => a + b, 0) : '?';
        lines.push(`Team is full.  New Pokémon: ${np?.name} Lv${np?.level} [${(np?.types || []).join('/')}] BST:${nbst}`);
        lines.push('Choose which team member to RELEASE (they leave your team):');
        for (const [i, p] of (decision.team || []).entries()) {
          lines.push(`  ${i}: Release ${p.name} Lv${p.level} [${p.types.join('/')}] HP:${p.hp}${p.heldItem ? ` @${p.heldItem.name}` : ''}`);
        }
        break;
      }

      case 'item': {
        lines.push(`Choose an item (${(decision.options || []).length} = skip):`);
        for (const [i, it] of (decision.options || []).entries()) {
          lines.push(`  ${i}: ${it.name}${it.usable ? ' [USABLE]' : ''} — ${it.desc}`);
        }
        if (decision.canSkip) {
          lines.push(`  ${(decision.options || []).length}: SKIP`);
        }
        break;
      }

      case 'item_assign': {
        const it = decision.item;
        lines.push(`Assign "${it?.name}" to a Pokémon (${(decision.team || []).length} = put in bag):`);
        for (const [i, p] of (decision.team || []).entries()) {
          lines.push(`  ${i}: ${p.name} Lv${p.level} [${p.types.join('/')}]${p.heldItem ? ` (currently holding ${p.heldItem.name})` : ''}`);
        }
        lines.push(`  ${(decision.team || []).length}: Put in bag`);
        break;
      }

      case 'move_tutor': {
        lines.push('Choose which Pokémon gets a move tier upgrade (stronger moves):');
        for (const [i, p] of (decision.team || []).entries()) {
          lines.push(`  ${i}: ${p.name} Lv${p.level} current tier:${p.moveTier ?? 1}`);
        }
        break;
      }

      case 'trade': {
        lines.push(`Choose a Pokémon to TRADE AWAY (${(decision.team || []).length} = skip trade):`);
        for (const [i, p] of (decision.team || []).entries()) {
          lines.push(`  ${i}: ${p.name} Lv${p.level} [${p.types.join('/')}] — you get a random Pokémon back`);
        }
        if (decision.canSkip) {
          lines.push(`  ${(decision.team || []).length}: SKIP trade`);
        }
        break;
      }

      case 'evolve_branch': {
        lines.push(`${decision.pokemon?.name} can evolve.  Choose evolution:`);
        for (const [i, e] of (decision.choices || []).entries()) {
          lines.push(`  ${i}: ${e.name}`);
        }
        break;
      }
    }

    return lines.join('\n');
  }

  // ─── Parse JSON response from the model ────────────────────────────────────
  _parseResponse(text, maxIdx) {
    try {
      // Strip markdown code fences if present
      const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const obj = JSON.parse(cleaned);
      const choice = Math.max(0, Math.min(maxIdx, parseInt(obj.choice, 10) || 0));
      return { choice, reason: obj.reason || '' };
    } catch {
      // Extract first integer from text as fallback
      const m = text.match(/\d+/);
      const choice = m ? Math.min(maxIdx, parseInt(m[0], 10)) : 0;
      return { choice, reason: text.slice(0, 120) };
    }
  }

  _maxChoice(decision) {
    switch (decision.type) {
      case 'starter':      return (decision.options?.length || 3) - 1;
      case 'branch':       return (decision.options?.length || 2) - 1;
      case 'catch':        return (decision.options?.length || 3) + (decision.canSkip ? 0 : -1);
      case 'swap':         return (decision.team?.length || 6) - 1;
      case 'item':         return (decision.options?.length || 3) + (decision.canSkip ? 0 : -1);
      case 'item_assign':  return (decision.team?.length || 6);
      case 'move_tutor':   return (decision.team?.length || 6) - 1;
      case 'trade':        return (decision.team?.length || 6) + (decision.canSkip ? 0 : -1);
      case 'evolve_branch': return (decision.choices?.length || 2) - 1;
      default:             return 0;
    }
  }
}

module.exports = LLMAgent;
