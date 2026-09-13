import { clearSessionCookie } from "./_lib/auth.mjs";
import { json, method, sameOrigin } from "./_lib/http.mjs";
export default function handler(req, res) {
  if (!method(req, res, ["POST"])) return;
  if (!sameOrigin(req)) return json(res, 403, { error: "Invalid request origin" });
  res.setHeader("Set-Cookie", clearSessionCookie(req));
  json(res, 200, { ok: true }, { "Cache-Control": "no-store" });
}
