#!/usr/bin/env python3
"""
train_model.py

Trains a small, interpretable model that can play Pokelike to win.

Reads JSONL game results (from run_games.js) and trains per-decision-type
classifiers that predict P(win | game_state, choice).

At inference time, the model scores all available choices and picks the one
with highest P(win) — no LLM required, runs instantly.

Outputs:
  models/model_<type>.json  — serialised decision-tree rules (human-readable)
  models/model_<type>.pkl   — scikit-learn model (for play_model.js via subprocess)
  models/feature_importance.json
  models/report.txt

Usage:
  python train_model.py [--in results/games.jsonl] [--out models/]
                        [--max-depth 5] [--min-samples 20]
"""

import argparse
import json
import os
import sys
import pickle
from collections import defaultdict
from pathlib import Path

try:
    import numpy as np
    from sklearn.tree import DecisionTreeClassifier, export_text
    from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
    from sklearn.preprocessing import LabelEncoder
    from sklearn.model_selection import cross_val_score
    from sklearn.metrics import classification_report
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False
    print("WARNING: scikit-learn not found. Install with: pip install scikit-learn numpy")
    print("Falling back to rule-based statistics only.\n")


# ─── CLI ──────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('--in',       default='results/games.jsonl', dest='input')
    p.add_argument('--out',      default='models')
    p.add_argument('--max-depth', type=int, default=5)
    p.add_argument('--min-samples', type=int, default=20,
                   help='Min samples per leaf (prevents overfitting)')
    p.add_argument('--model',    choices=['tree','forest','gbm'], default='tree')
    return p.parse_args()


# ─── Load data ─────────────────────────────────────────────────────────────────

def load_games(path):
    games = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                games.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return games


# ─── Feature engineering ──────────────────────────────────────────────────────

ALL_TYPES = ['Normal','Fire','Water','Electric','Grass','Ice',
             'Fighting','Poison','Ground','Flying','Psychic','Bug',
             'Rock','Ghost','Dragon','Dark','Steel']

# Columns used per decision type
FEATURE_COLS = {
    'starter': ['map','badges','avgBST','starterBST','typesCovered',
                'starterType_enc'],
    'branch':  ['map','badges','teamSize','avgHpRatio','avgBST',
                'itemCount','teamWithItems','typesCovered',
                'chosenNodeType_enc'],
    'catch':   ['map','badges','teamSize','avgHpRatio','avgBST',
                'typesCovered','skipped','catchedBST','isNewType',
                'catchedType_enc'],
    'item':    ['map','badges','teamSize','avgHpRatio','avgBST',
                'typesCovered','skipped','itemName_enc'],
    'item_assign': ['map','badges','teamSize','avgHpRatio','avgBST',
                    'typesCovered'],
    'move_tutor':  ['map','badges','teamSize','avgHpRatio','avgBST'],
    'trade':       ['map','badges','teamSize','avgHpRatio','avgBST'],
}

def encode_categoricals(records, col):
    """Label-encode a categorical column in-place. Returns encoder."""
    vals = [r.get(col, 'unknown') for r in records]
    le = LabelEncoder()
    encoded = le.fit_transform(vals)
    enc_col = col + '_enc'
    for r, v in zip(records, encoded):
        r[enc_col] = int(v)
    return le


def collect_samples(games, decision_type):
    """Extract (features_dict, label) samples for a given decision type."""
    samples = []
    for g in games:
        label = 1 if g.get('outcome') == 'win' else 0
        for d in g.get('decisions', []):
            if d.get('type') != decision_type:
                continue
            f = d.get('features') or {}
            samples.append({**f, '_label': label})
    return samples


def build_matrix(samples, feature_cols):
    """Convert list of feature dicts to numpy X, y."""
    X, y = [], []
    for s in samples:
        row = [float(s.get(c, 0)) for c in feature_cols]
        X.append(row)
        y.append(s['_label'])
    return np.array(X), np.array(y)


# ─── Rule extraction from decision tree ───────────────────────────────────────

def tree_to_rules(clf, feature_names, class_names=('loss','win')):
    """Return the decision tree as human-readable text rules."""
    return export_text(clf, feature_names=list(feature_names), max_depth=10)


def feature_importance_dict(clf, feature_names):
    imp = clf.feature_importances_
    return dict(sorted(
        zip(feature_names, imp.tolist()),
        key=lambda x: -x[1]
    ))


# ─── Rule-based fallback (no scikit-learn) ────────────────────────────────────

def rule_based_stats(games, decision_type, top_n=10):
    """Compute win rate per discrete choice value, no ML needed."""
    from collections import Counter
    samples = collect_samples(games, decision_type)
    groups = defaultdict(lambda: {'wins': 0, 'total': 0})

    # Choose the most informative grouping key per decision type
    key_map = {
        'starter':   'starterType',
        'branch':    'chosenNodeType',
        'catch':     'catchedType',
        'item':      'itemName',
    }
    key = key_map.get(decision_type, 'choice')

    for s in samples:
        v = str(s.get(key, '?'))
        groups[v]['total'] += 1
        groups[v]['wins']  += s['_label']

    rows = [
        {
            key: k,
            'wins': v['wins'],
            'total': v['total'],
            'win_rate': v['wins'] / v['total'] if v['total'] else 0,
        }
        for k, v in groups.items()
        if v['total'] >= 3
    ]
    return sorted(rows, key=lambda r: -r['win_rate'])[:top_n]


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()

    games = load_games(args.input)
    if not games:
        print(f"No games found in {args.input}")
        sys.exit(1)

    total = len(games)
    wins  = sum(1 for g in games if g.get('outcome') == 'win')
    print(f"Loaded {total} games  |  Win rate: {100*wins/total:.1f}%")

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    report_lines = [
        f"Pokelike Model Training Report",
        f"Games: {total}  Win rate: {100*wins/total:.1f}%",
        f"Model type: {args.model}  Max depth: {args.max_depth}",
        "",
    ]

    all_importances = {}
    all_rules = {}

    decision_types = ['starter', 'branch', 'catch', 'item']

    for dtype in decision_types:
        print(f"\n{'─'*50}")
        print(f"Decision type: {dtype.upper()}")

        samples = collect_samples(games, dtype)
        if len(samples) < 10:
            print(f"  Not enough samples ({len(samples)}), skipping.")
            continue

        # Rule-based stats (always)
        rb = rule_based_stats(games, dtype, top_n=15)
        print(f"  Samples: {len(samples)}")
        print(f"  Rule-based stats (top choices by win rate):")
        for r in rb[:8]:
            key = list(r.keys())[0]
            print(f"    {str(r[key]):20s}  wr={100*r['win_rate']:.1f}%  n={r['total']}")

        report_lines.append(f"--- {dtype.upper()} ({len(samples)} samples) ---")
        for r in rb:
            key = list(r.keys())[0]
            report_lines.append(f"  {str(r[key]):20s}  wr={100*r['win_rate']:.1f}%  n={r['total']}")
        report_lines.append("")

        if not HAS_SKLEARN:
            continue

        # Categorical encoding
        cat_cols = {
            'starter': ['starterType'],
            'branch':  ['chosenNodeType'],
            'catch':   ['catchedType'],
            'item':    ['itemName'],
        }
        encoders = {}
        for col in cat_cols.get(dtype, []):
            encoders[col] = encode_categoricals(samples, col)

        feature_cols = [c for c in FEATURE_COLS.get(dtype, []) if c in samples[0] or c.endswith('_enc')]
        # Only keep cols that actually exist in at least one sample
        feature_cols = [c for c in feature_cols if any(c in s for s in samples)]

        if len(feature_cols) < 2:
            print(f"  Not enough features, skipping ML for {dtype}.")
            continue

        X, y = build_matrix(samples, feature_cols)
        pos_rate = y.mean()
        print(f"  Class balance: {100*pos_rate:.1f}% wins")

        if y.sum() < 5 or (len(y) - y.sum()) < 5:
            print("  Imbalanced — skipping ML.")
            continue

        # Train model
        if args.model == 'forest':
            clf = RandomForestClassifier(
                n_estimators=100, max_depth=args.max_depth,
                min_samples_leaf=args.min_samples, random_state=42,
                class_weight='balanced',
            )
        elif args.model == 'gbm':
            clf = GradientBoostingClassifier(
                n_estimators=100, max_depth=args.max_depth,
                min_samples_leaf=args.min_samples, random_state=42,
            )
        else:  # tree (default — most interpretable)
            clf = DecisionTreeClassifier(
                max_depth=args.max_depth,
                min_samples_leaf=args.min_samples,
                random_state=42,
                class_weight='balanced',
            )

        clf.fit(X, y)

        # Cross-validation accuracy
        if len(X) >= 20:
            cv_scores = cross_val_score(clf, X, y, cv=min(5, len(X)//4), scoring='accuracy')
            print(f"  CV accuracy: {cv_scores.mean():.3f} ± {cv_scores.std():.3f}")
            report_lines.append(f"  CV accuracy: {cv_scores.mean():.3f} ± {cv_scores.std():.3f}")

        # Feature importance
        imp = feature_importance_dict(clf, feature_cols)
        all_importances[dtype] = imp
        print(f"  Top features: {list(imp.items())[:5]}")
        report_lines.append(f"  Top features: {list(imp.items())[:5]}")

        # Decision rules (only for tree)
        if args.model == 'tree':
            rules = tree_to_rules(clf, feature_cols)
            all_rules[dtype] = rules
            # Print a short version
            rule_lines = rules.split('\n')[:20]
            print(f"  Rules (first 20 lines):\n" + '\n'.join('    ' + l for l in rule_lines))
            report_lines.append(f"  Decision rules:\n{rules}")
            report_lines.append("")

        # Save serialised model
        model_path = out_dir / f"model_{dtype}.pkl"
        with open(model_path, 'wb') as f:
            pickle.dump({
                'clf': clf,
                'feature_cols': feature_cols,
                'encoders': {k: v.classes_.tolist() for k, v in encoders.items()},
                'dtype': dtype,
            }, f)
        print(f"  Saved model to {model_path}")

    # Save importances
    imp_path = out_dir / 'feature_importance.json'
    with open(imp_path, 'w') as f:
        json.dump(all_importances, f, indent=2)
    print(f"\nFeature importances saved to {imp_path}")

    # Save rules
    rules_path = out_dir / 'decision_rules.json'
    with open(rules_path, 'w') as f:
        json.dump(all_rules, f, indent=2)

    # Write report
    report_path = out_dir / 'report.txt'
    with open(report_path, 'w') as f:
        f.write('\n'.join(report_lines))
    print(f"Report saved to {report_path}")

    # ── Also save a portable JSON model for use in play_model.js ─────────────
    # For each decision type, save the tree thresholds as a flat JSON so
    # the Node.js player can use it without spawning Python.
    if HAS_SKLEARN:
        for dtype in decision_types:
            pkl_path = out_dir / f"model_{dtype}.pkl"
            if not pkl_path.exists():
                continue
            with open(pkl_path, 'rb') as f:
                bundle = pickle.load(f)
            clf = bundle['clf']
            if not hasattr(clf, 'tree_'):
                continue  # not a DT

            t = clf.tree_
            json_model = {
                'dtype': dtype,
                'feature_cols': bundle['feature_cols'],
                'encoders': bundle['encoders'],
                'n_node_samples': t.n_node_samples.tolist(),
                'children_left':  t.children_left.tolist(),
                'children_right': t.children_right.tolist(),
                'feature':        t.feature.tolist(),
                'threshold':      t.threshold.tolist(),
                'value':          t.value.tolist(),   # shape [n, 1, n_classes]
                'n_classes':      int(clf.n_classes_),
            }
            jm_path = out_dir / f"model_{dtype}.json"
            with open(jm_path, 'w') as f:
                json.dump(json_model, f)
            print(f"JSON model saved to {jm_path}")

    print(f"\nDone.  Models in: {out_dir}/")


if __name__ == '__main__':
    main()
