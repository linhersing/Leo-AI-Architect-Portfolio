import { renderTile } from "./Tile.js";

export function renderBoard(state) {
  const progress = Math.min(100, Math.max(0, (Math.min(state.round, 20) / 20) * 100));
  return `
    <section class="board-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Board</p>
          <h2>${state.gameTitle}</h2>
        </div>
        <span class="round-pill">第 ${Math.min(state.round, 20)} / 20 回合</span>
      </div>
      <div class="round-progress" aria-label="回合進度">
        <div><span>起始</span><b>${Math.round(progress)}%</b><span>結算</span></div>
        <i style="width:${progress}%"></i>
      </div>
      <div class="board-grid" aria-label="棋盤">
        ${state.board.map((tile) => renderTile(tile, state.players)).join("")}
      </div>
    </section>
  `;
}
