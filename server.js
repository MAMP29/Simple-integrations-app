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

  const outboundUrl = process.env.WHATSAPP_OUTBOUND_URL;
  if (!outboundUrl) {
    return res.status(503).json({
      error: "WhatsApp outbound is not configured",
      hint: "Set WHATSAPP_OUTBOUND_URL in the environment",
      rental_id: rental.id,
    });
  }

  const outboundPayload = {
    rental_id: rental.id,
    borrower_name: BORROWER_NAME,
    item_name: item.name,
    rental_fee,
    borrow_duration: rentalDays,
    duration_label,
    kycRequired: warrantyOn,
    extendedWarranty: warrantyOn,
    ...(phone ? { phone } : {}),
  };

  try {
    const headers = {
      "Content-Type": "application/json",
    };
    if (process.env.WHATSAPP_API_KEY) {
      headers.Authorization = `Bearer ${process.env.WHATSAPP_API_KEY}`;
    }

    const upstream = await fetch(outboundUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(outboundPayload),
    });

    const text = await upstream.text();
    let upstreamBody = text;
    try {
      upstreamBody = JSON.parse(text);
    } catch {
      /* leave as text */
    }

    if (!upstream.ok) {
      return res.status(502).json({
        error: "WhatsApp outbound request failed",
        status: upstream.status,
        rental_id: rental.id,
        upstream: upstreamBody,
      });
    }

    return res.status(200).json({
      ok: true,
      ...apiResult,
      message: "WhatsApp flow started",
      upstream: upstreamBody,
    });
  } catch (err) {
    console.error("rent/outbound error:", err);
    return res.status(502).json({
      error: "Failed to reach WhatsApp outbound",
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
 * Proxy / punto de entrada para validación de identidad.
 * Placeholder — cablear Truora u otra herramienta después.
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
