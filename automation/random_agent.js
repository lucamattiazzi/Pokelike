'use strict';
/**
 * random_agent.js
 *
 * A fully random decision agent.  Useful as:
 *   - A baseline to compare LLM / model agents against
 *   - A fast way to generate diverse training data quickly
 *   - Stress-testing the game simulation
 *
 * Each decision picks uniformly at random from the valid choice indices.
 * Some decisions have configurable skip biases (e.g. don't skip catches too
 * often, because that's clearly wrong and wastes training signal).
 */

class RandomAgent {
  /**
   * @param {object} [opts]
   * @param {number} [opts.catchSkipRate=0.1]   Probability of skipping a catch node
   * @param {number} [opts.itemSkipRate=0.15]   Probability of skipping an item node
   * @param {number} [opts.tradeSkipRate=0.8]   Probability of skipping a trade node
   * @param {number} [opts.seed]                Optional seeded PRNG for reproducibility
   */
  constructor(opts = {}) {
    this._catchSkipRate = opts.catchSkipRate ?? 0.10;
    this._itemSkipRate  = opts.itemSkipRate  ?? 0.15;
    this._tradeSkipRate = opts.tradeSkipRate ?? 0.80;
    this._callCount     = 0;

    // Optional seeded PRNG (mulberry32, same as the game)
    if (opts.seed != null) {
      let s = opts.seed >>> 0;
      this._rand = () => {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    } else {
      this._rand = Math.random;
    }
  }

  get callCount() { return this._callCount; }
  get label()     { return 'random'; }

  /**
   * Returns a random valid choice index.
   * This is synchronous but wrapped in a Promise to match the LLMAgent interface.
   *
   * @param {object} decision — from GameRunner
   * @returns {Promise<{choice: number, reason: string}>}
   */
  async decide(decision) {
    this._callCount++;
    const choice = this._pick(decision);
    return { choice, reason: 'random' };
  }

  _pick(decision) {
    const rand = this._rand;

    switch (decision.type) {
      case 'starter': {
        const n = (decision.options || []).length;
        return Math.floor(rand() * n);
      }

      case 'branch': {
        const opts = decision.options || [];
        return Math.floor(rand() * opts.length);
      }

      case 'catch': {
        const n = (decision.options || []).length;
        // Occasionally skip; otherwise pick a random Pokemon
        if (decision.canSkip && rand() < this._catchSkipRate) return n; // skip
        return Math.floor(rand() * n);
      }

      case 'swap': {
        const n = (decision.team || []).length;
        return Math.floor(rand() * n);
      }

      case 'item': {
        const n = (decision.options || []).length;
        if (decision.canSkip && rand() < this._itemSkipRate) return n; // skip
        return Math.floor(rand() * n);
      }

      case 'item_assign': {
        // Include "put in bag" as an option (index = team.length)
        const n = (decision.team || []).length + 1;
        return Math.floor(rand() * n);
      }

      case 'move_tutor': {
        const n = (decision.team || []).length;
        return Math.floor(rand() * n);
      }

      case 'trade': {
        const n = (decision.team || []).length;
        if (decision.canSkip && rand() < this._tradeSkipRate) return n; // skip
        return Math.floor(rand() * n);
      }

      case 'evolve_branch': {
        const n = (decision.choices || []).length;
        return Math.floor(rand() * Math.max(1, n));
      }

      default:
        return 0;
    }
  }
}

module.exports = RandomAgent;
