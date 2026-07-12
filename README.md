# CubScoutAdventureScope
Website to cross reference Cub Scout Adventures across ranks.

## Features

- **Keyword/tag cloud filtering** — pick one or more generic adventures descriptions
  or tags and the list narrows to matching requirements across all ranks.
  Tags are hierarchical (e.g. `camp` → `camp-overnight`); child tags are
  collapsed under their parent until expanded (via the `+N` toggle, or
  automatically when you select a child tag directly).
- **Rank filter** — show/hide individual ranks (Lion through Arrow of Light)
  independent of the keyword filter.
- **STEM Nova award callouts** — adventures that count toward a Nova Award
  show a popover linking to the award's official PDF.
- **Shareable views** — the current keyword/rank selection is encoded into
  the URL query string, with "Copy URL" and a live QR code for sharing a
  filtered view (e.g. printing a den's exact set of requirements).
- **Offline-capable / installable** — a service worker caches the app for
  offline use and it's installable as a PWA (`manifest.json`), with an
  in-app banner when a new version is deployed.

## Data & how to refine it

All adventure/requirement content lives in [data/](data/) as YAML, separate
from the app code:

- `data/adventure.yml` — the list of ranks (in display order) and the
  catalog of STEM Nova Awards (`name`, `category`, `url`).
- `data/ranks/*.yml` — one file per rank (`lion.yml`, `tiger.yml`, `wolf.yml`,
  `bear.yml`, `webelos.yml`, `aol.yml`), each with `rank`, `grade`, `url`,
  and an `adventure_list` of adventures. Each adventure has a `name`,
  `url`, `required` flag, optional `alternate_name`, and a list of
  `requirements`, each with a `name`, `description`, and `tags`.

To refine or extend content:

- Add/edit requirements or adventures directly in the relevant
  `data/ranks/*.yml` file.
- Tag requirements generously — tags represent *options* a den leader could
  use to satisfy an open-ended requirement, not just what's explicitly named.
  For example, the Lion requirement "choose a job that will help your
  family" (`data/ranks/lion.yml`) doesn't mention cooking, but making a meal
  is a valid job choice, so it's tagged `food-prep-meal` — a leader looking
  across ranks for requirements an activity like meal prep could satisfy
  should find it by filtering on that tag.
- Every push is checked by the `Validate YAML` GitHub Action; a syntax error
  in any `data/**/*.yml` file will fail the run.

## Working on the project

This is a static site (HTML/CSS/JS) that reads its content from YAML files in
[data/](data/) at runtime. There's no required tooling — you can edit
`main.js`, `styles.css`, and `data/**/*.yml` directly and open `index.html`
in a browser to see your changes.

### Optional: Ruby/Jekyll + VSCode

The site is deployed via GitHub Pages, which builds it with Jekyll. If you
want a local preview that matches production exactly (including the
Liquid-templated build-revision/cache-busting bits in `index.html`), the
repo has that wired up as a convenience — it's not required:

- Install the recommended **Shopify Liquid** extension
  (`sissel.shopify-liquid`) for syntax highlighting of `index.html`'s Liquid
  tags. It also highlights the `{{ }}` / `{% %}` inside the `{% raw %}`
  block — that's actually Ractive template syntax, not Liquid (`raw` only
  affects Jekyll's build-time processing, not the editor), but the
  highlighting is still useful there.
- One-time: `bundle install` (uses the Ruby version pinned in
  `.ruby-version` via chruby).
- Then **Terminal → Run Task → Jekyll: serve** starts `bundle exec jekyll
  serve`, rebuilding on file changes and opening the site in your browser.
