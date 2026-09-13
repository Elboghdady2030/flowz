import assert from "node:assert/strict";
import test from "node:test";
import { getReplies } from "../api/_lib/x.mjs";

const originalFetch = globalThis.fetch;
const originalToken = process.env.X_BEARER_TOKEN;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.X_BEARER_TOKEN;
  else process.env.X_BEARER_TOKEN = originalToken;
});

test("authenticated archive sync follows every results page", async () => {
  process.env.X_BEARER_TOKEN = "test-token";
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(new URL(url));
    const secondPage = calls.length === 2;
    return Response.json({
      data: [{
        id: secondPage ? "1459755472442040330" : "1459755472442040329",
        author_id: secondPage ? "2" : "1",
        text: secondPage ? "Second reply" : "First reply",
        created_at: "2021-11-14T05:30:00.000Z"
      }],
      includes: { users: [{ id: secondPage ? "2" : "1", username: secondPage ? "two" : "one", name: secondPage ? "Two" : "One" }] },
      meta: secondPage ? { result_count: 1 } : { result_count: 1, next_token: "page-two" }
    });
  };

  const result = await getReplies("1459755472442040325", "https://x.com/example/status/1459755472442040325");

  assert.equal(result.mode, "api");
  assert.equal(result.complete, true);
  assert.equal(result.pages, 2);
  assert.equal(result.replies.length, 2);
  assert.equal(calls[0].pathname, "/2/tweets/search/all");
  assert.equal(calls[0].searchParams.get("query"), "conversation_id:1459755472442040325 -is:retweet");
  assert.equal(calls[1].searchParams.get("next_token"), "page-two");
});

test("authenticated failures are reported instead of silently falling back", async () => {
  process.env.X_BEARER_TOKEN = "test-token";
  globalThis.fetch = async () => Response.json({ title: "CreditsDepleted", detail: "Credits depleted" }, { status: 402 });

  await assert.rejects(
    () => getReplies("1459755472442040325", "https://x.com/example/status/1459755472442040325"),
    (error) => error.status === 402 && error.code === "X_CREDITS_REQUIRED"
  );
});

test("old conversations keep using full archive for incremental sync", async () => {
  process.env.X_BEARER_TOKEN = "test-token";
  let requestUrl;
  globalThis.fetch = async (url) => {
    requestUrl = new URL(url);
    return Response.json({ meta: { result_count: 0 } });
  };

  const result = await getReplies(
    "1459755472442040325",
    "https://x.com/example/status/1459755472442040325",
    "1459755472442040330",
    "2026-09-13T22:36:00.000Z"
  );

  assert.equal(result.endpoint, "tweets/search/all");
  assert.equal(requestUrl.pathname, "/2/tweets/search/all");
  assert.equal(requestUrl.searchParams.has("since_id"), false);
  assert.equal(requestUrl.searchParams.get("start_time"), "2026-09-13T22:31:00.000Z");
});

test("public-page results are explicitly marked partial", async () => {
  delete process.env.X_BEARER_TOKEN;
  globalThis.fetch = async () => new Response(`<!doctype html><html><head><meta property="og:url" content="https://x.com/example/status/1459755472442040325"></head><body>
    <div data-href="/alice/status/1459755472442040329"><article><a href="https://x.com/alice">Alice</a><img alt="@alice" src="https://img.example/alice.jpg"><div dir="auto">A public reply</div></article></div>
  </body></html>`, { status: 200, headers: { "Content-Type": "text/html" } });

  const result = await getReplies("1459755472442040325", "https://x.com/example/status/1459755472442040325");

  assert.equal(result.mode, "public");
  assert.equal(result.complete, false);
  assert.equal(result.replies.length, 1);
  assert.match(result.limitation, /part/i);
});
