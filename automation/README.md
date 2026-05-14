# Pokelike Automation

LLM-driven game automation + strategy discovery + model training pipeline.

## Architecture

```
build_cache.js   →   pokemon_cache.json   (one-time setup)
        ↓
run_games.js     →   results/games.jsonl  (LLM plays N games, logs every decision)
        ↓
analyze.js       →   console report        (win rates by starter / catch / item / branch)
        ↓
train_model.py   →   models/               (decision-tree models + interpretable rules)
        ↓
play_model.js    →   results/model_games.jsonl  (model plays 1000s of games, no API needed)
```

## Quick-start

```bash
cd automation
npm install

# 1. Fetch and cache all Pokemon species data (one-time, ~5 min)
node build_cache.js

# 2. Play games with the LLM agent to collect training data
#    --games: number of games  --parallel: concurrent games
ANTHROPIC_API_KEY=sk-... node run_games.js --games 200 --parallel 4

# 3. Analyse results
node analyze.js --in results/games.jsonl

# 4. Train an interpretable decision-tree model
pip install scikit-learn numpy
python train_model.py --in results/games.jsonl --out models/

# 5. Play 1000s of games with the model (no API key needed, very fast)
node play_model.js --games 5000 --parallel 8

# 6. Analyse model-agent results
node analyze.js --in results/model_games.jsonl
```

## Decision points

| Type | When | Options |
|------|------|---------|
| `starter` | Start of run | 3 starter Pokémon |
| `branch` | Each map layer | 2-4 nodes (battle/catch/item/etc.) |
| `catch` | Catch node | 3 Pokémon + skip |
| `swap` | Catch node, team full | Release one of 6 |
| `item` | Item node | 3 items + skip |
| `item_assign` | After picking item | Which Pokémon holds it (or bag) |
| `move_tutor` | Move tutor node | Which Pokémon gets upgrade |
| `trade` | Trade node | Which Pokémon to trade (or skip) |
| `evolve_branch` | Level-up | Which evolution to pick (e.g. Eevee) |

## Results format (JSONL)

```jsonc
{
  "seed": 42,
  "outcome": "win" | "loss" | "error",
  "mapsCleared": 7,            // 9 = full win
  "finalTeam": [{ "name", "level", "types", "bst", "item" }, ...],
  "decisions": [{
    "type": "catch",
    "choice": 1,
    "features": { "map": 2, "badges": 1, "teamSize": 3, ... },
    "reason": "LLM reasoning string"
  }, ...],
  "elapsedMs": 12400,
  "timestamp": "2026-05-14T..."
}
```

## Models

`train_model.py` produces:
- `models/model_<type>.json` — decision-tree as JSON (used by `play_model.js` directly)
- `models/model_<type>.pkl`  — scikit-learn pickle (for further Python analysis)
- `models/feature_importance.json` — per-decision-type feature ranking
- `models/decision_rules.json`     — human-readable if-then rules from the tree
- `models/report.txt`              — training summary with win-rate tables

### Key features

| Feature | Description |
|---------|-------------|
| `map` | Current map index (0-8) |
| `badges` | Gym badges earned |
| `teamSize` | Team size (1-6) |
| `avgHpRatio` | Mean current/max HP across team |
| `avgBST` | Average team base stat total |
| `typesCovered` | Number of distinct types in team |
| `hasType<T>` | 1/0 flag for each of 17 types |
| `catchedBST` | BST of caught Pokémon |
| `isNewType` | 1 if catch adds a new type to team |
| `itemName` | Item chosen at item node |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Required for `run_games.js` |
| `POKELIKE_MODEL` | `claude-haiku-4-5-20251001` | Claude model to use |
