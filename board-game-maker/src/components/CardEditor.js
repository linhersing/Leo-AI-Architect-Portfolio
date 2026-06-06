import { escapeHtml } from "./Tile.js";

export function renderCardEditor(state) {
  return `
    <section class="editor-card">
      <div class="section-head">
        <div>
          <p class="eyebrow">Cards</p>
          <h2>卡牌編輯</h2>
        </div>
        <div class="button-row">
          <button data-action="add-card" data-deck="chance">新增機會卡</button>
          <button data-action="add-card" data-deck="fate">新增命運卡</button>
        </div>
      </div>
      <div class="card-editor-columns">
        ${renderDeck("chance", "機會卡", state.cards.chance)}
        ${renderDeck("fate", "命運卡", state.cards.fate)}
      </div>
    </section>
  `;
}

function renderDeck(deck, title, cards) {
  return `
    <div>
      <h3>${title}</h3>
      ${cards.map((card) => `
        <article class="card-editor">
          <label>標題<input value="${escapeHtml(card.title)}" data-action="update-card" data-deck="${deck}" data-id="${card.id}" data-field="title"></label>
          <label>金額<input type="number" value="${card.amount || 0}" data-action="update-card" data-deck="${deck}" data-id="${card.id}" data-field="amount"></label>
          <label>內容<textarea data-action="update-card" data-deck="${deck}" data-id="${card.id}" data-field="description">${escapeHtml(card.description)}</textarea></label>
        </article>
      `).join("")}
    </div>
  `;
}
