import { command } from "./_lib/redis.mjs";
import { handleError, json, method } from "./_lib/http.mjs";
export default async function handler(req, res) {
  if (!method(req, res, ["GET"])) return;
  try { await command(["PING"]); json(res, 200, { ok: true, storage: "connected", xConfigured: true, xMode: process.env.X_BEARER_TOKEN ? "api" : "public" }, { "Cache-Control": "no-store" }); }
  catch (error) { handleError(res, error); }
}
