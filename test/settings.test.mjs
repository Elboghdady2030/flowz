import assert from "node:assert/strict";
import test from "node:test";
import { saveWallSettings, wallSettings } from "../api/_lib/store.mjs";

const originalFetch = globalThis.fetch;
const originalUrl = process.env.KV_REST_API_URL;
const originalToken = process.env.KV_REST_API_TOKEN;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.KV_REST_API_URL;
  else process.env.KV_REST_API_URL = originalUrl;
  if (originalToken === undefined) delete process.env.KV_REST_API_TOKEN;
  else process.env.KV_REST_API_TOKEN = originalToken;
});

test("wall display settings default to visible and persist partial updates", async () => {
  process.env.KV_REST_API_URL = "https://redis.example";
  process.env.KV_REST_API_TOKEN = "test-token";
  let stored = null;

  globalThis.fetch = async (_url, options) => {
    const commands = JSON.parse(options.body);
    return Response.json(commands.map(([name, , value]) => {
      if (name === "GET") return { result: stored };
      if (name === "SET") { stored = value; return { result: "OK" }; }
      return { result: null };
    }));
  };

  assert.deepEqual(await wallSettings(), { headerVisible: true, footerVisible: true });
  assert.deepEqual(await saveWallSettings({ headerVisible: false }), { headerVisible: false, footerVisible: true });
  assert.deepEqual(await wallSettings(), { headerVisible: false, footerVisible: true });
  assert.deepEqual(await saveWallSettings({ footerVisible: false }), { headerVisible: false, footerVisible: false });
});
