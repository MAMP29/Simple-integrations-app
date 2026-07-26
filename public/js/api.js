/** Cliente HTTP hacia la API del propio servidor. */

async function readJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      data.error || data.hint || `Error de API (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

export async function fetchConfig() {
  const res = await fetch("/api/config");
  return readJson(res);
}

export async function fetchItems() {
  const res = await fetch("/api/items");
  const data = await readJson(res);
  return data.items ?? [];
}

export async function rentItem({ itemId, days, channel, extendedWarranty }) {
  const res = await fetch("/api/rent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId, days, channel, extendedWarranty }),
  });
  return readJson(res);
}

export async function reserveRental(rentalId) {
  const res = await fetch(`/api/rentals/${rentalId}/reserve`, { method: "POST" });
  return readJson(res);
}

export async function confirmRental(rentalId) {
  const res = await fetch(`/api/rentals/${rentalId}/confirm`, { method: "POST" });
  return readJson(res);
}

export async function cancelRental(rentalId) {
  const res = await fetch(`/api/rentals/${rentalId}/cancel`, { method: "POST" });
  return readJson(res);
}

export async function checkoutRental(rentalId) {
  const res = await fetch(`/api/rentals/${rentalId}/checkout`, {
    method: "POST",
  });
  return readJson(res);
}
