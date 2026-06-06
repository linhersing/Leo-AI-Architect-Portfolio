import { TILE_TYPES } from "../data/defaultBoard.js";
import { escapeHtml, tileLabel } from "./Tile.js";

export function renderBoardEditor(state) {
  return `
    <section class="editor-card">
      <div class="section-head">
        <div>
          <p class="eyebrow">Editor</p>
          <h2>棋盤編輯</h2>
        </div>
        <label>遊戲名稱
          <input value="${escapeHtml(state.gameTitle)}" data-action="update-title">
        </label>
      </div>
      <div class="tile-editor-list">
        ${state.board.map((tile) => `
          <article>
            <b>${tile.index}. ${escapeHtml(tile.name)}</b>
            <div class="editor-grid">
              <label>格子名稱<input value="${escapeHtml(tile.name)}" data-action="update-tile" data-id="${tile.id}" data-field="name"></label>
              <label>類型
                <select data-action="update-tile" data-id="${tile.id}" data-field="type">
                  ${TILE_TYPES.map((type) => `<option value="${type}" ${tile.type === type ? "selected" : ""}>${tileLabel(type)}</option>`).join("")}
                </select>
              </label>
              <label>土地價格<input type="number" value="${tile.price || 0}" data-action="update-tile" data-id="${tile.id}" data-field="price"></label>
              <label>過路費<input type="number" value="${tile.rent || 0}" data-action="update-tile" data-id="${tile.id}" data-field="rent"></label>
              <label>傳送目標<input type="number" min="0" max="${state.board.length - 1}" value="${tile.targetIndex ?? 0}" data-action="update-tile" data-id="${tile.id}" data-field="targetIndex"></label>
              <label>金額<input type="number" value="${tile.amount || 0}" data-action="update-tile" data-id="${tile.id}" data-field="amount"></label>
            </div>
            <label>格子描述<textarea data-action="update-tile" data-id="${tile.id}" data-field="description">${escapeHtml(tile.description || "")}</textarea></label>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}
