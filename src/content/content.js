// Bang Search — content script: Shadow DOM bang picker.
//
// The background sends { type: "OPEN_PICKER", query, bangs } when the
// "Bang ile ara" context-menu item is clicked. This script renders a
// floating command palette inside a Shadow DOM (fully isolated from the
// host page), lets the user type a bang trigger, and sends
// { type: "SEARCH", bangT, query } back to the background to open a tab.
//
// All UI lives inside the shadow root; the only light-DOM element is a
// single <div id="bang-search-host"> wrapper. Nothing leaks to the page.

(() => {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;

  /* ------------------------------------------------------------------ */
  /* Inline styles (shadow DOM). picker.css only styles the host wrapper; */
  /* the actual palette styles live here so they can never leak.         */
  /* ------------------------------------------------------------------ */

  const PICKER_CSS = `
    :host { all: initial; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* Design tokens — light default, dark overrides via prefers-color-scheme */
    :host {
      --bg: rgba(0, 0, 0, 0.55);
      --surface: #ffffff;
      --surface-2: #f9fafb;
      --border: #e5e7eb;
      --border-strong: #d1d5db;
      --text: #111827;
      --muted: #6b7280;
      --faint: #9ca3af;
      --accent: #3b82f6;
      --accent-soft: rgba(59, 130, 246, 0.1);
      --pill-bg: #f3f4f6;
      --hover: #f3f4f6;
      --shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      --inset-glow: rgba(255, 255, 255, 0.05);
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --bg: rgba(0, 0, 0, 0.55);
        --surface: #18181b;        /* zinc-900 */
        --surface-2: #1f1f23;
        --border: #27272a;         /* zinc-800 */
        --border-strong: #3f3f46;  /* zinc-700 */
        --text: #fafafa;           /* zinc-50 */
        --muted: #a1a1aa;          /* zinc-400 */
        --faint: #71717a;          /* zinc-500 */
        --accent: #60a5fa;         /* blue-400 */
        --accent-soft: rgba(96, 165, 250, 0.12);
        --pill-bg: #27272a;
        --hover: #27272a;
        --shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
        --inset-glow: rgba(255, 255, 255, 0.06);
      }
    }

    .overlay {
      position: fixed;
      inset: 0;
      background: var(--bg);
      backdrop-filter: blur(8px) saturate(1.2);
      -webkit-backdrop-filter: blur(8px) saturate(1.2);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483647;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    .container {
      width: min(480px, 92vw);
      max-height: 72vh;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: var(--shadow), inset 0 0 0 1px var(--inset-glow);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: picker-in 0.14s ease-out;
    }
    @keyframes picker-in {
      from { opacity: 0; transform: translateY(-6px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .header {
      padding: 10px 14px;
      background: transparent;
      border-bottom: 1px solid var(--border);
      font-size: 12px;
      color: var(--muted);
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .header-label {
      color: var(--faint);
      font-size: 11px;
      white-space: nowrap;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .header-query {
      font-weight: 600;
      font-size: 12px;
      color: var(--text);
      background: var(--pill-bg);
      border: 1px solid var(--border);
      padding: 2px 8px;
      border-radius: 999px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 320px;
    }
    .input {
      width: 100%;
      padding: 12px 14px;
      font-size: 14px;
      border: none;
      outline: none;
      border-bottom: 1px solid var(--border);
      font-family: inherit;
      color: var(--text);
      background: transparent;
      transition: border-color 0.12s ease, box-shadow 0.12s ease;
    }
    .input::placeholder { color: var(--faint); }
    .input:focus {
      border-bottom-color: var(--accent);
      box-shadow: 0 1px 0 0 var(--accent);
    }
    .list {
      max-height: 260px;
      overflow-y: auto;
      flex: 1;
      padding: 4px;
      scrollbar-width: thin;
      scrollbar-color: var(--border-strong) transparent;
    }
    .list::-webkit-scrollbar { width: 6px; }
    .list::-webkit-scrollbar-thumb {
      background: var(--border-strong);
      border-radius: 999px;
    }
    .list::-webkit-scrollbar-track { background: transparent; }
    .item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      cursor: pointer;
      border-left: 2px solid transparent;
      border-radius: 8px;
      transition: background-color 0.12s ease, border-color 0.12s ease;
    }
    .item:hover { background: var(--hover); }
    .item.selected {
      background: var(--accent-soft);
      border-left-color: var(--accent);
    }
    .item-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .bang-s {
      font-weight: 500;
      font-size: 13px;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bang-d {
      font-size: 11px;
      color: var(--muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bang-t {
      background: var(--pill-bg);
      border: 1px solid var(--border);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 5px;
      color: var(--muted);
      flex-shrink: 0;
    }
    .bang-c {
      font-size: 11px;
      color: var(--muted);
      background: var(--surface-2);
      border: 1px solid var(--border);
      padding: 1px 8px;
      border-radius: 999px;
      flex-shrink: 0;
      white-space: nowrap;
    }
    .footer {
      padding: 7px 12px;
      font-size: 11px;
      color: var(--faint);
      opacity: 0.7;
      border-top: 1px solid var(--border);
    }
    .empty {
      padding: 20px;
      text-align: center;
      color: var(--faint);
      font-size: 13px;
    }
    strong { font-weight: 700; color: var(--accent); }
    @media (prefers-reduced-motion: reduce) {
      .container { animation: none; }
      .item { transition: none; }
    }
  `;

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */

  let host = null; // light-DOM wrapper (#bang-search-host)
  let shadow = null; // shadow root
  let els = null; // { overlay, container, input, list, footer }
  let bangs = []; // full bang registry
  let selectedText = ""; // the page-selected search query
  let filtered = []; // currently displayed bangs
  let selectedIndex = 0; // keyboard cursor into filtered
  let initialList = []; // recent/popular list shown before typing
  let globalEscHandler = null;

  /* ------------------------------------------------------------------ */
  /* Bang ranking (mirrors src/lib/bangs.js — content scripts cannot     */
  /* importScripts, so the logic is duplicated here).                    */
  /* ------------------------------------------------------------------ */

  function isBang(obj) {
    return (
      !!obj &&
      typeof obj === "object" &&
      typeof obj.t === "string" &&
      obj.t.length > 0
    );
  }

  /**
   * Rank bangs against a user input string (case-insensitive).
   * Tier 0: exact trigger match · Tier 1: prefix on t/s · Tier 2: substring
   * on "t s d c sc". Within a tier: lower r (popularity) first, then shorter
   * trigger, then alphabetical.
   */
  function rankBangs(list, input, limit) {
    const q = String(input == null ? "" : input).trim().toLowerCase();
    const max = Number.isFinite(limit) && limit > 0 ? limit : 8;
    if (!q || !Array.isArray(list) || list.length === 0) return [];

    const scored = [];
    for (const bang of list) {
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

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Escape `text`, then wrap the first case-insensitive match of `query` in <strong>. */
  function highlightMatch(text, query) {
    const safe = escapeHtml(text);
    const q = String(query == null ? "" : query).trim();
    if (!q) return safe;
    const idx = String(text).toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return safe;
    const before = escapeHtml(String(text).slice(0, idx));
    const match = escapeHtml(String(text).slice(idx, idx + q.length));
    const after = escapeHtml(String(text).slice(idx + q.length));
    return `${before}<strong>${match}</strong>${after}`;
  }

  /** Initial list before the user types: recent bangs first, then by popularity. */
  async function computeInitialList() {
    let recent = [];
    try {
      const stored = await api.storage.local.get("recentBangs");
      if (Array.isArray(stored.recentBangs)) recent = stored.recentBangs;
    } catch (_) {
      /* storage unavailable — fall through to popularity sort */
    }
    const byT = new Map();
    for (const b of bangs) byT.set(b.t, b);
    const recentBangs = [];
    for (const t of recent) {
      const b = byT.get(t);
      if (b) recentBangs.push(b);
    }
    const recentSet = new Set(recentBangs.map((b) => b.t));
    const rest = bangs
      .filter((b) => !recentSet.has(b.t))
      .sort(
        (a, b) =>
          (typeof a.r === "number" ? a.r : Number.MAX_SAFE_INTEGER) -
          (typeof b.r === "number" ? b.r : Number.MAX_SAFE_INTEGER)
      );
    return [...recentBangs, ...rest].slice(0, 8);
  }

  /* ------------------------------------------------------------------ */
  /* DOM construction                                                    */
  /* ------------------------------------------------------------------ */

  function ensureUI() {
    if (host) return;

    host = document.createElement("div");
    host.id = "bang-search-host";
    host.style.cssText =
      "all:initial;position:fixed;inset:0;z-index:2147483647;" +
      "pointer-events:none;display:none;";

    shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = PICKER_CSS;
    shadow.appendChild(style);

    const overlay = document.createElement("div");
    overlay.className = "overlay";

    const container = document.createElement("div");
    container.className = "container";

    const header = document.createElement("div");
    header.className = "header";
    const headerLabel = document.createElement("span");
    headerLabel.className = "header-label";
    headerLabel.textContent = "Seçili metin:";
    const headerQuery = document.createElement("span");
    headerQuery.className = "header-query";
    header.append(headerLabel, headerQuery);

    const input = document.createElement("input");
    input.className = "input";
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "Bang araması");

    const list = document.createElement("div");
    list.className = "list";
    list.setAttribute("role", "listbox");

    const footer = document.createElement("div");
    footer.className = "footer";

    container.append(header, input, list, footer);
    overlay.appendChild(container);
    shadow.appendChild(overlay);

    (document.body || document.documentElement).appendChild(host);

    els = { overlay, container, header, headerQuery, input, list, footer };
    bindEvents();
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                           */
  /* ------------------------------------------------------------------ */

  function render() {
    const list = els.list;
    list.textContent = "";

    if (bangs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Bangs yükleniyor... Lütfen bekleyin veya sayfayı yenileyin";
      list.appendChild(empty);
      els.footer.textContent = "Esc ile kapat";
      return;
    }
    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      const q = els.input.value.trim();
      empty.textContent = q ? `"${q}" için eşleşen bang bulunamadı` : "Eşleşen bang bulunamadı";
      list.appendChild(empty);
      els.footer.textContent = "Esc ile kapat — farklı bir bang deneyin (örn: wiki, yt, hepsi)";
      return;
    }

    const q = els.input.value.trim();

    filtered.forEach((bang, i) => {
      const item = document.createElement("div");
      item.className = "item" + (i === selectedIndex ? " selected" : "");
      item.dataset.index = String(i);
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", i === selectedIndex ? "true" : "false");

      const left = document.createElement("div");
      left.className = "item-left";

      const s = document.createElement("span");
      s.className = "bang-s";
      s.innerHTML = highlightMatch(bang.s || bang.t, q);

      const d = document.createElement("span");
      d.className = "bang-d";
      d.textContent = bang.d || "";

      const t = document.createElement("span");
      t.className = "bang-t";
      t.textContent = "!" + bang.t;

      left.append(s, d, t);

      const c = document.createElement("span");
      c.className = "bang-c";
      c.textContent = bang.c || "";

      item.append(left, c);
      list.appendChild(item);
    });

    els.footer.textContent = "↑↓ gezin · Enter seç · Esc kapat";

    const sel = list.querySelector(".item.selected");
    if (sel) sel.scrollIntoView({ block: "nearest" });
  }

  /* ------------------------------------------------------------------ */
  /* Open / close / select                                               */
  /* ------------------------------------------------------------------ */

  async function openPicker(query, incomingBangs) {
    selectedText = String(query == null ? "" : query).trim();

    if (Array.isArray(incomingBangs) && incomingBangs.length > 0) {
      bangs = incomingBangs;
    } else {
      // Background sent no bangs — fetch them ourselves.
      try {
        const resp = await api.runtime.sendMessage({ type: "GET_BANGS" });
        bangs = resp && Array.isArray(resp.bangs) ? resp.bangs : [];
      } catch (err) {
        bangs = [];
      }
    }

    ensureUI();

    els.headerQuery.textContent = selectedText ? `"${selectedText}"` : "";
    els.headerQuery.title = selectedText || "";
    els.input.value = "";
    els.input.placeholder = "Bang ara: wiki, yt, hepsi, trendyol...";

    initialList = await computeInitialList();
    filtered = initialList;
    selectedIndex = 0;
    render();

    host.style.display = "block";
    host.style.pointerEvents = "auto";
    host.classList.add("bang-open");
    els.input.focus();
    if (!globalEscHandler) {
      globalEscHandler = (e) => {
        if (e.key === "Escape" && host.style.display === "block") {
          e.preventDefault();
          e.stopPropagation();
          closePicker();
        }
      };
      document.addEventListener("keydown", globalEscHandler, true);
      window.addEventListener("keydown", globalEscHandler, true);
    }
  }

  function closePicker() {
    if (!host) return;
    host.style.display = "none";
    host.style.pointerEvents = "none";
    host.classList.remove("bang-open");
    if (globalEscHandler) {
      document.removeEventListener("keydown", globalEscHandler, true);
      window.removeEventListener("keydown", globalEscHandler, true);
      globalEscHandler = null;
    }
    if (els) {
      els.input.value = "";
      els.input.blur();
    }
    filtered = [];
    selectedIndex = 0;
  }

  function onSelect(bang) {
    if (!bang) return;
    closePicker();
    api.runtime
      .sendMessage({ type: "SEARCH", bangT: bang.t, query: selectedText })
      .catch(() => {
        /* background unreachable — nothing else to do */
      });
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                              */
  /* ------------------------------------------------------------------ */

  function bindEvents() {
    els.input.addEventListener("input", () => {
      const q = els.input.value;
      filtered = q.trim() ? rankBangs(bangs, q, 8) : initialList;
      selectedIndex = 0;
      render();
    });

    els.input.addEventListener("keydown", (e) => {
      // Keep the page from seeing picker keystrokes.
      e.stopPropagation();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (filtered.length) {
          selectedIndex = (selectedIndex + 1) % filtered.length;
          render();
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (filtered.length) {
          selectedIndex = (selectedIndex - 1 + filtered.length) % filtered.length;
          render();
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        const bang = filtered[selectedIndex];
        if (bang) onSelect(bang);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closePicker();
      }
    });

    // Click on the dimmed backdrop closes; clicks inside the card don't.
    els.overlay.addEventListener("mousedown", (e) => {
      if (e.target === els.overlay) closePicker();
    });

    els.list.addEventListener("click", (e) => {
      const item = e.target.closest(".item");
      if (!item) return;
      const bang = filtered[Number(item.dataset.index)];
      if (bang) onSelect(bang);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Message listener                                                    */
  /* ------------------------------------------------------------------ */

  api.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "OPEN_PICKER") {
      openPicker(msg.query, msg.bangs);
    }
  });
})();