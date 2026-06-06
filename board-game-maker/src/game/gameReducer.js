import { createDefaultBoard } from "../data/defaultBoard.js";
import { createDefaultCards } from "../data/defaultCards.js";
import { rollDice } from "./dice.js";
import { advanceTurn, movePlayer } from "./movement.js";
import { applyTileEffect, buyProperty, upgradeProperty } from "./tileEffects.js";

const COLORS = ["#d34a3a", "#2f7bc2", "#2f8f55", "#8a57c7"];
const MAX_ROUNDS = 20;

export function createInitialState(playerCount = 2) {
  return {
    version: 1,
    gameId: "board-game-maker",
    gameTitle: "自製棋盤遊戲編輯器",
    players: createPlayers(playerCount),
    board: createDefaultBoard(),
    cards: createDefaultCards(),
    currentTurnIndex: 0,
    round: 1,
    logs: [],
    updatedAt: new Date().toISOString(),
    mode: "play",
    view: "board",
    lastRoll: null,
    event: null,
    finished: false,
  };
}

export function hydrateState(save) {
  return {
    ...createInitialState(save.players?.length || 2),
    ...save,
    mode: "play",
    view: "board",
    lastRoll: null,
    event: null,
    finished: Number(save.round || 1) > MAX_ROUNDS,
  };
}

export function reducer(state, action) {
  switch (action.type) {
    case "newGame":
      return stamp(createInitialState(action.playerCount));
    case "loadGame":
      return stamp(hydrateState(action.save));
    case "setMode":
      return stamp({ ...state, mode: action.mode });
    case "setView":
      return stamp({ ...state, view: action.view });
    case "setPlayers":
      return stamp({ ...state, players: createPlayers(action.count) });
    case "updatePlayer":
      return stamp({ ...state, players: state.players.map((player) => player.id === action.id ? { ...player, ...action.patch } : player) });
    case "updateGameTitle":
      return stamp({ ...state, gameTitle: action.title });
    case "updateTile":
      return stamp({ ...state, board: state.board.map((tile) => tile.id === action.id ? { ...tile, ...action.patch } : tile) });
    case "updateCard":
      return stamp({
        ...state,
        cards: {
          ...state.cards,
          [action.deck]: state.cards[action.deck].map((card) => card.id === action.id ? { ...card, ...action.patch } : card),
        },
      });
    case "addCard":
      return stamp({
        ...state,
        cards: {
          ...state.cards,
          [action.deck]: [...state.cards[action.deck], { id: `${action.deck}-${Date.now()}`, title: "新卡牌", description: "請編輯卡牌效果。", amount: action.deck === "chance" ? 100 : -100 }],
        },
      });
    case "roll":
      return rollTurn(state);
    case "buyProperty":
      return stamp({ ...addLog(buyProperty(state, action.tileId, currentPlayer(state).id), `${currentPlayer(state).name} 購買土地。`), event: { title: "購買完成", message: "土地已加入你的資產。", tone: "property" } });
    case "upgradeProperty":
      return stamp({ ...addLog(upgradeProperty(state, action.tileId, currentPlayer(state).id), `${currentPlayer(state).name} 升級土地。`), event: { title: "升級完成", message: "土地等級與過路費已提高。", tone: "property" } });
    case "endTurn":
      return stamp(endTurn({ ...state, event: null }));
    case "closeEvent":
      return stamp({ ...state, event: null });
    default:
      return state;
  }
}

export function currentPlayer(state) {
  return state.players[state.currentTurnIndex] || state.players[0];
}

export function winners(state) {
  const sorted = [...state.players].sort((a, b) => b.money - a.money);
  return sorted.filter((player) => player.money === sorted[0]?.money);
}

function rollTurn(state) {
  if (state.finished || state.event) return state;
  const player = currentPlayer(state);
  const dice = rollDice();
  const movedPlayer = movePlayer(player, dice, state.board.length);
  let next = {
    ...state,
    players: state.players.map((item) => item.id === player.id ? movedPlayer : item),
    lastRoll: dice,
  };
  const tile = next.board[movedPlayer.position];
  const result = applyTileEffect(next, movedPlayer, tile);
  next = result.state;
  next.event = {
    ...result.event,
    subtitle: `${player.name} 擲出 ${dice}，移動到 ${tile.name}`,
  };
  return stamp(addLog(next, `${player.name} 擲出 ${dice}，停在 ${tile.name}。${result.event.message}`));
}

function endTurn(state) {
  const turn = advanceTurn(state);
  const finished = turn.round > MAX_ROUNDS;
  return addLog({ ...state, ...turn, finished }, finished ? "第 20 回合結束，遊戲結算。" : `輪到 ${state.players[turn.currentTurnIndex].name}。`);
}

function createPlayers(count) {
  return Array.from({ length: Math.max(2, Math.min(4, Number(count || 2))) }, (_, index) => ({
    id: `player-${index + 1}`,
    name: `玩家 ${index + 1}`,
    color: COLORS[index],
    position: 0,
    money: 3000,
  }));
}

function addLog(state, message) {
  return {
    ...state,
    logs: [{ id: `log-${Date.now()}`, time: new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }), message }, ...state.logs].slice(0, 120),
  };
}

function stamp(state) {
  return { ...state, updatedAt: new Date().toISOString() };
}
