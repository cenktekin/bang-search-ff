# Bang Search — Firefox

DuckDuckGo **!bangs** for Firefox, with a premium palette. Select any text → right-click → search it instantly on **13k+ sites** — Wikipedia, YouTube, Hepsiburada, Trendyol, GitHub, Stack Overflow...

![License: MIT](https://img.shields.io/badge/license-MIT-blue) ![Firefox](https://img.shields.io/badge/Firefox-142%2B-orange) ![Version](https://img.shields.io/badge/version-0.1.0-green)

## ✨ Features

- **Context menu**: Select `ankara` → right-click → `Bang ile ara "ankara"` → palette
- **Fuzzy bang search**: Type `hepsi` → Hepsiburada (`!hb`), `yt` → YouTube, `w` → Wikipedia, `gh` → GitHub
- **Offline fallback**: 30 popular bangs embedded, never empty even without network
- **Auto-sync**: Fetches `https://duckduckgo.com/bang.js` daily (fallback mirrors: zmwangx/kagisearch), caches in `storage.local`
- **Premium UI**: Shadow DOM palette, compact (480px), dark-mode aware (`prefers-color-scheme`), Raycast-style, `Esc`/click to close, `↑↓` + `Enter` navigation
- **Privacy**: No data collection (`data_collection_permissions: ["none"]`), all local

## Demo

`annapurna` on YouTube → right-click → type `wiki` → Enter → `https://en.wikipedia.org/w/index.php?search=annapurna`

## Install

### Temporary (dev)
1. `about:debugging#/runtime/this-firefox` → `Load Temporary Add-on…` → `dist/firefox/manifest.json` (önce `npm run build:firefox`)
2. Or `npm run start:firefox` / `npm run start:chrome`

### Signed (unlisted)
Signed `.xpi` in [`web-ext-artifacts/`](web-ext-artifacts/) — `about:addons` → gear → `Install Add-on From File…`

### AMO (listed — pending review)
Upload `web-ext-artifacts/bang_search-0.1.0.zip` to https://addons.mozilla.org/developers/addon/submit/distribution (MIT license)

## Structure

```
src/
├── common/                  ← single source of truth
│   ├── background/background.js  fetch/cache, contextMenus, alarms, SEARCH/GET_BANGS
│   ├── lib/bangs.js             normalizeBang, buildSearchUrl, rankBangs, FALLBACK_BANGS
│   ├── content/content.js       Shadow DOM palette, header, input
│   ├── content/picker.css       host wrapper only
│   ├── options/*                stats, lastUpdate, recentBangs, refresh
│   └── icons/icon-{48,96,128}.png blue ! glyph
├── firefox/manifest.json    ← gecko.id: bangs-search@ff-extension.local, background.scripts
└── chrome/manifest.json     ← no gecko, background.service_worker

dist/
├── firefox/                 ← build output (web-ext run/lint buradan)
└── chrome/                  ← build output
```

## Development

```powershell
npm install
npm run build                # src/common + src/{firefox,chrome} -> dist/
npm run build:firefox
npm run build:chrome
npm run start:firefox        # build + web-ext run Firefox
npm run start:chrome         # build + web-ext run Chrome
npm run lint:firefox         # web-ext lint dist/firefox
npm run lint:chrome          # web-ext lint dist/chrome
npm run zip:firefox          # AMO zip -> web-ext-artifacts/
# legacy (root manifest removed):
# npx web-ext run --source-dir dist/firefox
```

## AMO Publishing

- Uses `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET` from `persona-chat/.env` (or `~/.web-ext-config`)
- Unlisted signing succeeds without license; listed requires MIT (`--amo-metadata` with `version.license` or manual upload)
- Signed artifact: `web-ext-artifacts/e81389e7dc61431ea826-0.1.0.xpi`

## License

MIT © 2026 Cenk Tekin — https://github.com/cenktekin/bang-search-ff
