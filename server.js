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
const { requestIntegrationToken } = require("./lib/web-flow");

const app = express();
const PORT = process.env.PORT || 3000;
const BORROWER_NAME = process.env.BORROWER_NAME || "Ana Rivera";
const WARRANTY_FEE_PER_DAY = 6;

app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader("Permissions-Policy", "camera=*, microphone=*");
  next();
});
app.use(express.static("public"));

function sendRentalError(res, err) {
  const status = err.status || 500;
  return res.status(status).json({ error: err.message });
}

/** Base pública de la app (redirect Truora necesita URL absoluta). */
function appBaseUrl(req) {
  const fromEnv = (process.env.PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const proto = req.get("x-forwarded-proto") || req.protocol || "http";
  const host = req.get("x-forwarded-host") || req.get("host");
  return `${proto}://${host}`;
}

function payUrlForRental(req, rentalId) {
  return `${appBaseUrl(req)}/pay.html?rental_id=${encodeURIComponent(rentalId)}`;
}

/**
 * Cobro simulado. No confirma el rental (eso lo hace checkout o la integración WA).
 * @returns {{ payment: object, already_paid: boolean, rental: object }}
 */
function simulateCharge(rentalId) {
  const rental = getRental(rentalId);
  if (!rental) {
    const err = new Error("Rental not found");
    err.status = 404;
    throw err;
  }
  if (rental.status !== "in_process") {
    const err = new Error(`Cannot charge rental in status '${rental.status}'`);
    err.status = 409;
    err.hint = "Rental must be in_process (reserved) before payment";
    throw err;
  }

  const existing = findPaymentByRental(rentalId);
  if (existing) {
    return { payment: existing, already_paid: true, rental };
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
      price_per_day: rental.price_per_day,
      warranty_fee_per_day: rental.warranty_fee_per_day,
      rental_base,
      rental_warranty,
      total: amount,
    },
  });

  return { payment, already_paid: false, rental };
}

/** Config pública para el frontend. */
app.get("/api/config", (_req, res) => {
  const iframeFlowUrl = process.env.IFRAME_FLOW_URL || "";
  let iframeOrigin = "";
  try {
    if (iframeFlowUrl) iframeOrigin = new URL(iframeFlowUrl).origin;
  } catch {
    /* URL inválida en env */
  }

  res.json({
    iframeOrigin,
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
  const warrantyFeePerDay = warrantyOn ? WARRANTY_FEE_PER_DAY : 0;
  const warrantyTotal = warrantyFeePerDay * rentalDays;
  const pricePerDay = item.pricePerDay;
  const basePrice = pricePerDay * rentalDays;
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
      price_per_day: pricePerDay,
      warranty_fee_per_day: warrantyFeePerDay,
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
    price_per_day: pricePerDay,
    warranty_fee_per_day: warrantyFeePerDay,
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
        return res.status(200).json({
          ok: true,
          ...apiResult,
          rental_status: rental.status,
          item: rental.item,
          message: "Web rental confirmed",
        });
      }
    } catch (err) {
      return sendRentalError(res, err);
    }

    /** Con garantía: token por proceso (account_id = rental_id). */
    try {
      const payUrl = payUrlForRental(req, rental.id);
      const session = await requestIntegrationToken({
        accountId: rental.id,
        redirectUrl: payUrl,
      });

      if (!session.ok) {
        try {
          cancelRental(rental.id);
        } catch {
          /* best effort */
        }
        return res.status(502).json({
          error: "Failed to create identity verification session",
          status: session.status,
          rental_id: rental.id,
          upstream: session.body,
        });
      }

      return res.status(200).json({
        ok: true,
        ...apiResult,
        rental_status: rental.status,
        item: rental.item,
        iframeUrl: session.iframeUrl,
        payUrl,
        message: "Web rental reserved — complete verification",
      });
    } catch (err) {
      try {
        cancelRental(rental.id);
      } catch {
        /* best effort */
      }
      if (err.status === 503) {
        return res.status(503).json({
          error: err.message,
          missing: err.missing,
          rental_id: rental.id,
        });
      }
      console.error("rent/web-flow error:", err);
      return res.status(502).json({
        error: "Failed to reach identity API",
        detail: err.message,
        rental_id: rental.id,
      });
    }
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
    price_per_day: pricePerDay,
    warranty_fee_per_day: warrantyFeePerDay,
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
 * Checkout web (sin API key en el browser): cobra simulado + confirma.
 * Paralelo a POST /api/payments/charge usado por la integración WA.
 */
app.post("/api/rentals/:id/checkout", (req, res) => {
  try {
    const { payment, already_paid } = simulateCharge(req.params.id);
    const rental = confirmRental(req.params.id);
    return res.json({
      ok: true,
      already_paid,
      payment,
      rental,
      item: rental.item,
      message: already_paid
        ? "Already paid — rental confirmed"
        : "Payment approved — rental confirmed",
    });
  } catch (err) {
    if (err.hint) {
      return res.status(err.status || 409).json({
        error: err.message,
        hint: err.hint,
      });
    }
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

  try {
    const { payment, already_paid } = simulateCharge(rentalId);
    return res.status(200).json({
      ok: true,
      already_paid,
      payment,
      message: already_paid
        ? "Already paid (simulation)"
        : "Payment approved (simulation)",
    });
  } catch (err) {
    if (err.hint) {
      return res.status(err.status || 409).json({
        error: err.message,
        hint: err.hint,
      });
    }
    return sendRentalError(res, err);
  }
});

app.get("/api/payments/:id", requirePaymentsAuth, (req, res) => {
  const payment = getPayment(req.params.id);
  if (!payment) {
    return res.status(404).json({ error: "Payment not found" });
  }
  res.json({ payment });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
