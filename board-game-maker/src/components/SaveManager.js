import { SLOT_KEYS } from "../game/saveSystem.js";

export function renderSaveManager(state, slots) {
  return `
    <section class="save-manager">
      <div class="section-head">
        <div>
          <p class="eyebrow">Save</p>
          <h2>存檔管理</h2>
        </div>
        <span class="round-pill">自動存檔：已啟用</span>
      </div>
      <div class="save-grid">
        ${slots.map((slot, index) => `
          <article>
            <h3>${slot.label}</h3>
            <p>${slot.updatedAt ? `${slot.title || state.gameTitle}<br>${new Date(slot.updatedAt).toLocaleString("zh-TW")}` : "尚無存檔"}</p>
            <div class="button-row">
              <button data-action="save-slot" data-key="${SLOT_KEYS[index]}">存檔</button>
              <button data-action="load-slot" data-key="${SLOT_KEYS[index]}" ${slot.updatedAt ? "" : "disabled"}>讀取</button>
              <button class="danger" data-action="delete-slot" data-key="${SLOT_KEYS[index]}" ${slot.updatedAt ? "" : "disabled"}>刪除</button>
            </div>
          </article>
        `).join("")}
      </div>
      <div class="import-export">
        <button class="primary" data-action="export-json">匯出 JSON</button>
        <label class="file-button">匯入 JSON
          <input type="file" accept="application/json" data-action="import-json">
        </label>
      </div>
      <textarea id="jsonOutput" readonly placeholder="匯出的 JSON 會顯示在這裡，也會自動下載。"></textarea>
    </section>
  `;
}
