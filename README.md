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
1. `about:debugging#/runtime/this-firefox` → `Load Temporary Add-on…` → `manifest.json`
2. Or `npx web-ext run`

### Signed (unlisted)
Signed `.xpi` in [`web-ext-artifacts/`](web-ext-artifacts/) — `about:addons` → gear → `Install Add-on From File…`

### AMO (listed — pending review)
Upload `web-ext-artifacts/bang_search-0.1.0.zip` to https://addons.mozilla.org/developers/addon/submit/distribution (MIT license)

## Structure

```
manifest.json              MV3 (gecko.id: bangs-search@ff-extension.local, min 142)
src/background/background.js  fetch/cache, contextMenus, alarms, SEARCH/GET_BANGS
src/lib/bangs.js              normalizeBang, buildSearchUrl, rankBangs, FALLBACK_BANGS
src/content/content.js        Shadow DOM palette, header (selected text), input (bang search)
src/content/picker.css        host wrapper only (main CSS inline for isolation)
src/options/*                 stats, lastUpdate, recentBangs, refresh
icons/icon-{48,96,128}.png   blue ! glyph
```

## Development

```powershell
npx web-ext lint
npx web-ext build --overwrite-dest
npx web-ext sign --channel=unlisted  # needs WEB_EXT_API_KEY/SECRET in env (persona-chat/.env)
```

## AMO Publishing

- Uses `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET` from `persona-chat/.env` (or `~/.web-ext-config`)
- Unlisted signing succeeds without license; listed requires MIT (`--amo-metadata` with `version.license` or manual upload)
- Signed artifact: `web-ext-artifacts/e81389e7dc61431ea826-0.1.0.xpi`

## License

MIT © 2026 Cenk Tekin — https://github.com/cenktekin/bang-search-ff
