(() => {
  const OFFICIAL_ENDPOINT = "https://script.google.com/macros/s/AKfycbz2ttAxilWIULbA_GNeuGk1Ltjo6iycM4w8v_RUasolmwyu62cX1S5T_sRUwX1kaa1VSw/exec";
  const ENDPOINT_KEY = "frontier-village-sheet-endpoint";
  const TOKEN_KEY = "frontier-village-sheet-token";

  function boot() {
    injectStyles();
    applyOfficialCloudEndpoint();
    simplifyNow();
    new MutationObserver(simplifyNow).observe(document.body, { childList: true, subtree: true, characterData: true });
    setInterval(simplifyNow, 800);
  }

  function simplifyNow() {
    applyOfficialCloudEndpoint();
    hideTokenField();
    hideTechnicalChip();
    simplifyHelpText();
    simplifyStatus("cloudSyncStatus");
    simplifyStatus("saveStatus");
  }

  function applyOfficialCloudEndpoint() {
    try {
      const saved = localStorage.getItem(ENDPOINT_KEY) || "";
      if (saved !== OFFICIAL_ENDPOINT) localStorage.setItem(ENDPOINT_KEY, OFFICIAL_ENDPOINT);
      localStorage.removeItem(TOKEN_KEY);
    } catch (error) {
      // localStorage may be disabled in rare private-mode contexts; the UI field still gets filled below.
    }

    const endpoint = document.getElementById("endpointInput");
    if (endpoint && endpoint.value !== OFFICIAL_ENDPOINT) endpoint.value = OFFICIAL_ENDPOINT;

    const token = document.getElementById("tokenInput");
    if (token && token.value) token.value = "";
  }

  function hideTokenField() {
    const token = document.getElementById("tokenInput");
    const label = token?.closest("label");
    if (label) label.classList.add("sync-token-hidden");
    if (token) token.value = "";
  }

  function hideTechnicalChip() {
    document.getElementById("legacyCloudFixChip")?.classList.add("technical-hidden");
  }

  function simplifyHelpText() {
    const help = document.getElementById("cloudEndpointHelp");
    if (!help) return;
    help.textContent = "Google Sheets 雲端存檔已由系統設定完成，不需要再手動貼網址。";
  }

  function simplifyStatus(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const text = el.textContent || "";
    const next = readableMessage(text);
    if (next && next !== text) el.textContent = next;
  }

  function readableMessage(text) {
    if (/目前只有本機存檔|尚未啟用 Google Sheets/.test(text)) {
      return "Google Sheets 雲端存檔已設定完成，可以按「立即同步」存檔。";
    }
    if (/方法\s*1|方法\s*2|表單備援|CORS|舊版同步|攔截舊版|舊自動同步|cloudSaveId/i.test(text)) {
      return "正在嘗試雲端存檔，系統會自動確認是否寫入成功。";
    }
    if (/診斷通過|Web App 已連線|已就緒|已設定 endpoint/.test(text)) {
      return "Google Sheets 雲端連線正常，可以按「立即同步」存檔。";
    }
    if (/Apps Script 不是最新版本|舊版或未支援/.test(text)) {
      return "雲端後端還不是最新版本，請重新部署 Apps Script 的 Code.gs 最新版本。";
    }
    if (/讀回的是舊存檔|讀回不到同一筆/.test(text)) {
      return "雲端尚未確認寫入，請等幾秒後再按一次「立即同步」。";
    }
    if (/讀回逾時|JSONP 讀取失敗/.test(text)) {
      return "雲端讀取逾時，請確認 Apps Script 權限是「所有人」。";
    }
    if (/Failed to fetch/i.test(text)) {
      return "舊同步方式失敗，請按「立即同步」使用新版 Google Sheets 存檔。";
    }
    if (/Google Sheets endpoint：已設定/.test(text)) {
      return "Google Sheets 雲端存檔已設定完成，可以按「立即同步」。";
    }
    return "";
  }

  function injectStyles() {
    if (document.getElementById("saveUiClarityStyles")) return;
    const style = document.createElement("style");
    style.id = "saveUiClarityStyles";
    style.textContent = `.sync-token-hidden,.technical-hidden{display:none!important}.sync-status{line-height:1.45}.cloud-help{line-height:1.45}`;
    document.head.appendChild(style);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
