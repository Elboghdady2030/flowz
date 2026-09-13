import { randomUUID } from "node:crypto";
import { protect } from "./_lib/auth.mjs";
import { addPending } from "./_lib/store.mjs";
import { body, handleError, json, method } from "./_lib/http.mjs";
function clean(items) {
  if (!Array.isArray(items) || !items.length) throw Object.assign(new Error("Add at least one comment"), { status: 400, expose: true });
  if (items.length > 100) throw Object.assign(new Error("Import up to 100 comments at a time"), { status: 400, expose: true });
  return items.map((item) => {
    const text = String(item.text || "").trim().slice(0, 500);
    const author = String(item.author || "@guest").trim().replace(/[^@\w.-]/g, "").slice(0, 40);
    if (!text) throw Object.assign(new Error("Every comment needs text"), { status: 400, expose: true });
    return { id: `manual:${randomUUID()}`, author: author.startsWith("@") ? author : `@${author}`, name: author, text, createdAt: new Date().toISOString() };
  });
}
export default async function handler(req, res) {
  if (!method(req, res, ["POST"]) || !protect(req, res, true)) return;
  try { const items = clean(body(req).items); const added = await addPending(items); json(res, 200, { added }, { "Cache-Control": "no-store" }); }
  catch (error) { handleError(res, error); }
}
