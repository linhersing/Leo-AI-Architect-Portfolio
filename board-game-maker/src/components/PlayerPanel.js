import { currentPlayer, winners } from "../game/gameReducer.js";
import { escapeHtml } from "./Tile.js";

export function renderPlayerPanel(state) {
  const active = currentPlayer(state);
  const winnerText = state.finished ? winners(state).map((player) => player.name).join("、") : "";
  const ranked = [...state.players].sort((a, b) => b.money - a.money);
  return `
    <section class="side-panel player-panel">
      <div class="section-head tight">
        <div>
          <p class="eyebrow">Players</p>
          <h2>玩家狀態</h2>
        </div>
        <button class="ghost" data-action="set-mode" data-mode="${state.mode === "edit" ? "play" : "edit"}">${state.mode === "edit" ? "遊玩模式" : "編輯模式"}</button>
      </div>
      ${state.finished ? `<div class="winner-box"><b>勝利者：${escapeHtml(winnerText)}</b><span>金錢最高者獲勝。</span></div>` : ""}
      <div class="leaderboard">
        <h3>排行榜</h3>
        ${ranked.map((player, index) => `
          <div class="${player.id === active.id ? "active" : ""}">
            <span>${index + 1}</span>
            <b>${escapeHtml(player.emoji || "●")} ${escapeHtml(player.name)}</b>
            <strong>${player.money.toLocaleString("zh-TW")}</strong>
          </div>
        `).join("")}
      </div>
      <div class="players">
        ${state.players.map((player) => `
          <article class="${player.id === active.id ? "active" : ""}">
            <span class="color-dot" style="background:${player.color}"></span>
            <b>${escapeHtml(player.emoji || "●")} ${escapeHtml(player.name)}</b>
            <small>位置 ${player.position}</small>
            <strong>${player.money.toLocaleString("zh-TW")}</strong>
          </article>
        `).join("")}
      </div>
      <div class="log-box">
        <h3>事件紀錄</h3>
        <ol>
          ${state.logs.length ? state.logs.map((log) => `<li><time>${log.time}</time>${escapeHtml(log.message)}</li>`).join("") : "<li>尚無事件。</li>"}
        </ol>
      </div>
    </section>
  `;
}

export function renderPlayerEditor(state) {
  return `
    <section class="editor-card">
      <div class="section-head">
        <h2>玩家設定</h2>
        <label class="inline-control">玩家數
          <select data-action="set-player-count">
            ${[2, 3, 4].map((count) => `<option value="${count}" ${state.players.length === count ? "selected" : ""}>${count}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="editor-grid">
        ${state.players.map((player) => `
          <label>名稱
            <input value="${escapeHtml(player.name)}" data-action="update-player" data-id="${player.id}" data-field="name">
          </label>
          <label>棋子符號
            <input maxlength="2" value="${escapeHtml(player.emoji || "")}" data-action="update-player" data-id="${player.id}" data-field="emoji">
          </label>
          <label>顏色
            <input type="color" value="${player.color}" data-action="update-player" data-id="${player.id}" data-field="color">
          </label>
        `).join("")}
      </div>
    </section>
  `;
}
