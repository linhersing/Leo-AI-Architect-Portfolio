export const AUTOSAVE_KEY = "board-game-maker-autosave";
export const SLOT_KEYS = [
  "board-game-maker-slot-1",
  "board-game-maker-slot-2",
  "board-game-maker-slot-3",
];

export function saveGame(key, state) {
  const payload = prepareSave(state);
  localStorage.setItem(key, JSON.stringify(payload));
  return payload;
}

export function loadGame(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  return normalizeSave(JSON.parse(raw));
}

export function deleteSave(key) {
  localStorage.removeItem(key);
}

export function listSaveSlots() {
  return SLOT_KEYS.map((key, index) => {
    const save = loadGame(key);
    return { key, label: `存檔槽 ${index + 1}`, updatedAt: save?.updatedAt || "", title: save?.gameTitle || "" };
  });
}

export function exportGameJson(state) {
  return JSON.stringify(prepareSave(state), null, 2);
}

export function importGameJson(text) {
  return normalizeSave(JSON.parse(text));
}

export function prepareSave(state) {
  return {
    version: 1,
    gameId: "board-game-maker",
    gameTitle: state.gameTitle,
    players: state.players,
    board: state.board,
    cards: state.cards,
    currentTurnIndex: state.currentTurnIndex,
    round: state.round,
    logs: state.logs,
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeSave(save) {
  if (!save || save.gameId !== "board-game-maker") throw new Error("這不是 board-game-maker 存檔。");
  if (!Array.isArray(save.players) || !Array.isArray(save.board)) throw new Error("存檔缺少 players 或 board。");
  return {
    version: Number(save.version || 1),
    gameId: "board-game-maker",
    gameTitle: save.gameTitle || "自製棋盤遊戲編輯器",
    players: save.players,
    board: save.board,
    cards: save.cards || { chance: [], fate: [] },
    currentTurnIndex: Number(save.currentTurnIndex || 0),
    round: Number(save.round || 1),
    logs: Array.isArray(save.logs) ? save.logs.slice(0, 120) : [],
    updatedAt: save.updatedAt || new Date().toISOString(),
  };
}
