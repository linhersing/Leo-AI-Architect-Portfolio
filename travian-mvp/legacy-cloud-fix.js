(() => {
  const STATUS_ID = "cloudSyncStatus";
  let pendingTimer = null;
  let dispatching = false;

  function boot() {
    installOverrides();
    addLegacyNotice();
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) installOverrides();
    });
    setInterval(installOverrides, 2500);
  }

  function installOverrides() {
    window.syncSheet = function legacySyncSheet(reason) {
      requestNewSync(reason || "舊同步轉接到新版同步");
    };
    window.queueCloud = function legacyQueueCloud(reason) {
      clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => requestNewSync(reason || "舊自動同步轉接到新版同步"), 1200);
    };
    window.loadCloud = function legacyLoadCloud() {
      requestNewLoad();
    };
  }

  function requestNewSync(reason) {
    if (dispatching) return;
    const button = document.getElementById("syncSheetBtn");
    if (!button) return setStatus("busy", "舊同步已停用，等待新版同步按鈕載入...");
    setStatus("busy", "已攔截舊版同步，改用新版雲端同步。" + (reason ? "（" + reason + "）" : ""));
    dispatching = true;
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    setTimeout(() => { dispatching = false; }, 80);
  }

  function requestNewLoad() {
    if (dispatching) return;
    const button = document.getElementById("loadCloudBtn");
    if (!button) return;
    dispatching = true;
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    setTimeout(() => { dispatching = false; }, 80);
  }

  function setStatus(mode, message) {
    const status = document.getElementById(STATUS_ID);
    const saveStatus = document.getElementById("saveStatus");
    if (status) {
      status.dataset.cloudMode = mode;
      status.className = "sync-status " + (mode === "ok" ? "ok" : mode === "fail" ? "fail" : "busy");
      status.textContent = message;
    }
    if (saveStatus) saveStatus.textContent = message;
  }

  function addLegacyNotice() {
    if (document.getElementById("legacyCloudFixStyles")) return;
    const style = document.createElement("style");
    style.id = "legacyCloudFixStyles";
    style.textContent = `.legacy-sync-chip{display:inline-block;margin-top:8px;border-radius:999px;padding:5px 9px;color:#315272;background:#edf6ff;border:1px solid rgba(69,111,158,.28);font-size:.8rem;font-weight:800}`;
    document.head.appendChild(style);
    const target = document.getElementById("cloudEndpointHelp");
    if (target && !document.getElementById("legacyCloudFixChip")) {
      target.insertAdjacentHTML("afterend", `<small id="legacyCloudFixChip" class="legacy-sync-chip">已啟用舊同步轉接修正：不再使用舊版 CORS 同步。</small>`);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
