# skainet-docs-ui

Antora UI bundle for every SKaiNET documentation site
(mainline `SKaiNET`, `SKaiNET-transformers`, future siblings).

Forked from
[`antora/antora-ui-default`](https://gitlab.com/antora/antora-ui-default)
and rebranded with the SKaiNET design system: Orbitron + Inter
+ Fira Code typography, the SKaiNET red palette, light/dark
theme toggle (with `prefers-color-scheme` fallback and
`localStorage` persistence), and small aesthetic touches
inspired by [structured-coroutines-docs](https://santimattius.github.io/structured-coroutines-docs/).

## Use it from a SKaiNET docs site

In the consuming repo's `docs/antora-playbook.yml`:

```yaml
ui:
  bundle:
    url: https://github.com/SKaiNET-developers/skainet-docs-ui/releases/download/v1.0.0/ui-bundle.zip
    snapshot: true
```

Pin to a specific tag (`vX.Y.Z`) for reproducible builds. Use
`releases/latest/download/ui-bundle.zip` if you want floating
updates.

## Build locally

```bash
npm ci
npx gulp bundle           # → build/ui-bundle.zip
npx gulp preview          # → live-reload demo at http://localhost:5252
```

The `preview` task serves a tiny demo site under `preview-src/`
so you can iterate on CSS without rebuilding a full Antora site.

## Layout

```
src/
├── css/                  # PostCSS sources (no SCSS)
│   ├── vars.css          # SKaiNET palette as CSS custom properties
│   ├── typography.css    # Orbitron + Inter + Fira Code
│   └── ...
├── img/                  # logo, favicon, icons
├── js/
│   ├── 01-theme-toggle.js  # dark mode toggle (FOUC-safe)
│   └── ...
├── partials/             # Handlebars chrome (header, nav, toc, footer)
├── layouts/              # default.hbs (three-column), 404.hbs
└── helpers/              # Handlebars helpers
```

The `vars.css` file is the single source of color truth. Every
other stylesheet uses `var(--color-*)` exclusively — no
hard-coded hex values — so light/dark mode swaps cleanly via
the `[data-theme="dark"]` attribute on `<html>`.

## Release

Tag a new version, push to `main`. The `release.yml` workflow
builds `build/ui-bundle.zip` and uploads it as a GitHub Release
asset. Consumers either pin to the new tag or float on
`releases/latest/`.

```bash
git tag -a v1.0.0 -m "v1.0.0 — SKaiNET-branded Antora UI"
git push origin v1.0.0
```

## License

MIT, matching mainline SKaiNET. See `LICENSE`. Upstream
`antora/antora-ui-default` is MPL-2.0; the rebranded fork
re-licenses under MIT for consistency with the rest of the
SKaiNET org.
