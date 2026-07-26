/**
 * Cliente de outbound WhatsApp.
 * URL, IDs y nombre del header de API key viven solo en env.
 */

function requireOutboundConfig() {
  const apiUrl = process.env.OUTBOUND_API_URL;
  const apiKey = process.env.OUTBOUND_API_KEY;
  const apiKeyHeader = process.env.OUTBOUND_API_KEY_HEADER;
  const outboundId = process.env.OUTBOUND_ID;
  const phoneNumber = process.env.OUTBOUND_PHONE_NUMBER;
  const countryCode = process.env.OUTBOUND_COUNTRY_CODE;

  const missing = [];
  if (!apiUrl) missing.push("OUTBOUND_API_URL");
  if (!apiKey) missing.push("OUTBOUND_API_KEY");
  if (!apiKeyHeader) missing.push("OUTBOUND_API_KEY_HEADER");
  if (!outboundId) missing.push("OUTBOUND_ID");
  if (!phoneNumber) missing.push("OUTBOUND_PHONE_NUMBER");
  if (!countryCode) missing.push("OUTBOUND_COUNTRY_CODE");

  if (missing.length) {
    const err = new Error(`Outbound is not configured: missing ${missing.join(", ")}`);
    err.status = 503;
    err.missing = missing;
    throw err;
  }

  return {
    apiUrl,
    apiKey,
    apiKeyHeader,
    outboundId,
    phoneNumber,
    countryCode,
    flowId: process.env.FLOW_ID || "",
  };
}

/**
 * @param {object} vars — variables del template (sin prefijo var.)
 * @param {{ phoneNumber?: string, countryCode?: string }} [overrides]
 */
async function sendOutboundMessage(vars, overrides = {}) {
  const cfg = requireOutboundConfig();

  const body = new URLSearchParams();
  body.set("phone_number", overrides.phoneNumber || cfg.phoneNumber);
  body.set("country_code", overrides.countryCode || cfg.countryCode);
  body.set("outbound_id", cfg.outboundId);
  body.set("user_authorized", "true");

  if (cfg.flowId) {
    body.set("flow_id", cfg.flowId);
  }

  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined || value === null) continue;
    body.set(`var.${key}`, String(value));
  }

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    [cfg.apiKeyHeader]: cfg.apiKey,
  };

  const upstream = await fetch(cfg.apiUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });

  const text = await upstream.text();
  let upstreamBody = text;
  try {
    upstreamBody = JSON.parse(text);
  } catch {
    /* leave as text */
  }

  return {
    ok: upstream.ok,
    status: upstream.status,
    body: upstreamBody,
  };
}

module.exports = { sendOutboundMessage, requireOutboundConfig };
