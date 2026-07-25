require("dotenv").config();

const express = require("express");
const { listItems, getItemById } = require("./data/items");
const {
  createRental,
  getRental,
  reserveRental,
  confirmRental,
  cancelRental,
} = require("./data/rentals");
const {
  createPayment,
  getPayment,
  findPaymentByRental,
} = require("./data/payments");
const { sendOutboundMessage } = require("./lib/outbound");
const { requirePaymentsAuth } = require("./lib/payments-auth");

const app = express();
const PORT = process.env.PORT || 3000;
const BORROWER_NAME = process.env.BORROWER_NAME || "Ana Rivera";
const WARRANTY_FEE_PER_DAY = 6;

app.use(express.json());
app.use(express.static("public"));

function sendRentalError(res, err) {
  const status = err.status || 500;
  return res.status(status).json({ error: err.message });
}

/** Config pública para el frontend. */
app.get("/api/config", (_req, res) => {
  res.json({
    iframeFlowUrl: process.env.IFRAME_FLOW_URL || "",
    borrower_name: BORROWER_NAME,
  });
});

/** Lista de objetos alquilables. */
app.get("/api/items", (_req, res) => {
  res.json({ items: listItems() });
});

/** Detalle de un objeto. */
app.get("/api/items/:id", (req, res) => {
  const item = getItemById(req.params.id);
  if (!item) {
    return res.status(404).json({ error: "Item not found" });
  }
  res.json({ item });
});

/** Detalle de una reserva. */
app.get("/api/rentals/:id", (req, res) => {
  const rental = getRental(req.params.id);
  if (!rental) {
    return res.status(404).json({ error: "Rental not found" });
  }
  res.json({ rental });
});

/**
 * Inicia alquiler:
 * - whatsapp → crea rental pending + outbound (hold al "Sí" vía /reserve)
 * - web → reserve inmediato; sin garantía confirma; con garantía deja in_process
 */
app.post("/api/rent", async (req, res) => {
  const { itemId, phone, days, channel, extendedWarranty } = req.body ?? {};

  if (!itemId) {
    return res.status(400).json({ error: "itemId is required" });
  }

  if (channel !== "web" && channel !== "whatsapp") {
    return res.status(400).json({ error: "channel must be 'web' or 'whatsapp'" });
  }

  const rentalDays = Number(days);
  if (!Number.isInteger(rentalDays) || rentalDays < 1 || rentalDays > 30) {
    return res.status(400).json({ error: "days must be an integer between 1 and 30" });
  }

  const item = getItemById(itemId);
  if (!item) {
    return res.status(404).json({ error: "Item not found" });
  }
  if (!item.available) {
    return res.status(409).json({ error: "Item is not available" });
  }

  const warrantyOn = Boolean(extendedWarranty);
  const warrantyTotal = warrantyOn ? WARRANTY_FEE_PER_DAY * rentalDays : 0;
  const basePrice = item.pricePerDay * rentalDays;
  const rental_fee = basePrice + warrantyTotal;
  const duration_label = rentalDays === 1 ? "día" : "días";

  let rental;
  try {
    rental = createRental({
      itemId,
      channel,
      borrow_duration: rentalDays,
      rental_fee,
      rental_base: basePrice,
      rental_warranty: warrantyTotal,
      duration_label,
      borrower_name: BORROWER_NAME,
      item_name: item.name,
      extendedWarranty: warrantyOn,
      phone,
    });
  } catch (err) {
    return sendRentalError(res, err);
  }

  const apiResult = {
    rental_id: rental.id,
    channel,
    extendedWarranty: warrantyOn,
    kycRequired: warrantyOn,
    borrower_name: BORROWER_NAME,
    item_name: item.name,
    rental_fee,
    rental_base: basePrice,
    rental_warranty: warrantyTotal,
    borrow_duration: rentalDays,
    duration_label,
    currency: "USD",
    rental_status: rental.status,
    ...(phone ? { phone } : {}),
  };

  if (channel === "web") {
    try {
      rental = reserveRental(rental.id);
      if (!warrantyOn) {
        rental = confirmRental(rental.id);
      }
    } catch (err) {
      return sendRentalError(res, err);
    }

    return res.status(200).json({
      ok: true,
      ...apiResult,
      rental_status: rental.status,
      item: rental.item,
      message: warrantyOn
        ? "Web rental reserved — complete verification"
        : "Web rental confirmed",
    });
  }

  const outboundUrl = process.env.OUTBOUND_API_URL;
  if (!outboundUrl) {
    return res.status(503).json({
      error: "Outbound is not configured",
      hint: "Set OUTBOUND_API_URL, OUTBOUND_API_KEY, OUTBOUND_ID, FLOW_ID, etc.",
      rental_id: rental.id,
    });
  }

  /** Variables del template / flujo WA → se envían como var.<nombre> */
  const templateVars = {
    borrower_name: BORROWER_NAME,
    item_name: item.name,
    rental_fee,
    rental_base: basePrice,
    rental_warranty: warrantyTotal,
    borrow_duration: rentalDays,
    duration_label,
    rental_id: rental.id,
    kycRequired: warrantyOn,
  };

  try {
    const upstream = await sendOutboundMessage(templateVars, {
      phoneNumber: phone || undefined,
    });

    if (!upstream.ok) {
      return res.status(502).json({
        error: "Outbound request failed",
        status: upstream.status,
        rental_id: rental.id,
        upstream: upstream.body,
      });
    }

    return res.status(200).json({
      ok: true,
      ...apiResult,
      message: "WhatsApp flow started",
      upstream: upstream.body,
    });
  } catch (err) {
    if (err.status === 503) {
      return res.status(503).json({
        error: err.message,
        missing: err.missing,
        rental_id: rental.id,
      });
    }
    console.error("rent/outbound error:", err);
    return res.status(502).json({
      error: "Failed to reach outbound API",
      detail: err.message,
      rental_id: rental.id,
    });
  }
});

/** Integración WA: Sí → poner en proceso. */
app.post("/api/rentals/:id/reserve", (req, res) => {
  try {
    const rental = reserveRental(req.params.id);
    return res.json({ ok: true, rental, item: rental.item });
  } catch (err) {
    return sendRentalError(res, err);
  }
});

/** Integración WA / web: confirmar préstamo. */
app.post("/api/rentals/:id/confirm", (req, res) => {
  try {
    const rental = confirmRental(req.params.id);
    return res.json({ ok: true, rental, item: rental.item });
  } catch (err) {
    return sendRentalError(res, err);
  }
});

/** Integración WA / web: cancelar y liberar. */
app.post("/api/rentals/:id/cancel", (req, res) => {
  try {
    const rental = cancelRental(req.params.id);
    return res.json({ ok: true, rental, item: rental.item });
  } catch (err) {
    return sendRentalError(res, err);
  }
});

/**
 * Servicio de pagos (simulado) — requiere PAYMENTS_API_KEY.
 * Headers: Authorization: Bearer <key>  o  X-Payments-Key: <key>
 */
app.get("/api/payments/health", requirePaymentsAuth, (_req, res) => {
  res.json({
    ok: true,
    service: "payments",
    status: "active",
    mode: "simulation",
  });
});

app.post("/api/payments/charge", requirePaymentsAuth, (req, res) => {
  const { rental_id: rentalId } = req.body ?? {};
  if (!rentalId) {
    return res.status(400).json({ error: "rental_id is required" });
  }

  const rental = getRental(rentalId);
  if (!rental) {
    return res.status(404).json({ error: "Rental not found" });
  }
  if (rental.status !== "in_process") {
    return res.status(409).json({
      error: `Cannot charge rental in status '${rental.status}'`,
      hint: "Rental must be in_process (reserved) before payment",
    });
  }

  const existing = findPaymentByRental(rentalId);
  if (existing) {
    return res.status(200).json({
      ok: true,
      already_paid: true,
      payment: existing,
    });
  }

  const rental_base = rental.rental_base ?? rental.rental_fee;
  const rental_warranty = rental.rental_warranty ?? 0;
  const amount = rental.rental_fee;

  const payment = createPayment({
    rental_id: rentalId,
    amount,
    currency: "USD",
    rental_base,
    rental_warranty,
    breakdown: {
      item: rental.item_name,
      days: rental.borrow_duration,
      duration_label: rental.duration_label,
      rental_base,
      rental_warranty,
      total: amount,
    },
  });

  return res.status(200).json({
    ok: true,
    payment,
    message: "Payment approved (simulation)",
  });
});

app.get("/api/payments/:id", requirePaymentsAuth, (req, res) => {
  const payment = getPayment(req.params.id);
  if (!payment) {
    return res.status(404).json({ error: "Payment not found" });
  }
  res.json({ payment });
});

/**
 * Proxy / punto de entrada para validación de identidad.
 * Placeholder — cablear la herramienta de identidad después.
 */
app.post("/api/identity/verify", async (req, res) => {
  res.status(501).json({
    error: "Identity verification not wired yet",
    received: req.body ?? {},
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
