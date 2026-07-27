const { getItemRecord, setItemStatus } = require("./items");

/** Rentals en memoria. Se pierden al reiniciar el server. */
const rentals = new Map();
let seq = 1;

function createRental({
  itemId,
  channel,
  borrow_duration,
  rental_fee,
  rental_base,
  rental_warranty,
  price_per_day,
  warranty_fee_per_day,
  duration_label,
  borrower_name,
  item_name,
  extendedWarranty,
  phone,
}) {
  const item = getItemRecord(itemId);
  if (!item) {
    const err = new Error("Item not found");
    err.status = 404;
    throw err;
  }
  if (item.status !== "available") {
    const err = new Error("Item is not available");
    err.status = 409;
    throw err;
  }

  const id = `rnt-${String(seq++).padStart(4, "0")}`;
  const rental = {
    id,
    itemId,
    channel,
    status: "pending",
    borrower_name,
    item_name,
    price_per_day: price_per_day ?? 0,
    warranty_fee_per_day: warranty_fee_per_day ?? 0,
    rental_fee,
    rental_base: rental_base ?? rental_fee,
    rental_warranty: rental_warranty ?? 0,
    borrow_duration,
    duration_label,
    extendedWarranty: Boolean(extendedWarranty),
    kycRequired: Boolean(extendedWarranty),
    kyc_ok: null,
    kyc_at: null,
    kyc_process_id: null,
    phone: phone || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  rentals.set(id, rental);
  return { ...rental };
}

function getRental(id) {
  const rental = rentals.get(id);
  return rental ? { ...rental } : null;
}

function touch(rental) {
  rental.updatedAt = new Date().toISOString();
}

/**
 * Opción A: al confirmar "Sí" en WA → pending → in_process
 * El ítem pasa a in_process.
 */
function reserveRental(id) {
  const rental = rentals.get(id);
  if (!rental) {
    const err = new Error("Rental not found");
    err.status = 404;
    throw err;
  }
  if (rental.status === "in_process") {
    return { ...rental, item: setItemStatus(rental.itemId, "in_process") };
  }
  if (rental.status !== "pending") {
    const err = new Error(`Cannot reserve rental in status '${rental.status}'`);
    err.status = 409;
    throw err;
  }

  const item = getItemRecord(rental.itemId);
  if (!item || item.status !== "available") {
    const err = new Error("Item is not available to reserve");
    err.status = 409;
    throw err;
  }

  rental.status = "in_process";
  touch(rental);
  const publicItem = setItemStatus(rental.itemId, "in_process");
  return { ...rental, item: publicItem };
}

/** in_process → rented */
function confirmRental(id) {
  const rental = rentals.get(id);
  if (!rental) {
    const err = new Error("Rental not found");
    err.status = 404;
    throw err;
  }
  if (rental.status === "rented") {
    return { ...rental, item: setItemStatus(rental.itemId, "rented") };
  }
  if (rental.status !== "in_process") {
    const err = new Error(`Cannot confirm rental in status '${rental.status}'`);
    err.status = 409;
    throw err;
  }

  rental.status = "rented";
  touch(rental);
  const publicItem = setItemStatus(rental.itemId, "rented");
  return { ...rental, item: publicItem };
}

/** pending | in_process → cancelled; ítem vuelve a available */
function cancelRental(id) {
  const rental = rentals.get(id);
  if (!rental) {
    const err = new Error("Rental not found");
    err.status = 404;
    throw err;
  }
  if (rental.status === "cancelled") {
    return { ...rental, item: setItemStatus(rental.itemId, "available") };
  }
  if (rental.status === "rented") {
    const err = new Error("Cannot cancel a completed rental");
    err.status = 409;
    throw err;
  }

  rental.status = "cancelled";
  touch(rental);
  const publicItem = setItemStatus(rental.itemId, "available");
  return { ...rental, item: publicItem };
}

/**
 * Marca resultado KYC sin cambiar status del rental (sigue in_process hasta pago/confirm).
 * @param {string} id
 * @param {{ ok: boolean, processId?: string|null }} result
 */
function markKycResult(id, { ok, processId = null }) {
  const rental = rentals.get(id);
  if (!rental) {
    const err = new Error("Rental not found");
    err.status = 404;
    throw err;
  }

  rental.kyc_ok = Boolean(ok);
  rental.kyc_at = new Date().toISOString();
  if (processId) rental.kyc_process_id = processId;
  touch(rental);
  return { ...rental };
}

module.exports = {
  createRental,
  getRental,
  reserveRental,
  confirmRental,
  cancelRental,
  markKycResult,
};
