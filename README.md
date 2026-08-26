# Bang Search (Firefox)

DuckDuckGo-style bang (`!`) shortcuts for Firefox. Type a bang to search your favorite sites instantly.

> **Status:** Scaffold. Background, content, and options logic are placeholders — other agents fill them in.

## Structure

```
manifest.json              MV3 manifest (Firefox)
src/
  background/background.js Background service worker (placeholder)
  content/content.js       Content script — bang picker (placeholder)
  content/picker.css       Picker styles (placeholder)
  lib/bangs.js             Shared bang registry (placeholder)
  options/options.html     Options page (placeholder)
  options/options.js       Options logic (placeholder)
  options/options.css      Options styles (placeholder)
icons/
  icon-48.png / icon-96.png / icon-128.png
```

## Load in Firefox (about:debugging)

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select `manifest.json` in this folder.
4. The extension appears in the list. Use **Reload** after code changes.

> Temporary add-ons are removed when Firefox restarts. For permanent installs, package the
> extension (e.g. `web-ext build`) and install via `about:addons` → gear icon → **Install Add-on From File…**.

## Development

```powershell
# Lint the manifest / extension
npx web-ext lint

# Run a throwaway Firefox instance with the extension loaded
npx web-ext run
```

## Notes

- `manifest_version` is **3** (Firefox 109+).
- `browser_specific_settings.gecko.id` is required for unsigned loading via `about:debugging`.
- Background uses `"service_worker"` for cross-browser parity. Firefox MV3 also accepts
  `"scripts": ["src/background/background.js"]` — switch to that if service-worker
  compatibility issues arise.