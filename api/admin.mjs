import { protect } from "./_lib/auth.mjs";
import { counts, list, source, wallSettings } from "./_lib/store.mjs";
import { handleError, json, method } from "./_lib/http.mjs";
export default async function handler(req, res) {
  if (!method(req, res, ["GET"]) || !protect(req, res)) return;
  try {
    const requestUrl = new URL(req.url, `https://${req.headers.host || "flowz.local"}`);
    const offset = Math.max(0, Number.parseInt(requestUrl.searchParams.get("offset") || "0", 10) || 0);
    const pageSize = 100;
    const [pending, totals, currentSource, settings] = await Promise.all([list("pending", pageSize, offset), counts(), source(), wallSettings()]);
    const nextOffset = pending.length === pageSize && offset + pending.length < totals.pending ? offset + pending.length : null;
    json(res, 200, {
      pending, nextOffset, counts: totals, source: currentSource, settings,
      xConfigured: Boolean(process.env.X_BEARER_TOKEN),
      xMode: process.env.X_BEARER_TOKEN ? "api" : "public"
    }, { "Cache-Control": "no-store" });
  } catch (error) { handleError(res, error); }
}
