import { protect } from "./_lib/auth.mjs";
import { saveSource } from "./_lib/store.mjs";
import { getPost } from "./_lib/x.mjs";
import { body, handleError, json, method } from "./_lib/http.mjs";
function parsePostUrl(value) {
  let url;
  try { url = new URL(String(value)); } catch { throw Object.assign(new Error("Enter a valid X post URL"), { status: 400, expose: true }); }
  if (!["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname)) throw Object.assign(new Error("Use an x.com or twitter.com post URL"), { status: 400, expose: true });
  const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
  if (!match) throw Object.assign(new Error("The URL must contain a post ID"), { status: 400, expose: true });
  const username = match[1].replace(/^@/, "");
  return { id: match[2], url: `https://x.com/${username}/status/${match[2]}`, author: `@${username}`, name: username };
}
export default async function handler(req, res) {
  if (!method(req, res, ["POST"]) || !protect(req, res, true)) return;
  try {
    const parsed = parsePostUrl(body(req).url); let metadata = {};
    if (process.env.X_BEARER_TOKEN) {
      try { metadata = await getPost(parsed.id); }
      catch (error) { console.error("Unable to load X post metadata; continuing with the public source", error); }
    }
    const value = await saveSource({
      ...parsed,
      ...metadata,
      connectedAt: new Date().toISOString(),
      lastSyncStatus: "ready",
      lastSyncError: "",
      syncComplete: false,
      syncMode: ""
    });
    json(res, 200, { source: value }, { "Cache-Control": "no-store" });
  } catch (error) { handleError(res, error); }
}
