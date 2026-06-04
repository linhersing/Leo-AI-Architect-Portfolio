(() => {
  const STORAGE_KEY = "frontier-village-save-v4";
  const ENDPOINT_KEY = "frontier-village-sheet-endpoint";
  const TOKEN_KEY = "frontier-village-sheet-token";
  const CLOUD_TIME_KEY = "frontier-village-last-cloud-sync";
  const CLOUD_HASH_KEY = "frontier-village-last-cloud-hash";
  const SYNCED_ACTIONS_KEY = "frontier-village-synced-action-ids";
  const SYNCED_BATTLES_KEY = "frontier-village-synced-battle-ids";
  const DEBOUNCE_MS = 1600;
  const VERIFY_DELAY_MS = 2200;
  const REQUIRED_BACKEND = "cloud-v3-jsonp-form-2026-06-04";
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
  function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

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
        setTimeout(() => diagnoseCloud(true), 200);
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

      const diagnoseButton = event.target.closest("#diagnoseCloudBtn");
      if (diagnoseButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        diagnoseCloud(false);
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

  async function diagnoseCloud(autoSyncAfterOk = false) {
    const url = endpoint();
    if (!url) return setCloudStatus("unset", "目前只有本機存檔，尚未啟用 Google Sheets 雲端同步。");
    if (isSheetUrl(url) || !validEndpoint(url)) return setCloudStatus("fail", "endpoint 欄位錯誤：請填 Apps Script Web App URL，不是 Google Sheet 網址。");
    if (busy) return;

    busy = true;
    setCloudStatus("busy", "雲端診斷：正在檢查 Apps Script Web App...");
    try {
      const setup = await jsonp(url, { action: "setup", token: token() });
      if (!setup.ok) throw new Error(setup.error || "Apps Script setup 回傳失敗");
      if (setup.backendVersion !== REQUIRED_BACKEND) {
        throw new Error("Apps Script 不是最新版本。請確認 Code.gs 已貼上 GitHub 最新版，並在部署管理中選「新版本」重新部署。現在讀到的版本：" + (setup.backendVersion || "舊版或未支援 JSONP"));
      }
      const sheetList = (setup.sheets || []).join(" / ");
      setCloudStatus("ok", "雲端診斷通過：Web App 已連線，資料表已就緒（" + sheetList + "）。");
      if (autoSyncAfterOk) setTimeout(() => syncNow("診斷通過後立即同步"), 250);
    } catch (error) {
      setCloudStatus("fail", "雲端診斷失敗 - " + explainError(error));
    } finally {
      busy = false;
    }
  }

  async function syncNow(reason = "自動同步") {
    const url = endpoint();
    if (!url) return setCloudStatus("unset", "目前只有本機存檔，尚未啟用 Google Sheets 雲端同步。");
    if (isSheetUrl(url) || !validEndpoint(url)) return setCloudStatus("fail", "endpoint 欄位錯誤：請填 Apps Script Web App URL，不是 Google Sheet 網址。");
    const state = readState();
    if (!state) return setCloudStatus("fail", "本機沒有可同步的 state。請先進入遊戲產生存檔。");
    if (busy) return;

    const actionLogs = unsyncedLogs(state.actionLogs || [], SYNCED_ACTIONS_KEY);
    const battleLogs = unsyncedLogs(state.reports || [], SYNCED_BATTLES_KEY);
    const beforeHash = hashText(JSON.stringify(state));
    const changed = localStorage.getItem(CLOUD_HASH_KEY) !== beforeHash;
    if (!changed && !actionLogs.length && !battleLogs.length) return refreshStatus();

    busy = true;
    try {
      const sentAt = new Date().toISOString();
      const saveId = "save-" + Date.now() + "-" + Math.random().toString(16).slice(2);
      state.cloudSaveId = saveId;
      state.lastCloudAttempt = sentAt;
      state.lastSaved = sentAt;
      writeState(state);

      const payload = {
        action: "saveState",
        token: token(),
        state,
        reason,
        savedAt: sentAt,
        actionLogs,
        battleLogs,
      };

      setCloudStatus("busy", "雲端同步：方法 1 送出中...");
      await sendViaFetch(url, payload);
      let verified = await verifySave(url, saveId, "方法 1");

      if (!verified.ok) {
        setCloudStatus("busy", "方法 1 沒有讀回同一筆存檔，改用方法 2 表單備援...");
        await sendViaHiddenForm(url, payload);
        verified = await verifySave(url, saveId, "方法 2");
      }

      if (!verified.ok) throw new Error(verified.error || "送出後讀回不到同一筆 cloudSaveId，代表 Apps Script 沒有成功寫入 Google Sheets。");

      const savedAt = verified.savedAt || sentAt;
      state.lastCloudSaved = savedAt;
      state.lastSaved = savedAt;
      writeState(state);
      localStorage.setItem(CLOUD_HASH_KEY, hashText(JSON.stringify(state)));
      localStorage.setItem(CLOUD_TIME_KEY, savedAt);
      markSynced(actionLogs, SYNCED_ACTIONS_KEY);
      markSynced(battleLogs, SYNCED_BATTLES_KEY);
      setCloudStatus("ok", "已同步到 Google Sheets。最近一次雲端同步時間：" + new Date(savedAt).toLocaleString("zh-TW"));
    } catch (error) {
      setCloudStatus("fail", "雲端同步：失敗 - " + explainError(error));
    } finally {
      busy = false;
    }
  }

  async function sendViaFetch(url, payload) {
    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify(payload),
    });
  }

  function sendViaHiddenForm(url, payload) {
    return new Promise((resolve) => {
      const frameName = "cloudSyncFrame" + Date.now();
      const iframe = document.createElement("iframe");
      iframe.name = frameName;
      iframe.hidden = true;
      const form = document.createElement("form");
      form.method = "POST";
      form.action = url;
      form.target = frameName;
      form.style.display = "none";
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "payload";
      input.value = JSON.stringify(payload);
      form.appendChild(input);
      document.body.appendChild(iframe);
      document.body.appendChild(form);
      form.submit();
      setTimeout(() => {
        form.remove();
        iframe.remove();
        resolve();
      }, 1400);
    });
  }

  async function verifySave(url, expectedSaveId, label) {
    await delay(VERIFY_DELAY_MS);
    try {
      const result = await loadStateViaJsonp(url);
      if (!result.ok || !result.state) return { ok: false, error: label + "：Google Sheets 沒有可讀回的 state_json。" };
      if (result.state.cloudSaveId !== expectedSaveId) {
        return { ok: false, error: label + "：讀回的是舊存檔，不是這次送出的資料。" };
      }
      return { ok: true, savedAt: result.savedAt, state: result.state };
    } catch (error) {
      return { ok: false, error: label + "：" + explainError(error) };
    }
  }

  async function loadCloudState() {
    const url = endpoint();
    if (!url) return setCloudStatus("unset", "目前只有本機存檔，尚未啟用 Google Sheets 雲端同步。");
    if (isSheetUrl(url) || !validEndpoint(url)) return setCloudStatus("fail", "endpoint 欄位錯誤：請填 Apps Script Web App URL，不是 Google Sheet 網址。");
    setCloudStatus("busy", "正在從 Google Sheets 載入雲端存檔...");
    try {
      const result = await loadStateViaJsonp(url);
      if (!result.ok || !result.state) throw new Error(result.error || "Google Sheets 沒有可載入的 state_json");
      writeState(result.state);
      localStorage.setItem(CLOUD_HASH_KEY, hashText(JSON.stringify(result.state)));
      localStorage.setItem(CLOUD_TIME_KEY, result.savedAt || new Date().toISOString());
      setCloudStatus("ok", "已從 Google Sheets 載入雲端存檔，頁面將重新整理。");
      setTimeout(() => location.reload(), 800);
    } catch (error) {
      setCloudStatus("fail", "雲端讀取失敗，保留本機備用存檔。" + explainError(error));
    }
  }

  function loadStateViaJsonp(url) {
    return jsonp(url, { action: "loadState", token: token() });
  }

  function jsonp(baseUrl, params = {}) {
    return new Promise((resolve, reject) => {
      const callbackName = "__frontierCloud" + Date.now() + Math.random().toString(16).slice(2);
      const script = document.createElement("script");
      const target = new URL(baseUrl);
      Object.entries({ ...params, callback: callbackName, _: Date.now() }).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") target.searchParams.set(key, value);
      });

      let done = false;
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("讀回逾時。通常是 Web App 權限不是「所有人」，或 Apps Script 還不是最新部署版本。"));
      }, 12000);
      const cleanup = () => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        delete window[callbackName];
        script.remove();
      };

      window[callbackName] = (data) => {
        cleanup();
        resolve(data || {});
      };
      script.onerror = () => {
        cleanup();
        reject(new Error("JSONP 讀取失敗。請確認 Web App 權限是「所有人」，不是只有自己或組織內。"));
      };
      script.src = target.toString();
      document.head.appendChild(script);
    });
  }

  function explainError(error) {
    const message = String(error?.message || error || "未知錯誤");
    if (/Failed to fetch|NetworkError/i.test(message)) return "瀏覽器阻擋 Apps Script 回應。新版會自動改用表單備援；如果仍失敗，請按「診斷連線」看具體原因。";
    return message;
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
    const endpointInput = document.getElementById("endpointInput");
    const cloudPanel = document.getElementById("cloudSyncStatus")?.closest("article");
    if (cloudPanel && !document.getElementById("cloudEndpointHelp")) {
      endpointInput?.insertAdjacentHTML("afterend", `<small id="cloudEndpointHelp" class="cloud-help">請填 Apps Script Web App URL，例如 https://script.google.com/macros/s/.../exec。不要填 Google Sheet 網址。若同步失敗，先按「診斷連線」。</small>`);
    }
    if (cloudPanel && !document.getElementById("diagnoseCloudBtn")) {
      document.getElementById("syncSheetBtn")?.insertAdjacentHTML("afterend", `<button id="diagnoseCloudBtn" type="button">🧪 診斷連線</button>`);
    }
    const localPanel = document.getElementById("cloudStatusBadge")?.closest("article");
    if (localPanel && !document.getElementById("lastCloudSavedLine")) {
      document.getElementById("cloudStatusBadge")?.closest(".save-meter")?.insertAdjacentHTML("afterend", `<div class="save-meter"><span>最近一次雲端同步</span><strong id="lastCloudSavedLine">尚無</strong></div>`);
    }
    if (endpointInput && endpoint() && !endpointInput.value) endpointInput.value = endpoint();
    const tokenInput = document.getElementById("tokenInput");
    if (tokenInput && token() && !tokenInput.value) tokenInput.value = token();
  }

  function refreshStatus() {
    ensureSaveUi();
    const url = endpoint();
    const localState = readState();
    setText("localSaveStatus", localState ? "成功" : "失敗");
    if (!url) setCloudStatus("unset", "目前只有本機存檔，尚未啟用 Google Sheets 雲端同步。", false);
    else if (isSheetUrl(url) || !validEndpoint(url)) setCloudStatus("fail", "endpoint 欄位錯誤：請填 Apps Script Web App URL，不是 Google Sheet 網址。", false);
    else if (!busy && !document.getElementById("cloudSyncStatus")?.dataset.cloudMode) setCloudStatus("idle", "Google Sheets endpoint：已設定。建議先按「診斷連線」，通過後再同步。", false);
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
    style.textContent = `.cloud-help{display:block;margin-top:5px;color:#7a5b20;font-size:.82rem}.sync-status.fail{color:#7a2b22;border-color:rgba(182,60,45,.35);background:#fff0eb}.sync-status.busy{color:#315272;border-color:rgba(69,111,158,.35);background:#edf6ff}.sync-status.ok{color:#2f6436;border-color:rgba(95,143,61,.35);background:#eef8df}#diagnoseCloudBtn{background:linear-gradient(#fff8de,#e5c36c)}@media(max-width:768px){#save .button-row{display:grid;grid-template-columns:1fr}#save .panel{padding:12px}.sync-status{font-size:.9rem;line-height:1.45}}`;
    document.head.appendChild(style);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
