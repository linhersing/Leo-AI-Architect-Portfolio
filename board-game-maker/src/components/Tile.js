export function renderTile(tile, players) {
  const playersHere = players.filter((player) => player.position === tile.index);
  const owner = players.find((player) => player.id === tile.ownerId);
  return `
    <article class="tile tile-${tile.type}" data-tile-id="${tile.id}">
      <div class="tile-meta">
        <span>${tile.index}</span>
        <b>${tileLabel(tile.type)}</b>
      </div>
      <h3>${escapeHtml(tile.name)}</h3>
      <p>${escapeHtml(tile.description || "")}</p>
      ${tile.type === "property" ? `<small>價格 ${tile.price} / 過路費 ${tile.rent} / Lv.${tile.level}</small>` : ""}
      ${owner ? `<small class="owner" style="--owner:${owner.color}">擁有者：${escapeHtml(owner.name)}</small>` : ""}
      <div class="tokens">${playersHere.map((player) => `<span title="${escapeHtml(player.name)}" style="background:${player.color}"></span>`).join("")}</div>
    </article>
  `;
}

export function tileLabel(type) {
  return {
    start: "起點",
    property: "土地",
    chance: "機會",
    fate: "命運",
    tax: "稅",
    bonus: "獎金",
    rest: "休息",
    teleport: "傳送",
  }[type] || type;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
