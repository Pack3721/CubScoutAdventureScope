# Claude Code Instructions

## After editing rank YAML files

Always validate YAML syntax after editing any file in `data/ranks/`:

```bash
python3 -c "
import yaml, sys
files = ['data/ranks/lion.yml','data/ranks/tiger.yml','data/ranks/wolf.yml','data/ranks/bear.yml','data/ranks/webelos.yml','data/ranks/aol.yml']
for f in files:
    try:
        with open(f) as fh:
            yaml.safe_load(fh)
        print(f'OK: {f}')
    except yaml.YAMLError as e:
        print(f'ERROR: {f}: {e}')
        sys.exit(1)
"
```

Fix any errors before committing. Common pitfalls:
- Apostrophes inside single-quoted YAML strings (e.g. `'R's'`) — use double quotes instead
- Colons inside unquoted values — wrap in quotes

## Tag philosophy

Tags represent **options** for den leaders, not just what a requirement explicitly mandates. If a requirement is open-ended (e.g. "choose a job to help your den"), tag it with every activity that could reasonably satisfy it — a leader filtering by `food-prep-meal` should find that requirement because cooking is one valid job choice.

## Tag conventions

### Parent/child tags
Generally include **both** the parent tag and the child tag when a child applies. Strong consider any case of using a child tag without its parent.

| Parent | Children |
|--------|----------|
| `stem` | `science`, `engineering`, `mathematics`, `technology`, `codes-patterns` |
| `science` | `science-nature`, `science-physical` |
| `camp` | `camp-overnight`, `camp-tent`, `camp-prep` |
| `safety` | `safety-personal`, `safety-fire`, `safety-water` |
| `art` | `art-craft`, `art-draw`, `art-performance` |
| `game` | `game-indoor`, `game-team`, `game-create` |
| `civics` | `civics-flag-ceremony` |
| `conservation` | `conservation-recycle` |
