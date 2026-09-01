// Bang Search — background service worker.
//
// Responsibilities:
//   - Fetch + cache the ~13k DuckDuckGo bangs in storage.local
//   - Create the "Bang ile ara" context menu on text selection
//   - Serve bangs to the content script (GET_BANGS)
//   - Open search URLs (SEARCH) and track recent bangs
//   - Refresh bangs daily via alarms (REFRESH_BANGS / onAlarm)

"use strict";

// Firefox exposes the promise-based `browser` API; fall back to `chrome` elsewhere.
const api = typeof browser !== "undefined" ? browser : chrome;

// Load shared bang helpers. importScripts resolves relative to this script's URL,
// so ../lib/bangs.js points at src/lib/bangs.js.
try {
  importScripts("../lib/bangs.js");
} catch (err) {
  console.error("[Bang Search] Failed to load ../lib/bangs.js:", err);
}

let BangLib =
  (typeof self !== "undefined" && self.BangLib) ||
  (typeof globalThis !== "undefined" && globalThis.BangLib) ||
  {};
if (!BangLib.normalizeBang) {
  BangLib.normalizeBang = function (raw) {
    if (!raw || typeof raw !== "object") return null;
    const tRaw = raw.t != null ? raw.t : raw.trigger != null ? raw.trigger : raw.id;
    const t = typeof tRaw === "string" ? tRaw.trim() : "";
    if (!t) return null;
    const sRaw = raw.s != null ? raw.s : raw.name != null ? raw.name : raw.title;
    const dRaw = raw.d != null ? raw.d : raw.domain;
    const uRaw = raw.u != null ? raw.u : raw.url != null ? raw.url : raw.template;
    const cRaw = raw.c != null ? raw.c : raw.category;
    const scRaw = raw.sc != null ? raw.sc : raw.subcategory;
    const rRaw = raw.r != null ? raw.r : raw.rank;
    const bang = {
      t,
      s: typeof sRaw === "string" ? sRaw : "",
      d: typeof dRaw === "string" ? dRaw : "",
      u: typeof uRaw === "string" ? uRaw : "",
      c: typeof cRaw === "string" ? cRaw : "",
      sc: typeof scRaw === "string" ? scRaw : "",
    };
    if (typeof rRaw === "number" && Number.isFinite(rRaw)) bang.r = rRaw;
    else if (typeof rRaw === "string" && rRaw.trim() !== "" && Number.isFinite(Number(rRaw))) bang.r = Number(rRaw);
    return bang;
  };
}
if (!BangLib.buildSearchUrl) {
  BangLib.buildSearchUrl = function (bang, query) {
    const encoded = encodeURIComponent(String(query == null ? "" : query));
    if (bang && typeof bang.u === "string" && bang.u.length > 0) {
      return bang.u.replace(/\{\{\{s\}\}\}/g, encoded).replace(/\{\{s\}\}/g, encoded);
    }
    const t = bang && typeof bang.t === "string" ? bang.t : "";
    return `https://duckduckgo.com/?q=!${encodeURIComponent(t)} ${encoded}`;
  };
}
if (!BangLib.FALLBACK_BANGS) {
  BangLib.FALLBACK_BANGS = [
    { t: "w", s: "Wikipedia", d: "wikipedia.org", u: "https://en.wikipedia.org/w/index.php?search={{{s}}}", c: "Reference", r: 1 },
    { t: "wtr", s: "Wikipedia TR", d: "tr.wikipedia.org", u: "https://tr.wikipedia.org/w/index.php?search={{{s}}}", c: "Reference", r: 2 },
    { t: "yt", s: "YouTube", d: "youtube.com", u: "https://www.youtube.com/results?search_query={{{s}}}", c: "Entertainment", r: 3 },
    { t: "gh", s: "GitHub", d: "github.com", u: "https://github.com/search?q={{{s}}}", c: "Tech", r: 4 },
    { t: "so", s: "Stack Overflow", d: "stackoverflow.com", u: "https://stackoverflow.com/search?q={{{s}}}", c: "Tech", r: 5 },
    { t: "hb", s: "Hepsiburada", d: "hepsiburada.com", u: "https://www.hepsiburada.com/ara?q={{{s}}}", c: "Shopping", r: 8 },
    { t: "hepsiburada", s: "Hepsiburada", d: "hepsiburada.com", u: "https://www.hepsiburada.com/ara?q={{{s}}}", c: "Shopping", r: 9 },
    { t: "trendyol", s: "Trendyol", d: "trendyol.com", u: "https://www.trendyol.com/sr?q={{{s}}}", c: "Shopping", r: 10 },
  ];
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
    } catch (_) {}
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

api.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info || info.menuItemId !== MENU_ID) return;
  try {
    const query = String(info.selectionText || "").trim();
    if (!query) return;

    const bangs = cachedBangs || (await getCachedBangs());
    const targetTab = tab || (await getActiveTab());

    if (targetTab && targetTab.id != null) {
      try {
        await api.tabs.sendMessage(targetTab.id, {
          type: "OPEN_PICKER",
          query,
          bangs,
        });
      } catch (err) {
        // Content script not injected on this page (about:, PDF viewer, etc.).
        console.warn(
          "[Bang Search] Content script unreachable; picker not shown:",
          err.message || err
        );
      }
    }
  } catch (err) {
    console.error("[Bang Search] contextMenus.onClicked error:", err);
  }
});

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
      const bangs = cachedBangs || (await getCachedBangs());
      return { bangs };
    }

    case "SEARCH": {
      const bangT = String(message.bangT || "");
      const query = String(message.query == null ? "" : message.query);
      const bangs = cachedBangs || (await getCachedBangs());
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