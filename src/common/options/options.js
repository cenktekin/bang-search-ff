// Bang Search — options page logic.
//
// Shows bang count, last update time and recently used bangs from
// storage.local, and lets the user trigger a manual refresh via the
// background's REFRESH_BANGS message.

"use strict";

// Firefox exposes the promise-based `browser` API; fall back to `chrome` elsewhere.
const api = typeof browser !== "undefined" ? browser : chrome;

const BangLib = (typeof self !== "undefined" && self.BangLib) || {};

const STORAGE_KEYS = ["bangs", "lastUpdate", "recentBangs", "customBangs"];

const els = {
  bangCount: document.getElementById("bangCount"),
  lastUpdate: document.getElementById("lastUpdate"),
  recentList: document.getElementById("recentList"),
  refreshBtn: document.getElementById("refreshBtn"),
  status: document.getElementById("status"),
  customList: document.getElementById("customList"),
  customForm: document.getElementById("customForm"),
  customStatus: document.getElementById("customStatus"),
  cbTrigger: document.getElementById("cbTrigger"),
  cbName: document.getElementById("cbName"),
  cbDomain: document.getElementById("cbDomain"),
  cbUrl: document.getElementById("cbUrl"),
};

function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatLastUpdate(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return "Henüz güncellenmedi";
  try {
    return new Date(n).toLocaleString("tr-TR");
  } catch (_) {
    return new Date(n).toString();
  }
}

function renderRecent(recentBangs) {
  const list = els.recentList;
  list.textContent = "";

  const recent = Array.isArray(recentBangs) ? recentBangs : [];
  if (recent.length === 0) {
    const hint = document.createElement("span");
    hint.className = "empty-hint";
    hint.textContent = "Henüz bang kullanılmadı";
    list.appendChild(hint);
    return;
  }

  for (const t of recent) {
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = "!" + escapeHtml(t);
    list.appendChild(pill);
  }
}

function renderCustomBangs(customBangs) {
  const list = els.customList;
  list.textContent = "";

  const custom = Array.isArray(customBangs) ? customBangs : [];
  if (custom.length === 0) {
    const hint = document.createElement("span");
    hint.className = "empty-hint";
    hint.textContent = "Henüz özel bang yok";
    list.appendChild(hint);
    return;
  }

  for (const bang of custom) {
    const pill = document.createElement("span");
    pill.className = "pill custom-pill";

    const label = document.createElement("span");
    label.textContent = `!${bang.t} — ${bang.s || bang.d || "Özel"}`;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.trigger = bang.t;
    remove.title = "Sil";
    remove.textContent = "×";

    pill.append(label, remove);
    list.appendChild(pill);
  }
}

function renderStats(data) {
  const bangs = Array.isArray(data.bangs) ? data.bangs : [];
  els.bangCount.textContent = bangs.length > 0 ? String(bangs.length) : "0";
  els.lastUpdate.textContent = formatLastUpdate(data.lastUpdate);
  renderRecent(data.recentBangs);
  renderCustomBangs(data.customBangs);
}

function setStatus(message, kind) {
  els.status.textContent = message;
  els.status.className = "status" + (kind ? " status-" + kind : "");
}

async function loadStats() {
  try {
    const data = await api.storage.local.get(STORAGE_KEYS);
    renderStats(data);
  } catch (err) {
    setStatus("İstatistikler yüklenemedi: " + (err && err.message ? err.message : err), "error");
  }
}

async function refreshBangs() {
  els.refreshBtn.disabled = true;
  setStatus("Güncelleniyor...", "info");

  try {
    const resp = await api.runtime.sendMessage({ type: "REFRESH_BANGS" });
    if (resp && resp.ok) {
      setStatus(
        "Güncellendi: " + (typeof resp.count === "number" ? resp.count : "?") + " bang yüklendi.",
        "success"
      );
    } else {
      setStatus("Güncelleme başarısız: " + (resp && resp.error ? resp.error : "Bilinmeyen hata"), "error");
    }
  } catch (err) {
    setStatus("Güncelleme başarısız: " + (err && err.message ? err.message : err), "error");
  } finally {
    els.refreshBtn.disabled = false;
    await loadStats();
  }
}

async function loadCustomBangs() {
  const data = await api.storage.local.get("customBangs");
  return Array.isArray(data.customBangs) ? data.customBangs : [];
}

function setCustomStatus(message, kind) {
  els.customStatus.textContent = message;
  els.customStatus.className = "status" + (kind ? " status-" + kind : "");
}

async function addCustomBang(event) {
  event.preventDefault();

  if (typeof BangLib.normalizeCustomBang !== "function") {
    setCustomStatus("Bang kütüphanesi yüklenemedi.", "error");
    return;
  }

  const candidate = BangLib.normalizeCustomBang({
    t: els.cbTrigger.value,
    s: els.cbName.value,
    d: els.cbDomain.value,
    u: els.cbUrl.value,
    c: "Custom",
  });
  if (!candidate) {
    setCustomStatus(
      "Geçersiz kayıt: kısayol harf/rakam içermeli; URL https:// ile başlamalı ve {{{s}}} içermeli.",
      "error"
    );
    return;
  }

  try {
    const current = await loadCustomBangs();
    const next = [
      candidate,
      ...current.filter(
        (b) => String(b.t).toLowerCase() !== candidate.t.toLowerCase()
      ),
    ];
    await api.storage.local.set({ customBangs: next });
    els.customForm.reset();
    renderCustomBangs(next);
    setCustomStatus(`!${candidate.t} eklendi.`, "success");
  } catch (err) {
    setCustomStatus("Kaydedilemedi: " + ((err && err.message) || err), "error");
  }
}

async function removeCustomBang(trigger) {
  try {
    const current = await loadCustomBangs();
    const next = current.filter(
      (b) => String(b.t).toLowerCase() !== String(trigger).toLowerCase()
    );
    await api.storage.local.set({ customBangs: next });
    renderCustomBangs(next);
    setCustomStatus(`!${trigger} silindi.`, "success");
  } catch (err) {
    setCustomStatus("Silinemedi: " + ((err && err.message) || err), "error");
  }
}

els.refreshBtn.addEventListener("click", refreshBangs);
els.customForm.addEventListener("submit", addCustomBang);
els.customList.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-trigger]");
  if (btn) removeCustomBang(btn.dataset.trigger);
});

loadStats();