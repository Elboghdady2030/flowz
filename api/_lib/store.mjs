import { randomUUID } from "node:crypto";
import { command, pipeline } from "./redis.mjs";

const KEYS = { comments: "flowz:comments", pending: "flowz:pending", approved: "flowz:approved", rejected: "flowz:rejected", source: "flowz:source" };
function parse(value) { if (!value) return null; try { return JSON.parse(value); } catch { return null; } }

export async function source() { return parse(await command(["GET", KEYS.source])); }
export async function saveSource(value) { await command(["SET", KEYS.source, JSON.stringify(value)]); return value; }
export async function list(status, limit = 100) {
  const key = KEYS[status]; if (!key) return [];
  const ids = await command(["ZREVRANGE", key, 0, Math.max(0, limit - 1)]);
  if (!ids?.length) return [];
  const values = await command(["HMGET", KEYS.comments, ...ids]);
  return values.map(parse).filter(Boolean);
}
export async function counts() {
  const [pending, approved, rejected] = await pipeline([["ZCARD", KEYS.pending], ["ZCARD", KEYS.approved], ["ZCARD", KEYS.rejected]]);
  return { pending: Number(pending), approved: Number(approved), rejected: Number(rejected) };
}
export async function addPending(items) {
  if (!items.length) return 0;
  const existing = await command(["HMGET", KEYS.comments, ...items.map((item) => item.id)]);
  const fresh = items.filter((_, index) => !existing[index]);
  if (!fresh.length) return 0;
  const commands = [];
  for (const item of fresh) {
    const comment = {
      id: item.id || randomUUID(), author: item.author, name: item.name || item.author, text: item.text,
      avatarUrl: item.avatarUrl || "", sourceUrl: item.sourceUrl || "", createdAt: item.createdAt || new Date().toISOString(), status: "pending"
    };
    commands.push(["HSET", KEYS.comments, comment.id, JSON.stringify(comment)]);
    commands.push(["ZADD", KEYS.pending, Date.parse(comment.createdAt) || Date.now(), comment.id]);
  }
  await pipeline(commands); return fresh.length;
}
export async function moderate(id, status) {
  const current = parse(await command(["HGET", KEYS.comments, id]));
  if (!current) throw Object.assign(new Error("Comment not found"), { status: 404, expose: true });
  const comment = { ...current, status, moderatedAt: new Date().toISOString() };
  await pipeline([["HSET", KEYS.comments, id, JSON.stringify(comment)], ["ZREM", KEYS.pending, id], ["ZREM", KEYS.approved, id], ["ZREM", KEYS.rejected, id], ["ZADD", KEYS[status], Date.now(), id]]);
  return comment;
}
export async function clearComments() { await command(["DEL", KEYS.comments, KEYS.pending, KEYS.approved, KEYS.rejected]); }
