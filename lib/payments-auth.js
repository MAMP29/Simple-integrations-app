/**
 * Auth simple para el servicio de pagos.
 * Header: Authorization: Bearer <PAYMENTS_API_KEY>
 * (también acepta X-Payments-Key)
 */
function requirePaymentsAuth(req, res, next) {
  const expected = process.env.PAYMENTS_API_KEY;
  if (!expected) {
    return res.status(503).json({
      error: "Payments service is not configured",
      hint: "Set PAYMENTS_API_KEY in the environment",
    });
  }

  const headerKey = req.get("x-payments-key");
  const auth = req.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";

  const provided = headerKey || bearer;
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
}

module.exports = { requirePaymentsAuth };
