import { createHash } from "node:crypto";
import { createSession, passwordMatches, sessionCookie } from "./_lib/auth.mjs";
import { command } from "./_lib/redis.mjs";
import { body, handleError, json, method, sameOrigin } from "./_lib/http.mjs";
export default async function handler(req, res) {
  if (!method(req, res, ["POST"])) return;
  if (!sameOrigin(req)) return json(res, 403, { error: "Invalid request origin" });
  try {
    const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0];
    const key = `flowz:login:${createHash("sha256").update(ip).digest("hex").slice(0, 20)}`;
    const attempts = Number(await command(["INCR", key]));
    if (attempts === 1) await command(["EXPIRE", key, 900]);
    if (attempts > 10) return json(res, 429, { error: "Too many sign-in attempts. Try again later." });
    if (!passwordMatches(body(req).password || "")) return json(res, 401, { error: "Incorrect password" });
    await command(["DEL", key]);
    res.setHeader("Set-Cookie", sessionCookie(req, createSession()));
    json(res, 200, { ok: true }, { "Cache-Control": "no-store" });
  } catch (error) { handleError(res, error); }
}
