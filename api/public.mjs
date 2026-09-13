import { counts, list, source } from "./_lib/store.mjs";
import { handleError, json, method } from "./_lib/http.mjs";
export default async function handler(req, res) {
  if (!method(req, res, ["GET"])) return;
  try {
    const requestUrl = new URL(req.url, `https://${req.headers.host || "flowz.local"}`);
    const offset = Math.max(0, Number.parseInt(requestUrl.searchParams.get("offset") || "0", 10) || 0);
    const pageSize = 100;
    const [comments, totals, currentSource] = await Promise.all([list("approved", pageSize, offset), counts(), source()]);
    const nextOffset = comments.length === pageSize && offset + comments.length < totals.approved ? offset + comments.length : null;
    json(res, 200, {
      comments, nextOffset, total: totals.approved,
      source: currentSource ? { author: currentSource.author, url: currentSource.url } : null
    }, { "Cache-Control": "public, s-maxage=3, stale-while-revalidate=10" });
  } catch (error) { handleError(res, error); }
}
