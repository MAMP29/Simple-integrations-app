/** Cliente HTTP hacia la API del propio servidor. */

export async function fetchConfig() {
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error("No se pudo cargar la configuración");
  return res.json();
}

export async function fetchItems() {
  const res = await fetch("/api/items");
  if (!res.ok) throw new Error("No se pudo cargar el catálogo");
  const data = await res.json();
  return data.items ?? [];
}

export async function rentItem({ itemId, days, channel, extendedWarranty }) {
  const res = await fetch("/api/rent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId, days, channel, extendedWarranty }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      data.error || data.hint || `Error al iniciar el alquiler (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}
