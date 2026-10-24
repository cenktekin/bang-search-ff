// Bang Search — shared bang registry and lookup helpers.
//
// Bang object shape (matches DuckDuckGo's bang.js):
//   t  trigger, e.g. "hb"
//   s  site name, e.g. "Hepsiburada"
//   d  domain, e.g. "hepsiburada.com"
//   u  URL template containing {{{s}}} (query placeholder)
//   c  category, e.g. "Shopping"
//   sc subcategory
//   r  popularity rank (lower = more popular)
//
// Loadable from a service worker (importScripts), a classic script, or Node.

(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.BangLib = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  const BANG_KEYS = ["t", "s", "d", "u", "c", "sc", "r"];

  /** True when obj looks like a bang (has a non-empty trigger). */
  function isBang(obj) {
    return (
      !!obj &&
      typeof obj === "object" &&
      typeof obj.t === "string" &&
      obj.t.length > 0
    );
  }

  function normalizeBang(raw) {
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
  }

  /**
   * Build the search URL for a bang.
   * Replaces {{{s}}} (and the {{s}} variant) in bang.u with the encoded query.
   * Falls back to a DuckDuckGo bang redirect when u is missing.
   */
  function buildSearchUrl(bang, query) {
    const encoded = encodeURIComponent(String(query == null ? "" : query));
    if (bang && typeof bang.u === "string" && bang.u.length > 0) {
      return bang.u
        .replace(/\{\{\{s\}\}\}/g, encoded)
        .replace(/\{\{s\}\}/g, encoded);
    }
    const t = bang && typeof bang.t === "string" ? bang.t : "";
    return `https://duckduckgo.com/?q=!${encodeURIComponent(t)} ${encoded}`;
  }

  /**
   * Case-insensitive filter: does this bang match the input at all?
   * Matches against the combined "t s d" string (plus prefix checks).
   */
  function matchesBang(bang, input) {
    const q = String(input == null ? "" : input).trim().toLowerCase();
    if (!q || !isBang(bang)) return false;
    const t = bang.t.toLowerCase();
    const s = String(bang.s || "").toLowerCase();
    const d = String(bang.d || "").toLowerCase();
    return (
      t === q ||
      t.startsWith(q) ||
      s.startsWith(q) ||
      `${t} ${s} ${d}`.includes(q)
    );
  }

  /**
   * Rank bangs against a user input string (case-insensitive).
   * Tiers:
   *   0 — exact trigger match (input === t)
   *   1 — prefix match on trigger or site name (t/s startsWith input)
   *   2 — substring match on combined "t s d c sc"
   * Within a tier, lower bang.r (popularity) sorts first; ties break by
   * shorter trigger, then alphabetical.
   */
  function rankBangs(bangs, input, limit) {
    const q = String(input == null ? "" : input).trim().toLowerCase();
    const max = Number.isFinite(limit) && limit > 0 ? limit : 8;
    if (!q || !Array.isArray(bangs) || bangs.length === 0) return [];

    const scored = [];
    for (const bang of bangs) {
      if (!isBang(bang)) continue;
      const t = bang.t.toLowerCase();
      const s = String(bang.s || "").toLowerCase();
      const d = String(bang.d || "").toLowerCase();
      const c = String(bang.c || "").toLowerCase();
      const sc = String(bang.sc || "").toLowerCase();

      let tier = -1;
      if (t === q) {
        tier = 0;
      } else if (t.startsWith(q) || s.startsWith(q)) {
        tier = 1;
      } else if (`${t} ${s} ${d} ${c} ${sc}`.includes(q)) {
        tier = 2;
      }
      if (tier < 0) continue;

      scored.push({
        bang,
        tier,
        r: typeof bang.r === "number" ? bang.r : Number.MAX_SAFE_INTEGER,
      });
    }

    scored.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.r !== b.r) return a.r - b.r;
      const at = a.bang.t;
      const bt = b.bang.t;
      if (at.length !== bt.length) return at.length - bt.length;
      return at < bt ? -1 : at > bt ? 1 : 0;
    });

    return scored.slice(0, max).map((x) => x.bang);
  }

  /**
   * Validate and normalize a user-defined bang.
   * Returns null when the trigger or URL template is unusable.
   * A leading "!" in the trigger is tolerated ("!sh" -> "sh").
   */
  function normalizeCustomBang(raw) {
    const bang = normalizeBang(raw);
    if (!bang) return null;
    const t = bang.t.replace(/^!+/, "").trim();
    if (!/^[A-Za-z0-9._-]+$/.test(t)) return null;
    if (!/^https?:\/\//i.test(bang.u)) return null;
    if (bang.u.indexOf("{{{s}}}") === -1 && bang.u.indexOf("{{s}}") === -1) {
      return null;
    }
    return { ...bang, t };
  }

  /**
   * Merge user-defined bangs ahead of the fetched registry.
   * Custom entries win on trigger collisions and sort first within a tier
   * (r = -1 never occurs in DuckDuckGo's registry).
   */
  function mergeBangs(registry, custom) {
    const base = Array.isArray(registry) ? registry : [];
    const customList = Array.isArray(custom)
      ? custom.map(normalizeCustomBang).filter(Boolean)
      : [];
    const customTriggers = new Set(customList.map((b) => b.t.toLowerCase()));
    const rest = base.filter(
      (b) => isBang(b) && !customTriggers.has(b.t.toLowerCase())
    );
    return [...customList.map((b) => ({ ...b, r: -1 })), ...rest];
  }

  // Minimal fallback so picker never opens empty even if network fails
  const FALLBACK_BANGS = [
    { t: "w", s: "Wikipedia", d: "wikipedia.org", u: "https://en.wikipedia.org/w/index.php?search={{{s}}}", c: "Reference", r: 1 },
    { t: "wtr", s: "Wikipedia TR", d: "tr.wikipedia.org", u: "https://tr.wikipedia.org/w/index.php?search={{{s}}}", c: "Reference", r: 2 },
    { t: "yt", s: "YouTube", d: "youtube.com", u: "https://www.youtube.com/results?search_query={{{s}}}", c: "Entertainment", r: 3 },
    { t: "gh", s: "GitHub", d: "github.com", u: "https://github.com/search?q={{{s}}}", c: "Tech", r: 4 },
    { t: "so", s: "Stack Overflow", d: "stackoverflow.com", u: "https://stackoverflow.com/search?q={{{s}}}", c: "Tech", r: 5 },
    { t: "g", s: "Google", d: "google.com", u: "https://www.google.com/search?q={{{s}}}", c: "Search", r: 6 },
    { t: "gm", s: "Google Maps", d: "maps.google.com", u: "https://www.google.com/maps/search/{{{s}}}", c: "Maps", r: 7 },
    { t: "hb", s: "Hepsiburada", d: "hepsiburada.com", u: "https://www.hepsiburada.com/ara?q={{{s}}}", c: "Shopping", r: 8 },
    { t: "hepsiburada", s: "Hepsiburada", d: "hepsiburada.com", u: "https://www.hepsiburada.com/ara?q={{{s}}}", c: "Shopping", r: 9 },
    { t: "trendyol", s: "Trendyol", d: "trendyol.com", u: "https://www.trendyol.com/sr?q={{{s}}}", c: "Shopping", r: 10 },
    { t: "n11", s: "N11", d: "n11.com", u: "https://www.n11.com/arama?q={{{s}}}", c: "Shopping", r: 11 },
    { t: "amazon", s: "Amazon", d: "amazon.com", u: "https://www.amazon.com/s?k={{{s}}}", c: "Shopping", r: 12 },
    { t: "a", s: "Amazon", d: "amazon.com", u: "https://www.amazon.com/s?k={{{s}}}", c: "Shopping", r: 13 },
    { t: "eksisozluk", s: "Ekşi Sözlük", d: "eksisozluk.com", u: "https://eksisozluk.com/?q={{{s}}}", c: "Reference", r: 14 },
    { t: "eksi", s: "Ekşi Sözlük", d: "eksisozluk.com", u: "https://eksisozluk.com/?q={{{s}}}", c: "Reference", r: 15 },
    { t: "tw", s: "Twitter", d: "twitter.com", u: "https://twitter.com/search?q={{{s}}}", c: "Social", r: 16 },
    { t: "ig", s: "Instagram", d: "instagram.com", u: "https://www.instagram.com/explore/search/keyword/?q={{{s}}}", c: "Social", r: 17 },
    { t: "fb", s: "Facebook", d: "facebook.com", u: "https://www.facebook.com/search/top/?q={{{s}}}", c: "Social", r: 18 },
    { t: "reddit", s: "Reddit", d: "reddit.com", u: "https://www.reddit.com/search/?q={{{s}}}", c: "Social", r: 19 },
    { t: "maps", s: "Google Maps", d: "google.com", u: "https://www.google.com/maps/search/{{{s}}}", c: "Maps", r: 20 },
    { t: "scholar", s: "Google Scholar", d: "scholar.google.com", u: "https://scholar.google.com/scholar?q={{{s}}}", c: "Research", r: 21 },
    { t: "imdb", s: "IMDb", d: "imdb.com", u: "https://www.imdb.com/find?q={{{s}}}", c: "Entertainment", r: 22 },
    { t: "spotify", s: "Spotify", d: "spotify.com", u: "https://open.spotify.com/search/{{{s}}}", c: "Music", r: 23 },
    { t: "netflix", s: "Netflix", d: "netflix.com", u: "https://www.netflix.com/search?q={{{s}}}", c: "Entertainment", r: 24 },
    { t: "twitch", s: "Twitch", d: "twitch.tv", u: "https://www.twitch.tv/search?term={{{s}}}", c: "Entertainment", r: 25 },
    { t: "linkedin", s: "LinkedIn", d: "linkedin.com", u: "https://www.linkedin.com/search/results/all/?keywords={{{s}}}", c: "Social", r: 26 },
    { t: "mdn", s: "MDN Web Docs", d: "developer.mozilla.org", u: "https://developer.mozilla.org/en-US/search?q={{{s}}}", c: "Tech", r: 27 },
    { t: "npm", s: "npm", d: "npmjs.com", u: "https://www.npmjs.com/search?q={{{s}}}", c: "Tech", r: 28 },
    { t: "pypi", s: "PyPI", d: "pypi.org", u: "https://pypi.org/search/?q={{{s}}}", c: "Tech", r: 29 },
    { t: "hz", s: "Hepsiburada", d: "hepsiburada.com", u: "https://www.hepsiburada.com/ara?q={{{s}}}", c: "Shopping", r: 30 },
    // Turkish sites (offline fallback — the live registry carries the rest)
    { t: "sahibinden", s: "Sahibinden", d: "sahibinden.com", u: "https://www.sahibinden.com/arama?query_text={{{s}}}", c: "Shopping", sc: "Türkiye", r: 40 },
    { t: "sh", s: "Sahibinden", d: "sahibinden.com", u: "https://www.sahibinden.com/arama?query_text={{{s}}}", c: "Shopping", sc: "Türkiye", r: 41 },
    { t: "arabam", s: "Arabam.com", d: "arabam.com", u: "https://www.arabam.com/ikinci-el?searchText={{{s}}}", c: "Shopping", sc: "Türkiye", r: 42 },
    { t: "letgo", s: "Letgo", d: "letgo.com", u: "https://www.letgo.com/tr-tr/search?query={{{s}}}", c: "Shopping", sc: "Türkiye", r: 43 },
    { t: "dolap", s: "Dolap", d: "dolap.com", u: "https://dolap.com/ara?q={{{s}}}", c: "Shopping", sc: "Türkiye", r: 44 },
    { t: "hepsiemlak", s: "Hepsiemlak", d: "hepsiemlak.com", u: "https://www.hepsiemlak.com/arama?q={{{s}}}", c: "Shopping", sc: "Türkiye", r: 45 },
    { t: "ciceksepeti", s: "Çiçeksepeti", d: "ciceksepeti.com", u: "https://www.ciceksepeti.com/arama?q={{{s}}}", c: "Shopping", sc: "Türkiye", r: 46 },
    { t: "migros", s: "Migros", d: "migros.com.tr", u: "https://www.migros.com.tr/arama?q={{{s}}}", c: "Shopping", sc: "Türkiye", r: 47 },
    { t: "yemeksepeti", s: "Yemeksepeti", d: "yemeksepeti.com", u: "https://www.yemeksepeti.com/arama?q={{{s}}}", c: "Food", sc: "Türkiye", r: 48 },
    { t: "kariyer", s: "Kariyer.net", d: "kariyer.net", u: "https://www.kariyer.net/is-ilani?keyword={{{s}}}", c: "Jobs", sc: "Türkiye", r: 49 },
    { t: "tdk", s: "TDK Sözlük", d: "sozluk.gov.tr", u: "https://sozluk.gov.tr/?ara={{{s}}}", c: "Reference", sc: "Türkiye", r: 50 },
    { t: "investing", s: "Investing.com TR", d: "tr.investing.com", u: "https://tr.investing.com/search/?q={{{s}}}", c: "Finance", sc: "Türkiye", r: 51 },
    { t: "tefas", s: "TEFAS", d: "tefas.gov.tr", u: "https://www.tefas.gov.tr/FonArama?search={{{s}}}", c: "Finance", sc: "Türkiye", r: 52 },
  ];

  return {
    BANG_KEYS,
    FALLBACK_BANGS,
    isBang,
    normalizeBang,
    normalizeCustomBang,
    mergeBangs,
    buildSearchUrl,
    matchesBang,
    rankBangs,
  };
});