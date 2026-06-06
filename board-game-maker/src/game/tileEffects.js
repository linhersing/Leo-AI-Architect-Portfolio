export function applyTileEffect(state, player, tile, cardPicker = pickCard) {
  if (!tile) return { state, event: event("找不到格子", "這個位置沒有格子資料。") };

  if (tile.type === "start") {
    return { state, event: event("回到起點", "你停在起點，保持目前資金。") };
  }

  if (tile.type === "bonus") {
    const amount = Number(tile.amount || 200);
    return {
      state: updatePlayerMoney(state, player.id, amount),
      event: event(tile.name, `${tile.description} +${amount} 金錢。`, "bonus"),
    };
  }

  if (tile.type === "tax") {
    const amount = Number(tile.amount || 150);
    return {
      state: updatePlayerMoney(state, player.id, -amount),
      event: event(tile.name, `${tile.description} -${amount} 金錢。`, "tax"),
    };
  }

  if (tile.type === "chance" || tile.type === "fate") {
    const card = cardPicker(state.cards[tile.type] || []);
    if (!card) return { state, event: event(tile.name, "目前沒有卡牌。") };
    return {
      state: updatePlayerMoney(state, player.id, Number(card.amount || 0)),
      event: event(card.title, card.description, tile.type, card),
    };
  }

  if (tile.type === "teleport") {
    const targetIndex = clampIndex(Number(tile.targetIndex || 0), state.board.length);
    return {
      state: updatePlayerPosition(state, player.id, targetIndex),
      event: event(tile.name, `傳送到 ${targetIndex} 號格：${state.board[targetIndex]?.name || "未知格子"}。`, "teleport"),
    };
  }

  if (tile.type === "property") return applyPropertyEffect(state, player, tile);

  return { state, event: event(tile.name, tile.description || "休息一下，無事發生。", "rest") };
}

export function buyProperty(state, tileId, playerId) {
  const tile = state.board.find((item) => item.id === tileId);
  const player = state.players.find((item) => item.id === playerId);
  if (!tile || !player || tile.type !== "property" || tile.ownerId) return state;
  if (player.money < tile.price) return state;
  return {
    ...updatePlayerMoney(state, playerId, -tile.price),
    board: state.board.map((item) => item.id === tileId ? { ...item, ownerId: playerId } : item),
  };
}

export function upgradeProperty(state, tileId, playerId) {
  const tile = state.board.find((item) => item.id === tileId);
  const player = state.players.find((item) => item.id === playerId);
  if (!tile || !player || tile.ownerId !== playerId) return state;
  const cost = upgradeCost(tile);
  if (player.money < cost) return state;
  return {
    ...updatePlayerMoney(state, playerId, -cost),
    board: state.board.map((item) => item.id === tileId ? { ...item, level: item.level + 1, rent: Math.round(item.rent * 1.35) } : item),
  };
}

export function upgradeCost(tile) {
  return Math.max(100, Math.round(Number(tile.price || 0) * 0.5 * Number(tile.level || 1)));
}

function applyPropertyEffect(state, player, tile) {
  if (!tile.ownerId) {
    return {
      state,
      event: event(tile.name, `${tile.description} 可以用 ${tile.price} 金錢購買。`, "property", { tileId: tile.id, action: "buy" }),
    };
  }

  if (tile.ownerId === player.id) {
    return {
      state,
      event: event(tile.name, `這是你的土地。可花 ${upgradeCost(tile)} 金錢升級，升級後過路費提高。`, "property", { tileId: tile.id, action: "upgrade" }),
    };
  }

  const owner = state.players.find((item) => item.id === tile.ownerId);
  const rent = Number(tile.rent || 0);
  let next = updatePlayerMoney(state, player.id, -rent);
  next = updatePlayerMoney(next, tile.ownerId, rent);
  return {
    state: next,
    event: event(tile.name, `${owner?.name || "其他玩家"} 收取過路費 ${rent} 金錢。`, "property"),
  };
}

function updatePlayerMoney(state, playerId, delta) {
  return {
    ...state,
    players: state.players.map((player) => player.id === playerId ? { ...player, money: Math.max(0, player.money + delta) } : player),
  };
}

function updatePlayerPosition(state, playerId, position) {
  return {
    ...state,
    players: state.players.map((player) => player.id === playerId ? { ...player, position } : player),
  };
}

function pickCard(cards) {
  if (!cards.length) return null;
  return cards[Math.floor(Math.random() * cards.length)];
}

function event(title, message, tone = "info", details = {}) {
  return { title, message, tone, details };
}

function clampIndex(value, length) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(length - 1, value));
}
