/** Render y feedback de UI (sin lógica de red). */

const toastEl = () => document.getElementById("toast");
const gridEl = () => document.getElementById("catalog-grid");
const statusEl = () => document.getElementById("catalog-status");

let toastTimer;

export function showToast(message, tone = "info") {
  const el = toastEl();
  if (!el) return;

  el.hidden = false;
  el.dataset.tone = tone;
  el.textContent = message;
  requestAnimationFrame(() => el.classList.add("is-visible"));

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("is-visible");
    setTimeout(() => {
      el.hidden = true;
    }, 300);
  }, 3600);
}

export function setCatalogStatus(message, tone = "") {
  const el = statusEl();
  if (!el) return;
  el.textContent = message;
  if (tone) el.dataset.tone = tone;
  else delete el.dataset.tone;
}

export function renderCatalog(items, { onRent }) {
  const grid = gridEl();
  if (!grid) return;

  grid.replaceChildren();

  if (!items.length) {
    setCatalogStatus("No hay objetos disponibles por ahora.");
    return;
  }

  setCatalogStatus(`${items.length} objetos listos para alquilar.`);

  items.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "item";
    card.style.animationDelay = `${0.05 + index * 0.06}s`;
    card.dataset.itemId = item.id;

    const available = Boolean(item.available);

    card.innerHTML = `
      <div class="item__media">
        <img src="${escapeAttr(item.imageUrl)}" alt="" loading="lazy" />
      </div>
      <div class="item__body">
        <h2 class="item__name">${escapeHtml(item.name)}</h2>
        <p class="item__desc">${escapeHtml(item.description)}</p>
        <div class="item__meta">
          <p class="item__price">${formatPrice(item.pricePerDay)} <span>/ día</span></p>
          <p class="item__state ${available ? "" : "is-busy"}">
            ${available ? "Disponible" : "No disponible"}
          </p>
        </div>
        <button
          type="button"
          class="item__action"
          data-action="rent"
          ${available ? "" : "disabled"}
        >
          Alquilar
        </button>
      </div>
    `;

    const btn = card.querySelector('[data-action="rent"]');
    btn?.addEventListener("click", () => onRent(item, btn));

    grid.appendChild(card);
  });
}

export function initTabs() {
  const tabs = [...document.querySelectorAll(".tab")];
  const panels = {
    catalog: document.getElementById("panel-catalog"),
    flow: document.getElementById("panel-flow"),
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const key = tab.dataset.tab;
      tabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle("is-active", active);
        t.setAttribute("aria-selected", String(active));
      });

      Object.entries(panels).forEach(([name, panel]) => {
        if (!panel) return;
        const active = name === key;
        panel.classList.toggle("is-active", active);
        panel.hidden = !active;
      });
    });
  });
}

export function setupFlowFrame(url) {
  const frame = document.getElementById("flow-frame");
  const hint = document.getElementById("flow-hint");
  if (!frame || !hint) return;

  if (!url) {
    frame.removeAttribute("src");
    frame.classList.add("is-empty");
    hint.hidden = false;
    return;
  }

  frame.src = url;
  frame.classList.remove("is-empty");
  hint.hidden = true;
}

export function setButtonLoading(button, loading) {
  if (!button) return;
  button.disabled = loading;
  button.classList.toggle("is-loading", loading);
}

function formatPrice(value) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
