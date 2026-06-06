import { currentPlayer } from "../game/gameReducer.js";

export function renderDiceButton(state) {
  const player = currentPlayer(state);
  return `
    <section class="dice-panel">
      <div>
        <p>目前玩家</p>
        <h2><span class="color-dot" style="background:${player.color}"></span>${player.emoji || "●"} ${player.name}</h2>
        <small>金錢 ${player.money.toLocaleString("zh-TW")} / 位置 ${player.position}</small>
      </div>
      <button class="dice-button" data-action="roll" ${state.finished || state.event ? "disabled" : ""}>
        ${state.lastRoll ? `🎲 ${state.lastRoll}` : "🎲 擲骰"}
      </button>
    </section>
  `;
}
