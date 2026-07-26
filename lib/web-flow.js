/**
 * Cliente de iframe para flujo web (Truora Digital Identity).
 * Credenciales e IDs viven solo en env.
 */

function requireWebIntegrationToken() {
  const apiUrl = process.env.WEB_URL;
  const apiKey = process.env.OUTBOUND_API_KEY;
  const apiKeyHeader = process.env.OUTBOUND_API_KEY_HEADER;
  const flowWebId = process.env.FLOW_WEB_ID;
  const accountId = process.env.ACCOUNT_ID;
  const iframeBaseUrl = process.env.IFRAME_FLOW_URL;

  const missing = [];
  if (!apiUrl) missing.push("WEB_URL");
  if (!apiKey) missing.push("OUTBOUND_API_KEY");
  if (!apiKeyHeader) missing.push("OUTBOUND_API_KEY_HEADER");
  if (!flowWebId) missing.push("FLOW_WEB_ID");
  if (!iframeBaseUrl) missing.push("IFRAME_FLOW_URL");

  if (missing.length) {
    const err = new Error(
      `Web Flow is not configured: missing ${missing.join(", ")}`
    );
    err.status = 503;
    err.missing = missing;
    throw err;
  }

  return {
    apiUrl,
    apiKey,
    apiKeyHeader,
    accountId: accountId || "",
    flowWebId,
    iframeBaseUrl,
  };
}

/**
 * Genera un Web Integration Token y la URL del Process Link (iframe).
 * Un token por proceso de validación.
 *
 * @param {{
 *   accountId?: string,
 *   redirectUrl?: string,
 *   phone?: string,
 *   emails?: string,
 * }} [overrides]
 */
async function requestIntegrationToken(overrides = {}) {
  const cfg = requireWebIntegrationToken();
  const accountId = overrides.accountId || cfg.accountId;
  if (!accountId) {
    const err = new Error(
      "Web Flow requires account_id (pass rental id or set ACCOUNT_ID)"
    );
    err.status = 503;
    err.missing = ["ACCOUNT_ID"];
    throw err;
  }

  const redirectUrl = overrides.redirectUrl || process.env.WEB_REDIRECT_URL;
  if (!redirectUrl) {
    const err = new Error(
      "Web Flow requires redirect_url (pass pay URL or set WEB_REDIRECT_URL)"
    );
    err.status = 503;
    err.missing = ["WEB_REDIRECT_URL"];
    throw err;
  }

  const body = new URLSearchParams();
  body.set("key_type", "web");
  body.set("grant", "digital-identity");
  body.set("api_key_version", "1");
  body.set("country", "ALL");
  body.set("redirect_url", redirectUrl);
  body.set("flow_id", cfg.flowWebId);
  body.set("account_id", accountId);

  if (overrides.phone) body.set("phone", overrides.phone);
  if (overrides.emails) body.set("emails", overrides.emails);

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

  const token =
    typeof upstreamBody === "object" && upstreamBody
      ? upstreamBody.api_key
      : null;

  let iframeUrl = null;
  if (token) {
    const url = new URL(cfg.iframeBaseUrl);
    url.searchParams.set("token", token);
    iframeUrl = url.toString();
  }

  return {
    ok: upstream.ok && Boolean(iframeUrl),
    status: upstream.status,
    body: upstreamBody,
    token: token || null,
    iframeUrl,
    accountId,
  };
}

module.exports = {
  requestIntegrationToken,
  requireWebIntegrationToken,
};
