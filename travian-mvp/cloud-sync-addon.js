(() => {
  const STORAGE_KEY = "frontier-village-save-v4";
  const ENDPOINT_KEY = "frontier-village-sheet-endpoint";
  const TOKEN_KEY = "frontier-village-sheet-token";
  const CLOUD_TIME_KEY = "frontier-village-last-cloud-sync";
  const CLOUD_HASH_KEY = "frontier-village-last-cloud-hash";
  const SYNCED_ACTIONS_KEY = "frontier-village-synced-action-ids";
  const SYNCED_BATTLES_KEY = "frontier-village-synced-battle-ids";
  const DEBOUNCE_MS = 1600;
  let timer = null;
  let busy = false;
  let lastRaw = "";

  function boot() {
    injectStyles();
    ensureSaveUi();
    bindControls();
    refreshStatus();
    lastRaw = localStorage.getItem(STORAGE_KEY) || "";
    setInterval(watchState, 2500);
    setInterval(() => syncNow("每 60 秒自動同步"), 60000);
  }

  function endpoint() { return (localStorage.getItem(ENDPOINT_KEY) || "").trim(); }
  function token() { return localStorage.getItem(TOKEN_KEY) || ""; }
  function validEndpoint(url = endpoint()) { return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/.test(url); }
  function isSheetUrl(url) { return /docs\.google\.com\/spreadsheets\//.test(url || ""); }
  function readState() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; } }
  function writeState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

  function bindControls() {
    document.addEventListener("click", (event) => {
      const saveEndpoint = event.target.closest("#saveEndpointBtn");
      if (saveEndpoint) {
        const input = document.getElementById("endpointInput");
        const url = (input?.value || "").trim();
        if (!url) return setTimeout(refreshStatus, 0);
        if (isSheetUrl(url) || !validEndpoint(url)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          setCloudStatus("fail", "endpoint 欄位要填 Apps Script Web App URL，不是 Google Sheet 網址。格式應該像 https://script.google.com/macros/s/.../exec");
          return;
        }
        localStorage.setItem(ENDPOINT_KEY, url);
        localStorage.setItem(TOKEN_KEY, document.getElementById("tokenInput")?.value || "");
        setTimeout(() => syncNow("儲存 endpoint 後立即同步"), 200);
      }

      const syncButton = event.target.closest("#syncSheetBtn");
      if (syncButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        syncNow("手動同步");
      }

      const loadButton = event.target.closest("#loadCloudBtn");
      if (loadButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        loadCloudState();
      }
    }, true);
  }

  function watchState() {
    refreshStatus();
    const raw = localStorage.getItem(STORAGE_KEY) || "";
    if (!raw || raw === lastRaw) return;
    lastRaw = raw;
    scheduleSync("遊戲資料變更自動同步");
  }

  function scheduleSync(reason) {
    clearTimeout(timer);
    timer = setTimeout(() => syncNow(reason), DEBOUNCE_MS);
  }

  async function syncNow(reason = "自動同步") {
    const url = endpoint();
    if (!url) return setCloudStatus("unset", "目前只有本機存檔，尚未啟用 Google Sheets 雲端同步。");
    if (isSheetUrl(url) || !validEndpoint(url)) return setCloudStatus("fail", "endpoint 欄位錯誤：請填 Apps Script Web App URL，不是 Google Sheet 網址。");
    const state = readState();
    if (!state) return setCloudStatus("fail", "本機沒有可同步的 state。請先進入遊戲產生存檔。");
    if (busy) return;

    const raw = JSON.stringify(state);
    const hash = hashText(raw);
    const changed = localStorage.getItem(CLOUD_HASH_KEY) !== hash;
    const actionLogs = unsyncedLogs(state.actionLogs || [], SYNCED_ACTIONS_KEY);
    const battleLogs = unsyncedLogs(state.reports || [], SYNCED_BATTLES_KEY);
    if (!changed && !actionLogs.length && !battleLogs.length) return refreshStatus();

    busy = true;
    setCloudStatus("busy", "雲端同步：同步中...");
    try {
      const response = await fetch(url, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "saveState",
          token: token(),
          state,
          reason,
          savedAt: new Date().toISOString(),
          actionLogs,
          battleLogs,
        }),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || "Apps Script 回傳失敗");
      const savedAt = result.savedAt || new Date().toISOString();
      state.lastCloudSaved = savedAt;
      state.lastSaved = state.lastSaved || savedAt;
      writeState(state);
      localStorage.setItem(CLOUD_HASH_KEY, hashText(JSON.stringify(state)));
      localStorage.setItem(CLOUD_TIME_KEY, savedAt);
      markSynced(actionLogs, SYNCED_ACTIONS_KEY);
      markSynced(battleLogs, SYNCED_BATTLES_KEY);
      setCloudStatus("ok", "已同步到 Google Sheets。最近一次雲端同步時間：" + new Date(savedAt).toLocaleString("zh-TW"));
    } catch (error) {
      setCloudStatus("fail", "雲端同步：失敗 - " + error.message);
    } finally {
      busy = false;
    }
  }

  async function loadCloudState() {
    const url = endpoint();
    if (!url) return setCloudStatus("unset", "目前只有本機存檔，尚未啟用 Google Sheets 雲端同步。");
    if (isSheetUrl(url) || !validEndpoint(url)) return setCloudStatus("fail", "endpoint 欄位錯誤：請填 Apps Script Web App URL，不是 Google Sheet 網址。");
    setCloudStatus("busy", "正在從 Google Sheets 載入雲端存檔...");
    try {
      const response = await fetch(url, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "loadState", token: token() }),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const result = await response.json();
      if (!result.ok || !result.state) throw new Error(result.error || "Google Sheets 沒有可載入的 state_json");
      writeState(result.state);
      localStorage.setItem(CLOUD_HASH_KEY, hashText(JSON.stringify(result.state)));
      localStorage.setItem(CLOUD_TIME_KEY, result.savedAt || new Date().toISOString());
      setCloudStatus("ok", "已從 Google Sheets 載入雲端存檔，頁面將重新整理。");
      setTimeout(() => location.reload(), 800);
    } catch (error) {
      setCloudStatus("fail", "雲端讀取失敗，保留本機備用存檔。" + error.message);
    }
  }

  function unsyncedLogs(logs, key) {
    const synced = new Set(readIdList(key));
    return logs.filter((log) => log && log.id && !synced.has(log.id)).slice(0, 40);
  }

  function markSynced(logs, key) {
    const ids = new Set(readIdList(key));
    logs.forEach((log) => log?.id && ids.add(log.id));
    localStorage.setItem(key, JSON.stringify([...ids].slice(-300)));
  }

  function readIdList(key) { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } }

  function ensureSaveUi() {
    const cloudPanel = document.getElementById("cloudSyncStatus")?.closest("article");
    if (cloudPanel && !document.getElementById("cloudEndpointHelp")) {
      document.getElementById("endpointInput")?.insertAdjacentHTML("afterend", `<small id="cloudEndpointHelp" class="cloud-help">請填 Apps Script Web App URL，例如 https://script.google.com/macros/s/.../exec。不要填 Google Sheet 網址。</small>`);
    }
    const localPanel = document.getElementById("cloudStatusBadge")?.closest("article");
    if (localPanel && !document.getElementById("lastCloudSavedLine")) {
      document.getElementById("cloudStatusBadge")?.closest(".save-meter")?.insertAdjacentHTML("afterend", `<div class="save-meter"><span>最近一次雲端同步</span><strong id="lastCloudSavedLine">尚無</strong></div>`);
    }
  }

  function refreshStatus() {
    ensureSaveUi();
    const url = endpoint();
    const localState = readState();
    setText("localSaveStatus", localState ? "成功" : "失敗");
    if (!url) setCloudStatus("unset", "目前只有本機存檔，尚未啟用 Google Sheets 雲端同步。", false);
    else if (isSheetUrl(url) || !validEndpoint(url)) setCloudStatus("fail", "endpoint 欄位錯誤：請填 Apps Script Web App URL，不是 Google Sheet 網址。", false);
    else if (!busy && !document.getElementById("cloudSyncStatus")?.dataset.cloudMode) setCloudStatus("idle", "Google Sheets endpoint：已設定。等待下一次同步。", false);
    const last = localStorage.getItem(CLOUD_TIME_KEY) || localState?.lastCloudSaved || "";
    setText("lastCloudSavedLine", last ? new Date(last).toLocaleString("zh-TW") : "尚無");
  }

  function setCloudStatus(mode, message, mark = true) {
    const badge = document.getElementById("cloudStatusBadge");
    const status = document.getElementById("cloudSyncStatus");
    const saveStatus = document.getElementById("saveStatus");
    if (badge) badge.textContent = mode === "unset" ? "未設定" : mode === "busy" ? "同步中" : mode === "ok" || mode === "idle" ? "已設定" : "同步失敗";
    if (status) {
      status.dataset.cloudMode = mode;
      status.className = "sync-status " + (mode === "ok" || mode === "idle" ? "ok" : mode === "busy" ? "busy" : mode === "fail" ? "fail" : "");
      status.textContent = message;
    }
    if (saveStatus) saveStatus.textContent = message;
    if (mark && mode === "ok") localStorage.setItem(CLOUD_TIME_KEY, new Date().toISOString());
  }

  function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
  function hashText(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return String(hash >>> 0);
  }

  function injectStyles() {
    if (document.getElementById("cloudSyncAddonStyles")) return;
    const style = document.createElement("style");
    style.id = "cloudSyncAddonStyles";
    style.textContent = `.cloud-help{display:block;margin-top:5px;color:#7a5b20;font-size:.82rem}.sync-status.fail{color:#7a2b22;border-color:rgba(182,60,45,.35);background:#fff0eb}.sync-status.busy{color:#315272;border-color:rgba(69,111,158,.35);background:#edf6ff}.sync-status.ok{color:#2f6436;border-color:rgba(95,143,61,.35);background:#eef8df}`;
    document.head.appendChild(style);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();