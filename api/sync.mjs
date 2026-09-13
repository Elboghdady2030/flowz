import { randomUUID } from "node:crypto";
import { protect } from "./_lib/auth.mjs";
import { command } from "./_lib/redis.mjs";
import { addPending, counts, saveSource, source } from "./_lib/store.mjs";
import { getReplies } from "./_lib/x.mjs";
import { handleError, json, method } from "./_lib/http.mjs";
export default async function handler(req, res) {
  if (!method(req, res, ["POST"]) || !protect(req, res, true)) return;
  const lockId = randomUUID();
  let locked = false;
  let currentSource = null;
  try {
    currentSource = await source();
    if (!currentSource) throw Object.assign(new Error("Connect an X post first"), { status: 400, expose: true });
    locked = (await command(["SET", "flowz:sync-lock", lockId, "NX", "EX", 180])) === "OK";
    if (!locked) return json(res, 200, { busy: true, added: 0, found: 0 }, { "Cache-Control": "no-store" });
    const apiCursor = currentSource.syncMode === "api" && currentSource.syncComplete
      ? currentSource.lastSyncedId || ""
      : "";
    console.info("flowz.sync.start", JSON.stringify({ postId: currentSource.id, previousMode: currentSource.syncMode || "none", incremental: Boolean(apiCursor) }));
    const result = await getReplies(currentSource.id, currentSource.url, apiCursor, currentSource.lastSyncedAt || "");
    const { replies, newestId, mode: syncMode, complete, pages, limitation } = result;
    const added = await addPending(replies);
    const totals = await counts();
    const lastSyncedAt = new Date().toISOString();
    const syncTotal = totals.pending + totals.approved + totals.rejected;
    await saveSource({
      ...currentSource,
      lastSyncedId: newestId || currentSource.lastSyncedId || currentSource.id,
      lastSyncedAt,
      lastSyncStatus: complete ? "complete" : "partial",
      lastSyncError: "",
      lastSyncFound: replies.length,
      lastSyncAdded: added,
      lastSyncPages: pages,
      syncTotal,
      syncMode,
      syncComplete: Boolean(complete),
      syncLimitation: limitation || ""
    });
    console.info("flowz.sync.complete", JSON.stringify({ postId: currentSource.id, mode: syncMode, complete: Boolean(complete), pages, found: replies.length, added, total: syncTotal }));
    json(res, 200, { added, found: replies.length, total: syncTotal, pages, complete: Boolean(complete), limitation: limitation || "", lastSyncedAt, syncMode }, { "Cache-Control": "no-store" });
  } catch (error) {
    console.error("flowz.sync.failed", JSON.stringify({ postId: currentSource?.id || "", code: error.code || "UNKNOWN", status: error.status || 500, upstreamStatus: error.upstreamStatus || null, message: error.message }));
    if (currentSource && locked) {
      try {
        await saveSource({
          ...currentSource,
          lastSyncStatus: "failed",
          lastSyncError: error.message,
          lastSyncErrorCode: error.code || "SYNC_FAILED",
          lastSyncFailedAt: new Date().toISOString()
        });
      } catch (storeError) { console.error("Unable to save sync failure", storeError); }
    }
    handleError(res, error);
  }
  finally {
    if (locked) {
      try { if (await command(["GET", "flowz:sync-lock"]) === lockId) await command(["DEL", "flowz:sync-lock"]); }
      catch (error) { console.error("Unable to release sync lock", error); }
    }
  }
}
