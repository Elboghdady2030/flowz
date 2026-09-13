import { protect } from "./_lib/auth.mjs";
import { clearComments } from "./_lib/store.mjs";
import { handleError, json, method } from "./_lib/http.mjs";
export default async function handler(req, res) {
  if (!method(req, res, ["DELETE"]) || !protect(req, res, true)) return;
  try { await clearComments(); json(res, 200, { ok: true }, { "Cache-Control": "no-store" }); }
  catch (error) { handleError(res, error); }
}
