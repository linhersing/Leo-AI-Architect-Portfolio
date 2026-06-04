(function () {
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function refreshBattleResult() {
    const box = document.getElementById("battleResult");
    const latest = document.querySelector("#reportsList li");
    if (!box || !latest || latest.textContent.includes("尚無戰報")) return;

    const text = latest.textContent.trim().replace(/\s+/g, " ");
    const win = text.includes("勝利") || text.includes("成功");
    box.className = `result ${win ? "win" : "loss"}`;
    box.innerHTML = [
      `<b>戰鬥結果：${win ? "勝利 / 防守成功" : "失敗 / 防守失敗"}</b>`,
      `<p>${escapeHtml(text)}</p>`,
      '<button type="button" class="primary full" data-view-jump="reports">📜 查看戰報</button>'
    ].join("");
  }

  document.addEventListener("click", function (event) {
    if (event.target.closest("#attackBtn") || event.target.closest('[data-view="map"]')) {
      setTimeout(refreshBattleResult, 120);
    }
  });

  setInterval(function () {
    if (document.querySelector("#map.view.active")) refreshBattleResult();
  }, 1000);
})();
