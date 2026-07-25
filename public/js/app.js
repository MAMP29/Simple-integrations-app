import {
  cancelRental,
  confirmRental,
  fetchConfig,
  fetchItems,
  rentItem,
} from "./api.js";
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

/** Rental web en verificación (garantía). */
let pendingWebRentalId = null;

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
    const result = await rentItem({
      itemId: item.id,
      days,
      channel,
      extendedWarranty,
    });

    if (channel === "web") {
      if (result.rental_status === "rented") {
        showToast(`Prestado: ${item.name}`, "ok");
        await loadCatalog();
        return;
      }

      pendingWebRentalId = result.rental_id;
      showToast(`En proceso: completa la verificación de ${item.name}`, "ok");
      await loadCatalog();
      openWebFlow({ showActions: true });
      return;
    }

    showToast({
      title: "Abre WhatsApp",
      message: `Confirma la solicitud de ${item.name} allí para continuar.`,
      tone: "whatsapp",
      prominent: true,
      actionLabel: "Entendido",
      duration: 8000,
    });
    await loadCatalog();
  } catch (err) {
    showToast(err.message || "No se pudo iniciar el alquiler", "error");
    throw err;
  }
}

async function handleWebVerifyOk() {
  if (!pendingWebRentalId) return;
  try {
    await confirmRental(pendingWebRentalId);
    showToast("Validación OK — equipo prestado", "ok");
    pendingWebRentalId = null;
    await loadCatalog();
  } catch (err) {
    showToast(err.message || "No se pudo confirmar", "error");
  }
}

async function handleWebVerifyFail() {
  if (!pendingWebRentalId) return;
  try {
    await cancelRental(pendingWebRentalId);
    showToast("Validación fallida — reserva liberada", "error");
    pendingWebRentalId = null;
    await loadCatalog();
  } catch (err) {
    showToast(err.message || "No se pudo cancelar", "error");
  }
}

async function loadConfig() {
  try {
    const config = await fetchConfig();
    setupFlowEntry(config.iframeFlowUrl || "", {
      onVerifyOk: handleWebVerifyOk,
      onVerifyFail: handleWebVerifyFail,
    });
    setBorrowerLabel(config.borrower_name || "");
  } catch {
    setupFlowEntry("", {
      onVerifyOk: handleWebVerifyOk,
      onVerifyFail: handleWebVerifyFail,
    });
  }
}

function boot() {
  initRentModal({ onConfirm: confirmRent });
  loadConfig();
  loadCatalog();
}

boot();
