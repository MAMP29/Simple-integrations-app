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
let webVerifyBusy = false;

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

      if (result.iframeUrl) {
        openWebFlow({ url: result.iframeUrl, showActions: false });
      } else {
        showToast(
          "No se recibió URL de verificación; usa los botones de simulación",
          "error"
        );
        openWebFlow({ url: "", showActions: true });
      }
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
  if (!pendingWebRentalId || webVerifyBusy) return;
  const rentalId = pendingWebRentalId;
  pendingWebRentalId = null;
  webVerifyBusy = true;
  try {
    await confirmRental(rentalId);
    showToast("Validación OK — equipo prestado", "ok");
    await loadCatalog();
  } catch (err) {
    pendingWebRentalId = rentalId;
    showToast(err.message || "No se pudo confirmar", "error");
  } finally {
    webVerifyBusy = false;
  }
}

async function handleWebVerifyFail() {
  if (!pendingWebRentalId || webVerifyBusy) return;
  const rentalId = pendingWebRentalId;
  pendingWebRentalId = null;
  webVerifyBusy = true;
  try {
    await cancelRental(rentalId);
    showToast("Validación fallida — reserva liberada", "error");
    await loadCatalog();
  } catch (err) {
    pendingWebRentalId = rentalId;
    showToast(err.message || "No se pudo cancelar", "error");
  } finally {
    webVerifyBusy = false;
  }
}

async function loadConfig() {
  try {
    const config = await fetchConfig();
    setupFlowEntry({
      iframeOrigin: config.iframeOrigin || "",
      onVerifyOk: handleWebVerifyOk,
      onVerifyFail: handleWebVerifyFail,
    });
    setBorrowerLabel(config.borrower_name || "");
  } catch {
    setupFlowEntry({
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
