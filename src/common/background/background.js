// Bang Search — background service worker.
//
// Responsibilities:
//   - Fetch + cache the ~13k DuckDuckGo bangs in storage.local
//   - Create the "Bang ile ara" context menu on text selection
//   - Serve bangs (registry + user-defined) to the picker (GET_BANGS)
//   - Open search URLs (SEARCH) and track recent bangs
//   - Open the picker without a selection via the keyboard command
//   - Refresh bangs daily via alarms (REFRESH_BANGS / onAlarm)

"use strict";

// Firefox exposes the promise-based `browser` API; fall back to `chrome` elsewhere.
const api = typeof browser !== "undefined" ? browser : chrome;

// Load shared bang helpers. Firefox lists lib/bangs.js in background.scripts
// (classic script scope, no importScripts); Chrome's service worker uses
// importScripts to pull the same single source of truth.
if (
  typeof importScripts === "function" &&
  (typeof self === "undefined" || !self.BangLib)
) {
  try {
    importScripts("../lib/bangs.js");
  } catch (err) {
    console.error("[Bang Search] Failed to load ../lib/bangs.js:", err);
  }
}

const BangLib = (typeof self !== "undefined" && self.BangLib) || {};
if (typeof BangLib.buildSearchUrl !== "function") {
  console.error(
    "[Bang Search] lib/bangs.js is missing; search and ranking will not work."
  );
}

const BANG_URLS = [
  "https://duckduckgo.com/bang.js",
  "https://raw.githubusercontent.com/zmwangx/ddg-bangs/master/data/bangs.json",
  "https://raw.githubusercontent.com/kagisearch/bangs/main/data/bangs.json",
];

const STALE_MS = 24 * 60 * 60 * 1000; // 24 hours
const RECENT_LIMIT = 10;
const MENU_ID = "bang-search";
const ALARM_NAME = "refreshBangs";
const PICKER_COMMAND = "open-bang-picker";

// In-memory cache so menu clicks / messages don't hit storage every time.
let cachedBangs = null;

/* ------------------------------------------------------------------ */
/* Bang fetching & caching                                             */
/* ------------------------------------------------------------------ */

async function fetchBangs() {
  let lastErr = null;
  for (const url of BANG_URLS) {
    try {
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} ${resp.statusText} from ${url}`);
      }
      let data = await resp.json();
      if (!Array.isArray(data)) {
        if (data && Array.isArray(data.bangs)) data = data.bangs;
        else if (data && Array.isArray(data.data)) data = data.data;
        else if (data && typeof data === "object") {
          const vals = Object.values(data);
          const maybeArr = vals.find((v) => Array.isArray(v));
          if (maybeArr) data = maybeArr;
          else throw new Error(`Unexpected payload from ${url}: expected a JSON array`);
        } else {
          throw new Error(`Unexpected payload from ${url}: expected a JSON array`);
        }
      }
      const bangs = data.map(BangLib.normalizeBang).filter(Boolean);
      if (bangs.length === 0) {
        throw new Error(`No valid bangs parsed from ${url}`);
      }
      console.log(`[Bang Search] Fetched ${bangs.length} bangs from ${url}`);
      return bangs;
    } catch (err) {
      lastErr = err;
      console.warn(`[Bang Search] Source failed (${url}):`, err.message || err);
    }
  }
  throw lastErr || new Error("All bang sources failed");
}

async function getCachedBangs() {
  if (cachedBangs && cachedBangs.length > 0) return cachedBangs;

  try {
    const stored = await api.storage.local.get(["bangs", "lastUpdate"]);
    const now = Date.now();
    const stale = !stored.lastUpdate || now - Number(stored.lastUpdate) > STALE_MS;

    if (Array.isArray(stored.bangs) && stored.bangs.length > 0 && !stale) {
      cachedBangs = stored.bangs;
      return cachedBangs;
    }

    const fresh = await fetchBangs();
    cachedBangs = fresh;
    await api.storage.local.set({ bangs: fresh, lastUpdate: now });
    return fresh;
  } catch (err) {
    console.error("[Bang Search] getCachedBangs failed:", err);
    try {
      const stored = await api.storage.local.get("bangs");
      if (Array.isArray(stored.bangs) && stored.bangs.length > 0) {
        cachedBangs = stored.bangs;
        return cachedBangs;
      }
    } catch (storageErr) {
      console.warn(
        "[Bang Search] Could not read cached bangs:",
        (storageErr && storageErr.message) || storageErr
      );
    }
    if (BangLib.FALLBACK_BANGS && BangLib.FALLBACK_BANGS.length > 0) {
      cachedBangs = BangLib.FALLBACK_BANGS;
      return cachedBangs;
    }
    return [];
  }
}

async function cacheBangs(bangs) {
  cachedBangs = bangs;
  await api.storage.local.set({ bangs, lastUpdate: Date.now() });
}

async function getCustomBangs() {
  try {
    const stored = await api.storage.local.get("customBangs");
    return Array.isArray(stored.customBangs) ? stored.customBangs : [];
  } catch (err) {
    console.warn(
      "[Bang Search] Could not read custom bangs:",
      (err && err.message) || err
    );
    return [];
  }
}

/** Registry + user-defined bangs, custom entries first. */
async function getEffectiveBangs() {
  const registry = cachedBangs || (await getCachedBangs());
  const custom = await getCustomBangs();
  return BangLib.mergeBangs ? BangLib.mergeBangs(registry, custom) : registry;
}

/* ------------------------------------------------------------------ */
/* Context menu                                                        */
/* ------------------------------------------------------------------ */

async function ensureContextMenu() {
  try {
    await api.contextMenus.removeAll();
    await api.contextMenus.create({
      id: MENU_ID,
      title: 'Bang ile ara "%s"',
      contexts: ["selection"],
    });
    console.log("[Bang Search] Context menu created.");
  } catch (err) {
    console.error("[Bang Search] Failed to create context menu:", err);
  }
}

async function getActiveTab() {
  const tabs = await api.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0] ? tabs[0] : null;
}

async function openPicker(query) {
  const tab = await getActiveTab();
  if (!tab || tab.id == null) return;

  const bangs = await getEffectiveBangs();
  try {
    await api.tabs.sendMessage(tab.id, {
      type: "OPEN_PICKER",
      query: String(query == null ? "" : query),
      bangs,
    });
  } catch (err) {
    // Content script not injected on this page (about:, PDF viewer, etc.).
    console.warn(
      "[Bang Search] Content script unreachable; picker not shown:",
      (err && err.message) || err
    );
  }
}

api.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info || info.menuItemId !== MENU_ID) return;
  try {
    const query = String(info.selectionText || "").trim();
    if (!query) return;

    const bangs = await getEffectiveBangs();
    const targetTab = tab || (await getActiveTab());
    if (!targetTab || targetTab.id == null) return;

    try {
      await api.tabs.sendMessage(targetTab.id, {
        type: "OPEN_PICKER",
        query,
        bangs,
      });
    } catch (err) {
      console.warn(
        "[Bang Search] Content script unreachable; picker not shown:",
        (err && err.message) || err
      );
    }
  } catch (err) {
    console.error("[Bang Search] contextMenus.onClicked error:", err);
  }
});

/* ------------------------------------------------------------------ */
/* Keyboard command                                                    */
/* ------------------------------------------------------------------ */

if (api.commands && api.commands.onCommand) {
  api.commands.onCommand.addListener((command) => {
    if (command !== PICKER_COMMAND) return;
    openPicker("").catch((err) =>
      console.error("[Bang Search] Command failed:", err)
    );
  });
}

/* ------------------------------------------------------------------ */
/* Messaging                                                           */
/* ------------------------------------------------------------------ */

async function recordRecentBang(bangT) {
  try {
    const stored = await api.storage.local.get("recentBangs");
    const recent = Array.isArray(stored.recentBangs) ? stored.recentBangs : [];
    const next = [bangT, ...recent.filter((t) => t !== bangT)].slice(
      0,
      RECENT_LIMIT
    );
    await api.storage.local.set({ recentBangs: next });
  } catch (err) {
    console.error("[Bang Search] Failed to update recentBangs:", err);
  }
}

async function handleMessage(message) {
  if (!message || typeof message !== "object") {
    return { error: "Invalid message" };
  }

  switch (message.type) {
    case "GET_BANGS": {
      const bangs = await getEffectiveBangs();
      return { bangs };
    }

    case "SEARCH": {
      const bangT = String(message.bangT || "");
      const query = String(message.query == null ? "" : message.query);
      const bangs = await getEffectiveBangs();
      const bang =
        bangs.find((b) => b.t === bangT) ||
        bangs.find((b) => b.t.toLowerCase() === bangT.toLowerCase());
      if (!bang) {
        return { error: `Unknown bang: ${bangT}` };
      }
      const url = BangLib.buildSearchUrl(bang, query);
      await api.tabs.create({ url });
      await recordRecentBang(bang.t);
      return { url };
    }

    case "REFRESH_BANGS": {
      // Only the fetched registry is replaced; customBangs live in their own key.
      const fresh = await fetchBangs();
      await cacheBangs(fresh);
      return { count: fresh.length };
    }

    default:
      return { error: `Unknown message type: ${message.type}` };
  }
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((err) => {
      console.error("[Bang Search] Message handler error:", err);
      sendResponse({ ok: false, error: String((err && err.message) || err) });
    });
  return true; // keep the message channel open for the async response
});

/* ------------------------------------------------------------------ */
/* Alarms                                                              */
/* ------------------------------------------------------------------ */

api.alarms.onAlarm.addListener((alarm) => {
  if (!alarm || alarm.name !== ALARM_NAME) return;
  fetchBangs()
    .then((fresh) => cacheBangs(fresh))
    .then(() => console.log("[Bang Search] Bangs refreshed via alarm."))
    .catch((err) => console.error("[Bang Search] Alarm refresh failed:", err));
});

/* ------------------------------------------------------------------ */
/* Startup                                                             */
/* ------------------------------------------------------------------ */

async function init() {
  // Create the menu immediately; never block it on the network fetch.
  const menuPromise = ensureContextMenu();
  const bangsPromise = getCachedBangs().catch((err) => {
    console.error("[Bang Search] Initial bang load failed:", err);
    return [];
  });
  await Promise.allSettled([menuPromise, bangsPromise]);

  try {
    await api.alarms.create(ALARM_NAME, { periodInMinutes: 1440 });
  } catch (err) {
    console.error("[Bang Search] Failed to create refresh alarm:", err);
  }
}

// Re-create the menu after install/update (Firefox may drop it).
api.runtime.onInstalled.addListener(() => {
  ensureContextMenu().catch((err) =>
    console.error("[Bang Search] onInstalled menu error:", err)
  );
});

init();
