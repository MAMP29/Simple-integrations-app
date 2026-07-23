import { fetchConfig, fetchItems, rentItem } from "./api.js";
import {
  initTabs,
  renderCatalog,
  setButtonLoading,
  setCatalogStatus,
  setupFlowFrame,
  showToast,
} from "./ui.js";

async function loadCatalog() {
  setCatalogStatus("Cargando catálogo…");
  try {
    const items = await fetchItems();
    renderCatalog(items, { onRent: handleRent });
  } catch (err) {
    setCatalogStatus(err.message || "Error al cargar el catálogo", "error");
    showToast("No se pudo cargar el catálogo", "error");
  }
}

async function handleRent(item, button) {
  setButtonLoading(button, true);
  try {
    await rentItem(item.id);
    showToast(`Flujo de WhatsApp iniciado para «${item.name}»`, "ok");
  } catch (err) {
    showToast(err.message || "No se pudo iniciar el alquiler", "error");
  } finally {
    setButtonLoading(button, false);
  }
}

async function loadConfig() {
  try {
    const config = await fetchConfig();
    setupFlowFrame(config.iframeFlowUrl || "");
  } catch {
    setupFlowFrame("");
  }
}

function boot() {
  initTabs();
  loadConfig();
  loadCatalog();
}

boot();
