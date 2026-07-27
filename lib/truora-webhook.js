/**
 * Parseo / verificación de webhooks Truora (Digital Identity — Web Processes).
 * El body suele ser un JWT firmado; el secret lo da Truora al crear la acción.
 */

const jwt = require("jsonwebtoken");

/**
 * Extrae el JWT crudo del request (string, JSON, o campo habitual).
 * @param {Buffer|string|object} body
 */
function extractToken(body) {
  if (body == null) return null;

  if (Buffer.isBuffer(body)) {
    return extractToken(body.toString("utf8"));
  }

  if (typeof body === "object" && !Array.isArray(body)) {
    return (
      body.token ||
      body.jwt ||
      body.data ||
      body.payload ||
      null
    );
  }

  const text = String(body).trim();
  if (!text) return null;

  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      return extractToken(parsed);
    } catch {
      return text;
    }
  }

  // JWT: header.payload.signature
  if (text.split(".").length === 3) return text;

  return text;
}

/**
 * Normaliza account_id / evento desde payloads variados de Truora.
 * @param {object} decoded
 */
function normalizeWebhookPayload(decoded) {
  const obj = decoded?.object && typeof decoded.object === "object"
    ? decoded.object
    : decoded;

  const accountId =
    obj.account_id ||
    obj.accountId ||
    obj["Account ID"] ||
    decoded.account_id ||
    decoded.accountId ||
    null;

  const processId =
    obj.identity_process_id ||
    obj.process_id ||
    obj["Identity process ID"] ||
    decoded.identity_process_id ||
    decoded.process_id ||
    null;

  const flowId =
    obj.flow_id ||
    obj["Flow ID"] ||
    decoded.flow_id ||
    null;

  const eventRaw = [
    decoded.event,
    decoded.event_name,
    decoded.eventName,
    decoded.type,
    decoded.name,
    decoded.action,
    obj.status,
    obj.process_status,
    decoded.status,
  ]
    .filter(Boolean)
    .map(String)
    .join(" ");

  const lower = eventRaw.toLowerCase();
  let outcome = "unknown";
  if (
    /overwritten\s*success|process\.succeeded|identity process succeeded|\bsuccess\b/.test(
      lower
    ) && !/fail/.test(lower)
  ) {
    outcome = "success";
  } else if (
    /overwritten\s*fail|process\.failed|identity process failed|\bfail/.test(
      lower
    )
  ) {
    outcome = "failed";
  } else if (/\bcreated\b|step succeeded/.test(lower)) {
    outcome = "info";
  }

  return {
    accountId: accountId ? String(accountId) : null,
    processId: processId ? String(processId) : null,
    flowId: flowId ? String(flowId) : null,
    eventRaw: eventRaw || null,
    outcome,
    decoded,
  };
}

/**
 * @param {string} token
 * @param {string} [secret]
 * @returns {{ verified: boolean, payload: object }}
 */
function verifyWebhookToken(token, secret) {
  if (!token) {
    const err = new Error("Missing webhook JWT");
    err.status = 400;
    throw err;
  }

  if (secret) {
    try {
      const payload = jwt.verify(token, secret);
      return { verified: true, payload };
    } catch (err) {
      const e = new Error(`Invalid webhook JWT: ${err.message}`);
      e.status = 401;
      throw e;
    }
  }

  // Sin secret: decodifica para poder cablear el endpoint; no es seguro en prod.
  const payload = jwt.decode(token);
  if (!payload || typeof payload !== "object") {
    const err = new Error("Could not decode webhook JWT");
    err.status = 400;
    throw err;
  }
  return { verified: false, payload };
}

module.exports = {
  extractToken,
  normalizeWebhookPayload,
  verifyWebhookToken,
};
