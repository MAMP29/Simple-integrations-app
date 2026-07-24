import { fetchConfig, fetchItems, rentItem } from "./api.js";
import {
  initRentModal,
  openRentModal,
  openWebFlow,
  renderCatalog,
  setBorrowerLabel,
  setCatalogStatus,
  setupFlowEntry,
  showToast,
} from "./ui.js";

async function loadCatalog() {
  setCatalogStatus("Cargando catálogo…");
  try {
    const items = await fetchItems();
    renderCatalog(items, { onSelect: openRentModal });
  } catch (err) {
    setCatalogStatus(err.message || "Error al cargar el catálogo", "error");
    showToast("No se pudo cargar el catálogo", "error");
  }
}

async function confirmRent({ item, days, channel, extendedWarranty }) {
  try {
    await rentItem({ itemId: item.id, days, channel, extendedWarranty });

    if (channel === "web") {
      showToast(
        `Validación web lista: ${item.name} · ${days} día${days === 1 ? "" : "s"}.`,
        "ok",
      );
      openWebFlow();
      return;
    }

    showToast(
      `Canal WhatsApp iniciado: ${item.name} · ${days} día${days === 1 ? "" : "s"}.`,
      "ok",
    );
  } catch (err) {
    showToast(err.message || "No se pudo iniciar el alquiler", "error");
    throw err;
  }
}

async function loadConfig() {
  try {
    const config = await fetchConfig();
    setupFlowEntry(config.iframeFlowUrl || "");
    setBorrowerLabel(config.borrower_name || "");
  } catch {
    setupFlowEntry("");
  }
}

function boot() {
  initRentModal({ onConfirm: confirmRent });
  loadConfig();
  loadCatalog();
}

boot();
