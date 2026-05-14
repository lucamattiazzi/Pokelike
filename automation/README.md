# Pokelike Automation

A pipeline for playing Pokelike automatically, discovering winning strategies, and training a small interpretable model that can play to win without any API calls.

## Table of contents

1. [How it works](#how-it-works)
2. [Setup](#setup)
3. [Step 0 — Build the Pokemon cache](#step-0--build-the-pokemon-cache)
4. [Step 1 — Play games with an agent](#step-1--play-games-with-an-agent)
   - [Choosing an agent](#choosing-an-agent)
   - [Anthropic (Claude)](#anthropic-claude)
   - [Local model via llama-cpp](#local-model-via-llama-cpp)
   - [Other OpenAI-compatible servers](#other-openai-compatible-servers)
   - [Random agent](#random-agent)
5. [Step 2 — Analyse results](#step-2--analyse-results)
6. [Step 3 — Train the model](#step-3--train-the-model)
7. [Step 4 — Play with the model](#step-4--play-with-the-model)
8. [Full workflow example](#full-workflow-example)
9. [Script reference](#script-reference)
10. [Results file format](#results-file-format)
11. [Decision points](#decision-points)
12. [Game mechanics summary](#game-mechanics-summary)
13. [Environment variables](#environment-variables)

---

## How it works

```
build_cache.js          one-time PokeAPI fetch → pokemon_cache.json
       │
       ▼
run_games.js            agent plays N games → results/games.jsonl
  ├─ LLM agent          (Anthropic Claude or any local model via llama-cpp / ollama)
  └─ random agent       (no API needed; good baseline and fast data collection)
       │
       ▼
analyze.js              print strategy report from any JSONL file
       │
       ▼
train_model.py          learn decision trees from game data → models/
       │
       ▼
play_model.js           model agent plays 1000s of games → results/model_games.jsonl
```

Each game is a seeded, deterministic run through 8 gym maps + Elite Four. At every branching point the active agent is asked to choose: which path to take, which Pokémon to catch, which item to take and give to whom, and so on. Every decision is logged alongside extracted features so the data can feed an ML classifier.

The trained decision trees are **interpretable**: you can read the if-then rules directly (`models/decision_rules.json`) and see exactly which features the model relies on.

---

## Setup

**Prerequisites:** Node.js ≥ 18, npm.  Python 3.8+ (only needed for `train_model.py`).

```bash
cd automation
npm install
```

That's it. The Anthropic SDK is the only Node.js dependency. Python packages are installed separately when needed.

---

## Step 0 — Build the Pokemon cache

The game fetches Pokémon species data (stats, types) from PokeAPI at runtime. The automation scripts need this data available locally so they can run offline and in parallel without hitting rate limits.

```bash
node build_cache.js
```

This fetches ~500 Pokémon (all species that can appear in the game) and writes `pokemon_cache.json`. It takes around 2–5 minutes on a normal connection. Run it once; results are cached permanently.

To refresh the cache (e.g. after a game update):

```bash
node build_cache.js --refresh
```

---

## Step 1 — Play games with an agent

```bash
node run_games.js [options]
```

Results are appended to the output JSONL file so you can stop and resume at any time.

### Choosing an agent

| `--provider` | Agent | API needed? | Speed |
|---|---|---|---|
| `anthropic` | Claude via Anthropic API | Yes (`ANTHROPIC_API_KEY`) | ~5–30s/game |
| `llama` | Local model via llama-cpp | No (local server) | ~1–10s/game |
| `openai` | Any OpenAI-compatible server | Optional | varies |
| `random` | Uniform random choices | No | ~50ms/game |

### Anthropic (Claude)

```bash
export ANTHROPIC_API_KEY=sk-ant-...

# 200 games, 4 at a time, using Claude Haiku (cheapest/fastest)
node run_games.js --games 200 --parallel 4

# Explicitly choose a model
node run_games.js --games 100 --model claude-sonnet-4-6

# Verbose: print each game result as it finishes
node run_games.js --games 50 --verbose
```

Claude Haiku is the default. It costs roughly $0.001–0.003 per game (10–25 decisions at ~$0.0001 each). 200 games costs under $1.

### Local model via llama-cpp

Start a llama-cpp server first:

```bash
# Install: pip install llama-cpp-python[server]
python -m llama_cpp.server \
  --model /path/to/model.gguf \
  --port 8080 \
  --n_ctx 2048 \
  --chat_format chatml
```

Then run games against it:

```bash
# Defaults: http://localhost:8080/v1, model name = "local-model"
node run_games.js --provider llama --games 500 --parallel 4

# Custom port or model name
node run_games.js --provider llama \
  --base-url http://localhost:9000/v1 \
  --model mistral-7b-instruct \
  --games 500 --parallel 2
```

The prompts are short (~30 lines of text) and the expected output is a single JSON object, so even a 7B quantised model handles it well. Models that follow instructions reliably (Mistral-Instruct, LLaMA-3-Instruct, Phi-3) work better than base models.

**Tips for local models:**
- Use `--parallel 1` or `--parallel 2` if the server is slow; too many concurrent requests can stall it.
- If the model outputs markdown fences around JSON, the parser handles that automatically.
- If the model consistently ignores the JSON format, try a different chat template (`--chat_format llama-2`, `--chat_format gemma`, etc.).

### Other OpenAI-compatible servers

**ollama:**
```bash
ollama serve   # starts on :11434 by default

node run_games.js --provider openai \
  --base-url http://localhost:11434/v1 \
  --model llama3 \
  --games 300 --parallel 2
```

**LM Studio:**
```bash
# Start the local server in LM Studio (default port 1234)
node run_games.js --provider openai \
  --base-url http://localhost:1234/v1 \
  --model local-model \
  --games 300
```

**vLLM or any remote OpenAI-compatible endpoint:**
```bash
export OPENAI_API_KEY=your-key   # or "none" if no key required

node run_games.js --provider openai \
  --base-url https://your-endpoint/v1 \
  --model your-model \
  --games 200 --parallel 8
```

### Random agent

The random agent makes uniformly random choices with configurable skip rates. It needs no API and no running server, so it runs at full CPU speed.

```bash
# 5000 random games, 8 parallel — finishes in seconds
node run_games.js --provider random --games 5000 --parallel 8

# Custom output file
node run_games.js --provider random --games 10000 \
  --out results/random_baseline.jsonl --parallel 16
```

The random agent is useful for:
- **Baseline comparison**: what win rate does pure luck achieve?
- **Fast data collection**: generate a large, diverse dataset to seed the ML model before committing to LLM API costs.
- **Stress testing**: verify the simulation handles edge cases.

---

## Step 2 — Analyse results

```bash
node analyze.js [options]
```

Reads any JSONL file and prints a strategy report.

```bash
# Analyse LLM agent games
node analyze.js

# Analyse a specific file
node analyze.js --in results/random_baseline.jsonl

# Show top 15 entries per category
node analyze.js --top 15

# Output as JSON (for programmatic use)
node analyze.js --json > analysis.json
```

**Report sections:**

- **Maps cleared distribution** — how far games typically get (9 = full win)
- **Starter win rates** — which starter type (Grass/Fire/Water) wins more often
- **Best branch choices** — which node type to favour per map layer
- **Catch decisions** — which Pokémon types to catch; skip vs. catch rates; new-type coverage bonus
- **Best items** — which held items correlate with wins
- **Team composition** — average BST, size, and type distribution in winning vs. losing teams

---

## Step 3 — Train the model

```bash
pip install scikit-learn numpy
python train_model.py [options]
```

Trains one decision-tree classifier per decision type (starter, branch, catch, item). Each tree predicts P(win | state, choice) — the probability the game will be won if this choice is made in this state. At inference time the model scores all available options and picks the highest.

```bash
# Default: decision tree, depth 5, from results/games.jsonl
python train_model.py

# Use gradient-boosted trees (higher accuracy, less interpretable)
python train_model.py --model gbm --max-depth 6

# Use random forest
python train_model.py --model forest

# Custom input / output
python train_model.py --in results/random_games.jsonl --out models/random/

# Increase min-samples to reduce overfitting on small datasets
python train_model.py --min-samples 30
```

**Outputs in `models/`:**

| File | Description |
|------|-------------|
| `model_<type>.json` | Decision tree as JSON — loaded directly by `play_model.js` |
| `model_<type>.pkl` | scikit-learn pickle — for further Python analysis or retraining |
| `feature_importance.json` | Feature importance scores per decision type |
| `decision_rules.json` | Human-readable if-then rules from each tree |
| `report.txt` | Full training report: win-rate tables + CV accuracy |

**Reading the rules:**

Open `models/decision_rules.json` to see rules like:

```
|--- isNewType <= 0.50
|   |--- avgBST <= 320.00
|   |   |--- class: loss
|   |--- avgBST > 320.00
|   |   |--- class: win
|--- isNewType > 0.50
|   |--- class: win
```

This would mean: "If catching a Pokémon adds a new type to the team, do it. If not, only catch if the team BST is already above 320."

**How many games do you need?**

| Games | Quality |
|-------|---------|
| 100–200 | Rough signal, noisy |
| 500–1000 | Good enough for a useful model |
| 2000+ | Reliable; start with random agent to get here cheaply |

A good workflow: run 2000 random games first (fast, free), train a baseline model, then run 500 LLM games to refine it.

---

## Step 4 — Play with the model

```bash
node play_model.js [options]
```

Uses the trained decision-tree models from `models/` to play games instantly — no API, no server, just in-process inference. Falls back to a built-in heuristic (highest BST + type coverage bonus) if no model exists for a given decision type.

```bash
# 5000 games, 8 parallel
node play_model.js --games 5000 --parallel 8

# Custom seed range
node play_model.js --games 10000 --seed 50000 --parallel 12

# Use models from a different directory
node play_model.js --models models/random/ --games 2000

# Verbose: print each game
node play_model.js --games 100 --verbose

# Different output file
node play_model.js --games 5000 --out results/model_v2.jsonl
```

With the model loaded and 8 cores, you can expect roughly **50–200 games per second** (the bottleneck is the battle engine, not the model inference).

Iterate: run model games → analyse → retrain → run more model games until the win rate plateaus.

---

## Full workflow example

```bash
cd automation
npm install

# One-time cache build
node build_cache.js

# Phase 1: collect baseline data with the random agent (fast and free)
node run_games.js --provider random \
  --games 2000 --parallel 8 \
  --out results/random_baseline.jsonl

node analyze.js --in results/random_baseline.jsonl

# Phase 2: collect LLM agent data (smarter decisions, slower)
export ANTHROPIC_API_KEY=sk-ant-...
node run_games.js --games 200 --parallel 4 \
  --out results/llm_games.jsonl

node analyze.js --in results/llm_games.jsonl

# Phase 3: train on combined data
cat results/random_baseline.jsonl results/llm_games.jsonl > results/combined.jsonl
pip install scikit-learn numpy
python train_model.py --in results/combined.jsonl --out models/

# Review the learned rules
cat models/report.txt
cat models/decision_rules.json

# Phase 4: exploit at scale with the trained model
node play_model.js --games 10000 --parallel 8 \
  --out results/model_games.jsonl

node analyze.js --in results/model_games.jsonl

# Phase 5: retrain with model-agent data included (iterative refinement)
cat results/combined.jsonl results/model_games.jsonl > results/all_games.jsonl
python train_model.py --in results/all_games.jsonl --out models/v2/
node play_model.js --models models/v2/ --games 10000 --parallel 8
```

---

## Script reference

### `build_cache.js`

Fetches Pokémon species data from PokeAPI and writes `pokemon_cache.json`. Must be run before any other script.

```
node build_cache.js [--refresh]

  --refresh    Re-fetch all species even if already cached
```

### `run_games.js`

Plays N games with the selected agent and appends results to a JSONL file.

```
node run_games.js [options]

  --games N          Number of games to play (default: 50)
  --seed N           Starting RNG seed; games use seeds N, N+1, ... (default: 1)
  --out FILE         Output JSONL file (default: results/games.jsonl or
                     results/random_games.jsonl for --provider random)
  --parallel N       Games to run concurrently (default: 1 for LLM, 8 for random)
  --verbose          Print each game result as it finishes
  --provider NAME    Agent to use: anthropic (default), llama, openai, random
  --model NAME       Model name (overrides POKELIKE_MODEL env var)
  --base-url URL     Base URL for llama/openai providers
```

### `analyze.js`

Reads a JSONL results file and prints a strategy analysis report.

```
node analyze.js [options]

  --in FILE    Input JSONL file (default: results/games.jsonl)
  --top N      Number of top entries to show per category (default: 10)
  --json       Output as JSON instead of a human-readable report
```

### `train_model.py`

Trains decision-tree classifiers from game data and saves models to disk.

```
python train_model.py [options]

  --in FILE          Input JSONL file (default: results/games.jsonl)
  --out DIR          Output directory for models (default: models/)
  --model TYPE       Classifier type: tree (default), forest, gbm
  --max-depth N      Max tree depth (default: 5)
  --min-samples N    Min samples per leaf — higher = less overfitting (default: 20)
```

### `play_model.js`

Plays games using the trained model. Falls back to heuristics for decision types with no model.

```
node play_model.js [options]

  --games N       Number of games to play (default: 1000)
  --seed N        Starting RNG seed (default: 1)
  --out FILE      Output JSONL file (default: results/model_games.jsonl)
  --models DIR    Directory containing model JSON files (default: models/)
  --parallel N    Concurrent games (default: 4)
  --verbose       Print each game result
```

---

## Results file format

Each line of a JSONL results file is one complete game:

```jsonc
{
  "seed": 42,
  "outcome": "win",        // "win" | "loss" | "error"
  "mapsCleared": 9,        // 0–9; 9 means full win (all gyms + Elite Four)
  "eliteDefeated": 3,      // only present on loss during Elite Four
  "finalTeam": [
    {
      "name": "Charizard",
      "species": 6,
      "level": 54,
      "hp": "201/201",
      "types": ["Fire", "Flying"],
      "bst": 534,
      "item": "Life Orb",
      "moveTier": 2
    }
    // up to 6 entries
  ],
  "decisions": [
    {
      "type": "starter",
      "choice": 1,          // 0-based index of the chosen option
      "features": {         // extracted game-state features at decision time
        "map": 0,
        "badges": 0,
        "teamSize": 0,
        "avgBST": 0,
        "starterType": "Fire",
        "starterBST": 309
        // ... more features
      },
      "reason": "Charmander has the best offensive typing for early maps"
    }
    // one entry per decision made during the run
  ],
  "elapsedMs": 8400,
  "apiCalls": 18,           // absent for random/model agents
  "timestamp": "2026-05-14T12:00:00.000Z"
}
```

---

## Decision points

These are the moments where the agent is asked to choose:

| Type | When it occurs | What the agent picks |
|------|----------------|----------------------|
| `starter` | Start of every run | One of 3 starter Pokémon (Bulbasaur / Charmander / Squirtle) |
| `branch` | Every map layer (6 layers per map) | One of 2–4 accessible nodes |
| `catch` | Catch node | One of 3 offered Pokémon, or skip |
| `swap` | Catch node when team is full (6) | Which team member to release |
| `item` | Item node | One of 3 offered items, or skip |
| `item_assign` | After taking a held item | Which Pokémon to give it to, or put in bag |
| `move_tutor` | Move tutor node | Which Pokémon gets a move power upgrade |
| `trade` | Trade node | Which Pokémon to trade away, or skip |
| `evolve_branch` | After levelling up (Eevee etc.) | Which evolution path to take |

---

## Game mechanics summary

Knowing these helps interpret the analysis output:

**Maps:** 8 gym maps (Route 1 → Victory Road) + Elite Four. Each map is a layered graph; you traverse 6 content layers before reaching the gym leader boss.

**Team:** Starts at size 1, grows to a maximum of 6 as you add Pokémon. All 6 slots fight sequentially in battles (the next Pokémon enters when the current one faints).

**Battles:** Fully deterministic given the team and enemy. Speed determines turn order. Each Pokémon uses its single best move (selected by type and stat orientation). Battles run automatically — you choose the *team composition*, not individual moves.

**Gym leaders** (hardcoded teams, increasing difficulty):

| Map | Gym leader | Type | Approx. level |
|-----|-----------|------|---------------|
| 0 | Brock | Rock/Ground | 12–14 |
| 1 | Misty | Water/Psychic | 18–20 |
| 2 | Lt. Surge | Electric | 20–25 |
| 3 | Erika | Grass/Poison | 26–32 |
| 4 | Koga | Poison | 38–44 |
| 5 | Sabrina | Psychic | 40–44 |
| 6 | Blaine | Fire | 47–53 |
| 7 | Giovanni | Ground | 53–60 |
| 8 | Elite Four × 4 + Champion | Mixed | 53–64 |

**BST (base stat total):** Sum of a Pokémon's 6 base stats. Higher = stronger. Wild Pokémon available in later maps have higher BSTs (controlled by `MAP_BST_RANGES`).

**Move tiers:** Each Pokémon has one move, selected from a tier pool per type:
- Tier 0: weak moves (~40–60 power) — early maps
- Tier 1: standard moves (~65–100 power) — mid maps
- Tier 2: powerful moves (~110–150 power) — late maps

Move tutor nodes increase a Pokémon's tier by 1.

**Held items:** One item per Pokémon. Strong ones: Life Orb (+30% damage, −10% HP/turn), Choice Band/Specs (+40% physical/special damage), Shell Bell (heals 15% of damage dealt), Leftovers (+10% HP/turn), Scope Lens (+crit rate).

---

## Environment variables

| Variable | Used by | Default | Description |
|----------|---------|---------|-------------|
| `ANTHROPIC_API_KEY` | `run_games.js` | — | Anthropic API key (required for `--provider anthropic`) |
| `POKELIKE_MODEL` | `run_games.js` | `claude-haiku-4-5-20251001` | Claude model override |
| `LLAMA_BASE_URL` | `run_games.js` | `http://localhost:8080/v1` | llama-cpp server URL |
| `OPENAI_API_KEY` | `run_games.js` | `none` | API key for openai-compat provider |
| `OPENAI_BASE_URL` | `run_games.js` | — | Base URL for openai-compat provider |
