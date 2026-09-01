// Bang Search — options page logic.
//
// Shows bang count, last update time and recently used bangs from
// storage.local, and lets the user trigger a manual refresh via the
// background's REFRESH_BANGS message.

"use strict";

// Firefox exposes the promise-based `browser` API; fall back to `chrome` elsewhere.
const api = typeof browser !== "undefined" ? browser : chrome;

const STORAGE_KEYS = ["bangs", "lastUpdate", "recentBangs"];

const els = {
  bangCount: document.getElementById("bangCount"),
  lastUpdate: document.getElementById("lastUpdate"),
  recentList: document.getElementById("recentList"),
  refreshBtn: document.getElementById("refreshBtn"),
  status: document.getElementById("status"),
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

function renderStats(data) {
  const bangs = Array.isArray(data.bangs) ? data.bangs : [];
  els.bangCount.textContent = bangs.length > 0 ? String(bangs.length) : "0";
  els.lastUpdate.textContent = formatLastUpdate(data.lastUpdate);
  renderRecent(data.recentBangs);
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

els.refreshBtn.addEventListener("click", refreshBangs);

loadStats();