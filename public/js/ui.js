/** Render y feedback de UI (sin lógica de red). */

const MIN_DAYS = 1;
const MAX_DAYS = 30;
/** Cargo diario de la garantía extendida (USD). */
export const WARRANTY_FEE_PER_DAY = 6;

const toastEl = () => document.getElementById("toast");
const gridEl = () => document.getElementById("catalog-grid");
const statusEl = () => document.getElementById("catalog-status");
const rentDialog = () => document.getElementById("rent-dialog");
const flowDialog = () => document.getElementById("flow-dialog");

let toastTimer;
let selectedItem = null;
let rentConfirmHandler = null;
let openFlowFn = null;

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

  const availableCount = items.filter((item) => item.status === "available").length;
  setCatalogStatus(
    `${availableCount} de ${items.length} disponibles · el resto en proceso o prestados.`,
  );

  items.forEach((item, index) => {
    const card = document.createElement("article");
    const status = item.status || (item.available ? "available" : "rented");
    const canRent = status === "available";

    card.className = `item${canRent ? "" : " is-locked"}`;
    card.style.animationDelay = `${0.05 + index * 0.06}s`;
    card.dataset.itemId = item.id;

    const stateMeta = statusLabel(status);

    card.innerHTML = `
      <div class="item__media">
        <img src="${escapeAttr(item.imageUrl)}" alt="" loading="lazy" />
      </div>
      <div class="item__body">
        <h2 class="item__name">${escapeHtml(item.name)}</h2>
        <p class="item__desc">${escapeHtml(item.description)}</p>
        <div class="item__meta">
          <p class="item__price">${formatPrice(item.pricePerDay)} <span>/ día</span></p>
          <p class="item__state ${stateMeta.className}">${stateMeta.label}</p>
        </div>
        <button
          type="button"
          class="item__action"
          data-action="rent"
          ${canRent ? "" : "disabled"}
        >
          ${canRent ? "Alquilar" : stateMeta.label}
        </button>
      </div>
    `;

    const btn = card.querySelector('[data-action="rent"]');
    if (canRent) {
      btn?.addEventListener("click", () => onSelect(item));
    }

    grid.appendChild(card);
  });
}

function statusLabel(status) {
  switch (status) {
    case "in_process":
      return { label: "En proceso", className: "is-process" };
    case "rented":
      return { label: "Prestado", className: "is-rented" };
    case "available":
    default:
      return { label: "Disponible", className: "" };
  }
}

export function initRentModal({ onConfirm }) {
  rentConfirmHandler = onConfirm;

  const dialog = rentDialog();
  const form = document.getElementById("rent-form");
  const daysInput = document.getElementById("rent-days");
  const minus = document.getElementById("days-minus");
  const plus = document.getElementById("days-plus");
  const warranty = document.getElementById("rent-warranty");
  const warrantyCard = document.getElementById("warranty-card");

  minus?.addEventListener("click", () => {
    setDays(Number(daysInput.value) - 1);
  });

  plus?.addEventListener("click", () => {
    setDays(Number(daysInput.value) + 1);
  });

  daysInput?.addEventListener("input", () => {
    setDays(Number(daysInput.value) || MIN_DAYS);
  });

  warranty?.addEventListener("change", () => {
    warrantyCard?.classList.toggle("is-on", Boolean(warranty.checked));
    updateRentSummary();
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    const value = submitter?.value || "cancel";

    if ((value !== "web" && value !== "whatsapp") || !selectedItem) {
      dialog.close();
      return;
    }

    const days = clampDays(Number(daysInput.value));
    const extendedWarranty = Boolean(warranty?.checked);
    const submitBtn = submitter;
    setButtonLoading(submitBtn, true);
    setChannelButtonsDisabled(true);

    try {
      await rentConfirmHandler?.({
        item: selectedItem,
        days,
        channel: value,
        extendedWarranty,
      });
      dialog.close();
    } catch {
      /* el caller muestra el toast; el modal permanece abierto */
    } finally {
      setButtonLoading(submitBtn, false);
      setChannelButtonsDisabled(false);
    }
  });
}

export function openRentModal(item) {
  selectedItem = item;
  const dialog = rentDialog();
  const title = document.getElementById("rent-title");
  const subtitle = document.getElementById("rent-subtitle");
  const warranty = document.getElementById("rent-warranty");
  const warrantyCard = document.getElementById("warranty-card");

  if (title) title.textContent = item.name;
  if (subtitle) {
    subtitle.textContent = "Define los días y el canal para completar la validación.";
  }

  if (warranty) warranty.checked = false;
  warrantyCard?.classList.remove("is-on");

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
  const warrantyOn = Boolean(document.getElementById("rent-warranty")?.checked);
  const base = selectedItem.pricePerDay * days;
  const warrantyTotal = warrantyOn ? WARRANTY_FEE_PER_DAY * days : 0;

  const perDay = document.getElementById("rent-per-day");
  const total = document.getElementById("rent-total");
  const warrantyRow = document.getElementById("rent-warranty-row");
  const warrantyFee = document.getElementById("rent-warranty-fee");

  if (perDay) perDay.textContent = formatPrice(selectedItem.pricePerDay);
  if (warrantyRow) warrantyRow.hidden = !warrantyOn;
  if (warrantyFee) {
    warrantyFee.textContent = `${formatPrice(warrantyTotal)} (${formatPrice(WARRANTY_FEE_PER_DAY)}/día)`;
  }
  if (total) total.textContent = formatPrice(base + warrantyTotal);
}

function clampDays(value) {
  if (!Number.isFinite(value)) return MIN_DAYS;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(value)));
}

function setChannelButtonsDisabled(disabled) {
  const web = document.getElementById("rent-web");
  const wa = document.getElementById("rent-whatsapp");
  if (web) web.disabled = disabled;
  if (wa) wa.disabled = disabled;
}

export function setupFlowEntry(url, { onVerifyOk, onVerifyFail } = {}) {
  const entry = document.getElementById("open-flow");
  const frame = document.getElementById("flow-frame");
  const hint = document.getElementById("flow-hint");
  const dialog = flowDialog();
  const closeBtn = document.getElementById("flow-close");
  const actions = document.getElementById("flow-actions");
  const okBtn = document.getElementById("flow-ok");
  const failBtn = document.getElementById("flow-fail");

  if (!entry || !dialog) return;

  const openFlow = ({ showActions = false } = {}) => {
    if (url) {
      if (frame && frame.src !== url) frame.src = url;
      frame?.classList.remove("is-empty");
      if (hint) hint.hidden = true;
    } else {
      frame?.removeAttribute("src");
      frame?.classList.add("is-empty");
      if (hint) hint.hidden = false;
    }
    if (actions) actions.hidden = !showActions;
    dialog.showModal();
  };

  openFlowFn = openFlow;

  entry.hidden = !url;
  if (!url) {
    frame?.removeAttribute("src");
    frame?.classList.add("is-empty");
    if (hint) hint.hidden = false;
  } else {
    if (hint) hint.hidden = true;
    frame?.classList.remove("is-empty");
  }

  entry.onclick = () => openFlow({ showActions: false });
  closeBtn?.addEventListener("click", () => dialog.close());

  okBtn?.addEventListener("click", async () => {
    await onVerifyOk?.();
    dialog.close();
  });

  failBtn?.addEventListener("click", async () => {
    await onVerifyFail?.();
    dialog.close();
  });
}

export function setBorrowerLabel(name) {
  const el = document.getElementById("borrower-label");
  if (!el || !name) return;
  el.hidden = false;
  el.innerHTML = `Sesión de <strong>${escapeHtml(name)}</strong>`;
}

export function openWebFlow({ showActions = true } = {}) {
  openFlowFn?.({ showActions });
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
