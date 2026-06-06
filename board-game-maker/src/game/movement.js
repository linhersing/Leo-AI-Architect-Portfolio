export const START_BONUS = 500;

export function movePlayer(player, steps, boardLength) {
  const from = Number(player.position || 0);
  const raw = from + steps;
  const position = raw % boardLength;
  const passedStart = raw >= boardLength;
  return { ...player, position, money: player.money + (passedStart ? START_BONUS : 0) };
}

export function advanceTurn(state) {
  const nextIndex = (state.currentTurnIndex + 1) % state.players.length;
  const nextRound = nextIndex === 0 ? state.round + 1 : state.round;
  return { currentTurnIndex: nextIndex, round: nextRound };
}
