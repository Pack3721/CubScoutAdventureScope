# CubScoutAdventureScope
Website to cross reference Cub Scout Adventures across ranks.

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
  tags. Note it also highlights the `{{ }}` / `{% %}` inside the
  `{% raw %}` block, which is actually Ractive template syntax, not Liquid, but is beneficial —
  `raw` only affects Jekyll's build-time processing, not the editor.
- One-time: `bundle install` (uses the Ruby version pinned in
  `.ruby-version` via chruby).
- Then **Terminal → Run Task → Jekyll: serve** starts `bundle exec jekyll
  serve`, rebuilding on file changes and opening the site in your browser.
