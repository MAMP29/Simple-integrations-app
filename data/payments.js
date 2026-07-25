/** Pagos simulados en memoria. */

const payments = new Map();
let seq = 1;

function createPayment({ rental_id, amount, currency, rental_base, rental_warranty, breakdown }) {
  const id = `pay-${String(seq++).padStart(4, "0")}`;
  const payment = {
    id,
    rental_id,
    amount,
    currency: currency || "USD",
    rental_base,
    rental_warranty,
    breakdown,
    status: "approved",
    method: "card_sim",
    createdAt: new Date().toISOString(),
  };
  payments.set(id, payment);
  return { ...payment };
}

function getPayment(id) {
  const payment = payments.get(id);
  return payment ? { ...payment } : null;
}

function findPaymentByRental(rentalId) {
  for (const payment of payments.values()) {
    if (payment.rental_id === rentalId && payment.status === "approved") {
      return { ...payment };
    }
  }
  return null;
}

module.exports = {
  createPayment,
  getPayment,
  findPaymentByRental,
};
