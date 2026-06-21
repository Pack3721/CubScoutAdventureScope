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
