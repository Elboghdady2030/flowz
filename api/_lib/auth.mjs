import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { json, sameOrigin } from "./http.mjs";

const COOKIE = "flowz_admin";
const MAX_AGE = 60 * 60 * 24 * 7;

function secret() {
  if (!process.env.SESSION_SECRET) throw Object.assign(new Error("Admin sessions are not configured"), { status: 503, expose: true });
  return process.env.SESSION_SECRET;
}
function sign(value) { return createHmac("sha256", secret()).update(value).digest("base64url"); }
function equal(a, b) { const left = Buffer.from(a); const right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); }
function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map((part) => {
    const [name, ...rest] = part.trim().split("="); return [name, rest.join("=")];
  }).filter(([name]) => name));
}

export function passwordMatches(value) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw Object.assign(new Error("ADMIN_PASSWORD is not configured"), { status: 503, expose: true });
  return equal(createHash("sha256").update(String(value)).digest("hex"), createHash("sha256").update(expected).digest("hex"));
}
export function createSession() {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + MAX_AGE })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export function sessionCookie(req, token) {
  const secure = !String(req.headers.host || "").startsWith("localhost");
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE}${secure ? "; Secure" : ""}`;
}
export function clearSessionCookie(req) {
  const secure = !String(req.headers.host || "").startsWith("localhost");
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}
export function isAdmin(req) {
  try {
    const token = cookies(req)[COOKIE] || ""; const [payload, signature] = token.split(".");
    if (!payload || !signature || !equal(signature, sign(payload))) return false;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(session.exp) > Date.now() / 1000;
  } catch { return false; }
}
export function protect(req, res, mutation = false) {
  if (mutation && !sameOrigin(req)) { json(res, 403, { error: "Invalid request origin" }); return false; }
  if (!isAdmin(req)) { json(res, 401, { error: "Sign in required" }, { "Cache-Control": "no-store" }); return false; }
  return true;
}
