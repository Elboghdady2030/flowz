import { protect } from "./_lib/auth.mjs";
import { clearComments, saveWallSettings } from "./_lib/store.mjs";
import { body, handleError, json, method } from "./_lib/http.mjs";
export default async function handler(req, res) {
  if (!method(req, res, ["PATCH", "DELETE"]) || !protect(req, res, true)) return;
  try {
    if (req.method === "DELETE") {
      await clearComments();
      json(res, 200, { ok: true }, { "Cache-Control": "no-store" });
      return;
    }
    const input = body(req);
    const fields = ["headerVisible", "footerVisible"].filter((key) => key in input);
    if (!fields.length || fields.some((key) => typeof input[key] !== "boolean")) {
      throw Object.assign(new Error("Display settings must be true or false"), { status: 400, expose: true });
    }
    const settings = await saveWallSettings(input);
    json(res, 200, { settings }, { "Cache-Control": "no-store" });
  }
  catch (error) { handleError(res, error); }
}
