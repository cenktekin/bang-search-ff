# Bang Search — Architecture & Build Guide (post-2026-09-01)

> Previous layout: `manifest.json` + `src/background/`, `src/content/`, `src/lib/`, `src/options/` at mixed depths. No Chrome/Firefox separation, `src/` was overloaded.

## Why the change

Same reasons as `stock-monitor-ff`:

1. **No platform separation** — single `manifest.json` at root was Firefox-only (`browser_specific_settings.gecko`). Chrome needed a different manifest (`service_worker` vs `scripts`, no gecko) but lived in same file — manual swap before each store upload.
2. **Duplicate risk** — any future Chrome port would duplicate `src/` and diverge. Stock-monitor demonstrated the correct pattern (`src/common` + `src/{firefox,chrome}`); we applied it here for consistency across all extension repos.

`one-click-ticktick-firefox` was explicitly excluded (Firefox-only, no split needed).

## What changed (2026-09-01)

```
Before:
  FF-Bangs-Extension/
  ├── manifest.json              (Firefox-only)
  ├── src/background/background.js
  ├── src/content/
  ├── src/lib/
  ├── src/options/
  └── icons/

After:
  FF-Bangs-Extension/
  ├── src/
  │   ├── common/                ← SSOT (background, content, lib, options, icons)
  │   ├── firefox/manifest.json  ← gecko, background.scripts
  │   └── chrome/manifest.json   ← no gecko, background.service_worker
  ├── dist/
  │   ├── firefox/               ← generated (gitignored)
  │   └── chrome/                ← generated (gitignored)
  ├── scripts/build.js           ← src/common + src/{platform}/manifest → dist/{platform}
  ├── package.json               ← added (build/lint/start scripts)
  └── docs/ARCHITECTURE.md       ← this file
```

* `git mv src/* → src/common/*` so history preserved.
* `src/firefox/manifest.json` copied from old root manifest, `background` changed to `background/background.js` (relative to `dist/`), `content_scripts` without `src/` prefix. `src/chrome/manifest.json` created without `gecko` and with `service_worker`.
* `icons/` copied to `src/common/icons/`; root `icons/` kept for backward compat (both exist, canonical is `src/common/icons/`).
* `package.json` was missing — created.

## Future workflow

Always edit `src/common/` and `src/{firefox,chrome}/manifest.json`. Never edit `dist/`.

```bash
npm install

npm run build              # both → dist/
npm run build:firefox
npm run build:chrome

npm run start:firefox      # build + web-ext run Firefox
npm run start:chrome       # build + web-ext run Chrome
npm run lint:firefox       # web-ext lint dist/firefox (0 errors, 1 innerHTML warning expected)
npm run lint:chrome

npm run zip:firefox        # → web-ext-artifacts/
npm run zip:chrome         # → web-ext-artifacts/bang_search-chrome-*.zip
```

Legacy `web-ext run` / `Load Temporary Add-on → manifest.json` (root) no longer works. Load `dist/firefox/manifest.json` after `npm run build:firefox`.

## Notes

* Content script CSS/JS paths in new manifests are without `src/` prefix because `dist/` is flat copy of `src/common/`.
* `one-click-ticktick-firefox` intentionally not split — Firefox-only per decision 2026-09-01.
