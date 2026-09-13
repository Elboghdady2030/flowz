import { protect } from "./_lib/auth.mjs";
import { addPending, source } from "./_lib/store.mjs";
import { getReplies } from "./_lib/x.mjs";
import { handleError, json, method } from "./_lib/http.mjs";
export default async function handler(req, res) {
  if (!method(req, res, ["POST"]) || !protect(req, res, true)) return;
  try {
    const currentSource = await source();
    if (!currentSource) throw Object.assign(new Error("Connect an X post first"), { status: 400, expose: true });
    const replies = await getReplies(currentSource.id, currentSource.url);
    const added = await addPending(replies);
    json(res, 200, { added, found: replies.length }, { "Cache-Control": "no-store" });
  } catch (error) { handleError(res, error); }
}
