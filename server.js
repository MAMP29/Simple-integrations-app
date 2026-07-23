require("dotenv").config();

const express = require("express");
const { listItems, getItemById } = require("./data/items");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

/** Config pública para el frontend (iframe, etc.). */
app.get("/api/config", (_req, res) => {
  res.json({
    iframeFlowUrl: process.env.IFRAME_FLOW_URL || "",
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

/**
 * Inicia el flujo de alquiler:
 * 1) Valida el objeto
 * 2) Llama al outbound WhatsApp de la empresa
 */
app.post("/api/rent", async (req, res) => {
  const { itemId, phone, days } = req.body ?? {};

  if (!itemId) {
    return res.status(400).json({ error: "itemId is required" });
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

  const outboundUrl = process.env.WHATSAPP_OUTBOUND_URL;
  if (!outboundUrl) {
    return res.status(503).json({
      error: "WhatsApp outbound is not configured",
      hint: "Set WHATSAPP_OUTBOUND_URL in the environment",
    });
  }

  const totalPrice = item.pricePerDay * rentalDays;

  try {
    const payload = {
      itemId: item.id,
      itemName: item.name,
      pricePerDay: item.pricePerDay,
      days: rentalDays,
      totalPrice,
      currency: "USD",
      ...(phone ? { phone } : {}),
    };

    const headers = {
      "Content-Type": "application/json",
    };
    if (process.env.WHATSAPP_API_KEY) {
      headers.Authorization = `Bearer ${process.env.WHATSAPP_API_KEY}`;
    }

    const upstream = await fetch(outboundUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
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
        upstream: upstreamBody,
      });
    }

    return res.status(200).json({
      ok: true,
      itemId: item.id,
      days: rentalDays,
      totalPrice,
      currency: "USD",
      message: "WhatsApp flow started",
      upstream: upstreamBody,
    });
  } catch (err) {
    console.error("rent/outbound error:", err);
    return res.status(502).json({
      error: "Failed to reach WhatsApp outbound",
      detail: err.message,
    });
  }
});

/**
 * Proxy / punto de entrada para validación de identidad.
 * La integración concreta se cablea cuando tengas la herramienta.
 */
app.post("/api/identity/verify", async (req, res) => {
  // Placeholder: el frontend o el iframe del flujo llamarán aquí.
  res.status(501).json({
    error: "Identity verification not wired yet",
    received: req.body ?? {},
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
