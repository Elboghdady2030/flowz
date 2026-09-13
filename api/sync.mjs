import { randomUUID } from "node:crypto";
import { protect } from "./_lib/auth.mjs";
import { command } from "./_lib/redis.mjs";
import { addPending, saveSource, source } from "./_lib/store.mjs";
import { getReplies } from "./_lib/x.mjs";
import { handleError, json, method } from "./_lib/http.mjs";
export default async function handler(req, res) {
  if (!method(req, res, ["POST"]) || !protect(req, res, true)) return;
  const lockId = randomUUID();
  let locked = false;
  try {
    const currentSource = await source();
    if (!currentSource) throw Object.assign(new Error("Connect an X post first"), { status: 400, expose: true });
    locked = (await command(["SET", "flowz:sync-lock", lockId, "NX", "EX", 180])) === "OK";
    if (!locked) return json(res, 200, { busy: true, added: 0, found: 0 }, { "Cache-Control": "no-store" });
    const { replies, newestId, mode: syncMode } = await getReplies(currentSource.id, currentSource.url, currentSource.lastSyncedId || "");
    const added = await addPending(replies);
    const lastSyncedAt = new Date().toISOString();
    await saveSource({ ...currentSource, lastSyncedId: newestId || currentSource.lastSyncedId || currentSource.id, lastSyncedAt, syncMode });
    json(res, 200, { added, found: replies.length, lastSyncedAt, syncMode }, { "Cache-Control": "no-store" });
  } catch (error) { handleError(res, error); }
  finally {
    if (locked) {
      try { if (await command(["GET", "flowz:sync-lock"]) === lockId) await command(["DEL", "flowz:sync-lock"]); }
      catch (error) { console.error("Unable to release sync lock", error); }
    }
  }
}
