/** Render y feedback de UI (sin lógica de red). */

const MIN_DAYS = 1;
const MAX_DAYS = 30;

const toastEl = () => document.getElementById("toast");
const gridEl = () => document.getElementById("catalog-grid");
const statusEl = () => document.getElementById("catalog-status");
const rentDialog = () => document.getElementById("rent-dialog");
const flowDialog = () => document.getElementById("flow-dialog");

let toastTimer;
let selectedItem = null;
let rentConfirmHandler = null;

export function formatPrice(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

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

export function renderCatalog(items, { onSelect }) {
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
    btn?.addEventListener("click", () => onSelect(item));

    grid.appendChild(card);
  });
}

export function initRentModal({ onConfirm }) {
  rentConfirmHandler = onConfirm;

  const dialog = rentDialog();
  const form = document.getElementById("rent-form");
  const daysInput = document.getElementById("rent-days");
  const minus = document.getElementById("days-minus");
  const plus = document.getElementById("days-plus");

  minus?.addEventListener("click", () => {
    setDays(Number(daysInput.value) - 1);
  });

  plus?.addEventListener("click", () => {
    setDays(Number(daysInput.value) + 1);
  });

  daysInput?.addEventListener("input", () => {
    setDays(Number(daysInput.value) || MIN_DAYS);
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    const value = submitter?.value || "cancel";

    if (value !== "confirm" || !selectedItem) {
      dialog.close();
      return;
    }

    const days = clampDays(Number(daysInput.value));
    const submitBtn = document.getElementById("rent-submit");
    setButtonLoading(submitBtn, true);

    try {
      await rentConfirmHandler?.({ item: selectedItem, days });
      dialog.close();
    } catch {
      /* el caller muestra el toast; el modal permanece abierto */
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
}

export function openRentModal(item) {
  selectedItem = item;
  const dialog = rentDialog();
  const title = document.getElementById("rent-title");
  const subtitle = document.getElementById("rent-subtitle");

  if (title) title.textContent = item.name;
  if (subtitle) {
    subtitle.textContent = "Elige los días. El total se confirma después en WhatsApp.";
  }

  setDays(1);
  updateRentSummary();
  dialog.showModal();
}

function setDays(value) {
  const daysInput = document.getElementById("rent-days");
  if (!daysInput) return;
  daysInput.value = String(clampDays(value));
  updateRentSummary();
}

function updateRentSummary() {
  if (!selectedItem) return;
  const days = clampDays(Number(document.getElementById("rent-days")?.value));
  const perDay = document.getElementById("rent-per-day");
  const total = document.getElementById("rent-total");
  if (perDay) perDay.textContent = formatPrice(selectedItem.pricePerDay);
  if (total) total.textContent = formatPrice(selectedItem.pricePerDay * days);
}

function clampDays(value) {
  if (!Number.isFinite(value)) return MIN_DAYS;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(value)));
}

export function setupFlowEntry(url) {
  const entry = document.getElementById("open-flow");
  const frame = document.getElementById("flow-frame");
  const hint = document.getElementById("flow-hint");
  const dialog = flowDialog();
  const closeBtn = document.getElementById("flow-close");

  if (!entry || !dialog) return;

  if (!url) {
    entry.hidden = true;
    frame?.removeAttribute("src");
    frame?.classList.add("is-empty");
    if (hint) hint.hidden = false;
    return;
  }

  entry.hidden = false;
  if (hint) hint.hidden = true;
  frame?.classList.remove("is-empty");

  entry.onclick = () => {
    if (frame && frame.src !== url) frame.src = url;
    dialog.showModal();
  };

  closeBtn?.addEventListener("click", () => dialog.close());
}

export function setButtonLoading(button, loading) {
  if (!button) return;
  button.disabled = loading;
  button.classList.toggle("is-loading", loading);
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
