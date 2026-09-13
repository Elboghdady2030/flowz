import { protect } from "./_lib/auth.mjs";
import { counts, list, source } from "./_lib/store.mjs";
import { handleError, json, method } from "./_lib/http.mjs";
export default async function handler(req, res) {
  if (!method(req, res, ["GET"]) || !protect(req, res)) return;
  try {
    const [pending, totals, currentSource] = await Promise.all([list("pending", 200), counts(), source()]);
    json(res, 200, { pending, counts: totals, source: currentSource, xConfigured: Boolean(process.env.X_BEARER_TOKEN) }, { "Cache-Control": "no-store" });
  } catch (error) { handleError(res, error); }
}
