export function json(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(JSON.stringify(body));
}

export function method(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  res.setHeader("Allow", allowed.join(", "));
  json(res, 405, { error: "Method not allowed" });
  return false;
}

export function body(req, maxBytes = 24_000) {
  const length = Number(req.headers["content-length"] || 0);
  if (length > maxBytes) throw Object.assign(new Error("Request is too large"), { status: 413, expose: true });
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return {};
}

export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

export function handleError(res, error) {
  const status = Number(error.status) || 500;
  const message = status >= 500 && !error.expose ? "Service temporarily unavailable" : error.message;
  console.error(error);
  json(res, status, { error: message });
}
