/** Página de orden de pago (canal web, post-KYC). */

function formatPrice(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

async function readJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.error || data.hint || `Error de API (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

function setStatus(text, tone = "") {
  const el = document.getElementById("pay-status");
  if (!el) return;
  el.textContent = text;
  el.hidden = !text;
  if (tone) el.dataset.tone = tone;
  else delete el.dataset.tone;
}

function breakOutOfIframe() {
  if (window.top !== window.self) {
    window.top.location.href = window.location.href;
    return true;
  }
  return false;
}

function renderOrder(rental) {
  const order = document.getElementById("pay-order");
  const itemEl = document.getElementById("pay-item");
  const metaEl = document.getElementById("pay-meta");
  const baseEl = document.getElementById("pay-base");
  const warrantyRow = document.getElementById("pay-warranty-row");
  const warrantyEl = document.getElementById("pay-warranty");
  const totalEl = document.getElementById("pay-total");

  if (itemEl) itemEl.textContent = rental.item_name || "Alquiler";
  if (metaEl) {
    const days = rental.borrow_duration;
    const label = rental.duration_label || (days === 1 ? "día" : "días");
    metaEl.textContent = `${days} ${label} · Reserva ${rental.id}`;
  }

  const base = rental.rental_base ?? rental.rental_fee ?? 0;
  const warranty = rental.rental_warranty ?? 0;
  const total = rental.rental_fee ?? base + warranty;

  if (baseEl) baseEl.textContent = formatPrice(base);
  if (totalEl) totalEl.textContent = formatPrice(total);

  if (warranty > 0) {
    if (warrantyRow) warrantyRow.hidden = false;
    if (warrantyEl) warrantyEl.textContent = formatPrice(warranty);
  }

  if (order) order.hidden = false;
  setStatus("");
}

async function loadOrder(rentalId) {
  const res = await fetch(`/api/rentals/${encodeURIComponent(rentalId)}`);
  const data = await readJson(res);
  const rental = data.rental;
  if (!rental) throw new Error("Reserva no encontrada");

  if (rental.status === "rented") {
    document.getElementById("pay-order")?.setAttribute("hidden", "");
    const done = document.getElementById("pay-done");
    if (done) done.hidden = false;
    setStatus("");
    return null;
  }

  if (rental.status !== "in_process") {
    throw new Error(
      `Esta reserva no está lista para pago (estado: ${rental.status})`
    );
  }

  renderOrder(rental);
  return rental;
}

async function checkout(rentalId) {
  const res = await fetch(
    `/api/rentals/${encodeURIComponent(rentalId)}/checkout`,
    { method: "POST" }
  );
  return readJson(res);
}

async function boot() {
  if (breakOutOfIframe()) return;

  const params = new URLSearchParams(window.location.search);
  const rentalId = params.get("rental_id");
  const submit = document.getElementById("pay-submit");

  if (!rentalId) {
    setStatus("Falta rental_id en la URL.", "error");
    return;
  }

  try {
    await loadOrder(rentalId);
  } catch (err) {
    setStatus(err.message || "No se pudo cargar la orden", "error");
    return;
  }

  submit?.addEventListener("click", async () => {
    submit.disabled = true;
    submit.classList.add("is-loading");
    setStatus("Procesando pago…");
    try {
      const result = await checkout(rentalId);
      document.getElementById("pay-order")?.setAttribute("hidden", "");
      const done = document.getElementById("pay-done");
      const msg = document.getElementById("pay-done-msg");
      if (msg && result.message) msg.textContent = result.message;
      if (done) done.hidden = false;
      setStatus("");
    } catch (err) {
      setStatus(err.message || "No se pudo completar el pago", "error");
      submit.disabled = false;
      submit.classList.remove("is-loading");
    }
  });
}

boot();
