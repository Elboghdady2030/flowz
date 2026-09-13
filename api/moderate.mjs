import { protect } from "./_lib/auth.mjs";
import { moderate } from "./_lib/store.mjs";
import { body, handleError, json, method } from "./_lib/http.mjs";
export default async function handler(req, res) {
  if (!method(req, res, ["POST"]) || !protect(req, res, true)) return;
  try {
    const input = body(req);
    if (!["approved", "rejected"].includes(input.status)) throw Object.assign(new Error("Invalid moderation action"), { status: 400, expose: true });
    if (!/^[-:\w]+$/.test(String(input.id || ""))) throw Object.assign(new Error("Invalid comment ID"), { status: 400, expose: true });
    const comment = await moderate(input.id, input.status);
    json(res, 200, { comment }, { "Cache-Control": "no-store" });
  } catch (error) { handleError(res, error); }
}
