import { counts, list, source } from "./_lib/store.mjs";
import { handleError, json, method } from "./_lib/http.mjs";
export default async function handler(req, res) {
  if (!method(req, res, ["GET"])) return;
  try {
    const [comments, totals, currentSource] = await Promise.all([list("approved", 24), counts(), source()]);
    json(res, 200, { comments, total: totals.approved, source: currentSource ? { author: currentSource.author, url: currentSource.url } : null }, { "Cache-Control": "public, s-maxage=3, stale-while-revalidate=10" });
  } catch (error) { handleError(res, error); }
}
