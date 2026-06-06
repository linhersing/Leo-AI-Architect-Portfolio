import { renderBoard } from "./components/Board.js";
import { renderBoardEditor } from "./components/BoardEditor.js";
import { renderCardEditor } from "./components/CardEditor.js";
import { renderDiceButton } from "./components/DiceButton.js";
import { renderEventModal } from "./components/EventModal.js";
import { renderPlayerEditor, renderPlayerPanel } from "./components/PlayerPanel.js";
import { renderSaveManager } from "./components/SaveManager.js";
import { currentPlayer, reducer } from "./game/gameReducer.js";
import {
  AUTOSAVE_KEY,
  deleteSave,
  exportGameJson,
  importGameJson,
  listSaveSlots,
  loadGame,
  saveGame,
} from "./game/saveSystem.js";

let state = loadBootState();
let saveSlots = listSaveSlots();

const app = document.getElementById("app");

function loadBootState() {
  try {
    const save = loadGame(AUTOSAVE_KEY);
    if (save) return reducer(undefinedSafeState(), { type: "loadGame", save });
  } catch {
    localStorage.removeItem(AUTOSAVE_KEY);
  }
  return undefinedSafeState();
}

function undefinedSafeState() {
  return reducer({ players: [] }, { type: "newGame", playerCount: 2 });
}

function dispatch(action) {
  state = reducer(state, action);
  saveGame(AUTOSAVE_KEY, state);
  saveSlots = listSaveSlots();
  render();
}

function render() {
  const player = currentPlayer(state);
  document.title = `${state.gameTitle} | board-game-maker`;
  app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <span>棋</span>
        <div>
          <h1>${state.gameTitle}</h1>
          <p>board-game-maker</p>
        </div>
      </div>
      <div class="turn-strip">
        <span class="color-dot" style="background:${player.color}"></span>
        <b>${player.name}</b>
        <span>第 ${Math.min(state.round, 20)} / 20 回合</span>
        <strong>${player.money.toLocaleString("zh-TW")}</strong>
      </div>
    </header>

    <aside class="left-nav">
      <button class="${state.view === "board" ? "active" : ""}" data-action="set-view" data-view="board">▦ 棋盤</button>
      <button class="${state.view === "players" ? "active" : ""}" data-action="set-view" data-view="players">● 玩家</button>
      <button class="${state.view === "cards" ? "active" : ""}" data-action="set-view" data-view="cards">◇ 卡牌</button>
      <button class="${state.view === "save" ? "active" : ""}" data-action="set-view" data-view="save">▣ 存檔</button>
      <button class="${state.mode === "edit" ? "active" : ""}" data-action="set-mode" data-mode="${state.mode === "edit" ? "play" : "edit"}">✎ ${state.mode === "edit" ? "回遊玩" : "編輯"}</button>
      <button class="danger" data-action="new-game">新遊戲</button>
    </aside>

    <main class="main-area">
      ${state.mode === "play" ? renderPlayView() : renderEditView()}
    </main>

    ${renderPlayerPanel(state)}
    ${renderMobileNav()}
    ${renderEventModal(state)}
  `;
}

function renderPlayView() {
  if (state.view === "players") return `${renderPlayerEditor(state)}${renderBoard(state)}`;
  if (state.view === "cards") return renderCardEditor(state);
  if (state.view === "save") return renderSaveManager(state, saveSlots);
  return `${renderDiceButton(state)}${renderBoard(state)}`;
}

function renderEditView() {
  if (state.view === "cards") return renderCardEditor(state);
  if (state.view === "save") return renderSaveManager(state, saveSlots);
  if (state.view === "players") return renderPlayerEditor(state);
  return renderBoardEditor(state);
}

function renderMobileNav() {
  return `
    <nav class="mobile-nav">
      <button class="${state.view === "board" ? "active" : ""}" data-action="set-view" data-view="board">▦<span>棋盤</span></button>
      <button class="${state.view === "players" ? "active" : ""}" data-action="set-view" data-view="players">●<span>玩家</span></button>
      <button class="${state.view === "cards" ? "active" : ""}" data-action="set-view" data-view="cards">◇<span>卡牌</span></button>
      <button class="${state.view === "save" ? "active" : ""}" data-action="set-view" data-view="save">▣<span>存檔</span></button>
    </nav>
  `;
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "set-view") return dispatch({ type: "setView", view: target.dataset.view });
  if (action === "set-mode") return dispatch({ type: "setMode", mode: target.dataset.mode });
  if (action === "roll") return dispatch({ type: "roll" });
  if (action === "end-turn") return dispatch({ type: "endTurn" });
  if (action === "close-event") return dispatch({ type: "closeEvent" });
  if (action === "buy-property") return dispatch({ type: "buyProperty", tileId: target.dataset.tileId });
  if (action === "upgrade-property") return dispatch({ type: "upgradeProperty", tileId: target.dataset.tileId });
  if (action === "add-card") return dispatch({ type: "addCard", deck: target.dataset.deck });
  if (action === "new-game" && confirm("確定建立新遊戲？目前自動存檔會被覆蓋。")) return dispatch({ type: "newGame", playerCount: state.players.length });
  if (action === "save-slot") {
    saveGame(target.dataset.key, state);
    saveSlots = listSaveSlots();
    render();
  }
  if (action === "load-slot") {
    const save = loadGame(target.dataset.key);
    if (save) dispatch({ type: "loadGame", save });
  }
  if (action === "delete-slot" && confirm("確定刪除此存檔槽？")) {
    deleteSave(target.dataset.key);
    saveSlots = listSaveSlots();
    render();
  }
  if (action === "export-json") exportJson();
});

document.addEventListener("input", (event) => {
  const target = event.target;
  const action = target.dataset.action;
  if (!action) return;
  if (action === "update-title") return dispatch({ type: "updateGameTitle", title: target.value });
  if (action === "update-player") return dispatch({ type: "updatePlayer", id: target.dataset.id, patch: { [target.dataset.field]: target.value } });
  if (action === "update-tile") return dispatch({ type: "updateTile", id: target.dataset.id, patch: { [target.dataset.field]: normalizedValue(target) } });
  if (action === "update-card") return dispatch({ type: "updateCard", deck: target.dataset.deck, id: target.dataset.id, patch: { [target.dataset.field]: normalizedValue(target) } });
});

document.addEventListener("change", async (event) => {
  const target = event.target;
  if (target.dataset.action === "set-player-count") dispatch({ type: "setPlayers", count: Number(target.value) });
  if (target.dataset.action === "update-tile") dispatch({ type: "updateTile", id: target.dataset.id, patch: { [target.dataset.field]: normalizedValue(target) } });
  if (target.dataset.action === "update-card") dispatch({ type: "updateCard", deck: target.dataset.deck, id: target.dataset.id, patch: { [target.dataset.field]: normalizedValue(target) } });
  if (target.dataset.action === "import-json" && target.files?.[0]) {
    try {
      const text = await target.files[0].text();
      dispatch({ type: "loadGame", save: importGameJson(text) });
    } catch (error) {
      alert(`匯入失敗：${error.message}`);
    }
  }
});

function normalizedValue(input) {
  if (input.type === "number") return Number(input.value || 0);
  return input.value;
}

function exportJson() {
  const json = exportGameJson(state);
  const output = document.getElementById("jsonOutput");
  if (output) output.value = json;
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "board-game-maker-save.json";
  link.click();
  URL.revokeObjectURL(url);
}

saveGame(AUTOSAVE_KEY, state);
render();
