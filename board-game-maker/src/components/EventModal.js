export function renderEventModal(state) {
  if (!state.event) return "";
  const details = state.event.details || {};
  return `
    <div class="modal-backdrop" role="dialog" aria-modal="true">
      <section class="event-modal ${state.event.tone || "info"}">
        <p class="eyebrow">${state.event.subtitle || "事件"}</p>
        <h2>${state.event.title}</h2>
        <p>${state.event.message}</p>
        <div class="modal-actions">
          ${details.action === "buy" ? `<button class="primary" data-action="buy-property" data-tile-id="${details.tileId}">購買土地</button>` : ""}
          ${details.action === "upgrade" ? `<button class="primary" data-action="upgrade-property" data-tile-id="${details.tileId}">升級土地</button>` : ""}
          <button data-action="end-turn">結束回合</button>
          <button class="ghost" data-action="close-event">先關閉</button>
        </div>
      </section>
    </div>
  `;
}
