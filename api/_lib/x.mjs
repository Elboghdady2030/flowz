import { load } from "cheerio";

function token() {
  if (!process.env.X_BEARER_TOKEN) throw Object.assign(new Error("X API is not connected"), { status: 409, expose: true, code: "X_NOT_CONFIGURED" });
  return process.env.X_BEARER_TOKEN;
}

function xApiError(response, data, path) {
  const apiError = data.errors?.[0] || {};
  const rawMessage = data.detail || apiError.detail || data.title || apiError.title || "X API request failed";
  let message = rawMessage;
  let status = 502;
  let code = apiError.type || apiError.code || data.type || `X_HTTP_${response.status}`;

  if (response.status === 401) {
    code = "X_TOKEN_INVALID";
    message = "The X API token is invalid or was revoked. Regenerate it in the X Developer Console.";
  } else if (response.status === 402) {
    status = 402;
    code = "X_CREDITS_REQUIRED";
    message = "X API credits are required to retrieve this conversation from the full archive.";
  } else if (response.status === 403) {
    status = 403;
    code = "X_ARCHIVE_ACCESS_REQUIRED";
    message = path.includes("search/all")
      ? "This X project does not currently have full-archive search access."
      : "The X API denied access to this conversation.";
  } else if (response.status === 429) {
    status = 429;
    code = "X_RATE_LIMITED";
    message = "X API rate limit reached. Flowz will retry on the next sync.";
  }

  return Object.assign(new Error(message), { status, expose: true, code, upstreamStatus: response.status });
}

async function xFetch(path, params = {}) {
  const url = new URL(`https://api.x.com/2/${path}`);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token()}` }, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw xApiError(response, data, path);
  return data;
}
function userMap(includes) { return new Map((includes?.users || []).map((user) => [user.id, user])); }
function postDate(id) {
  try { return new Date(Number((BigInt(id) >> 22n) + 1288834974657n)); }
  catch { return new Date(); }
}
function newerId(left, right) {
  try { return BigInt(left || 0) > BigInt(right || 0) ? String(left) : String(right || ""); }
  catch { return String(left || right || ""); }
}
function wait(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function cleanText(value) { return String(value || "").replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(); }

async function scrapePublicReplies(tweetId, sourceUrl, sinceId = "") {
  const response = await fetch(sourceUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.8",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129 Safari/537.36"
    },
    redirect: "follow",
    cache: "no-store"
  });
  if (!response.ok) throw Object.assign(new Error(`X public page returned ${response.status}`), { status: 502, expose: true });

  const html = cleanText(await response.text());
  const $ = load(html);
  if (!$('meta[property="og:url"]').attr("content")) {
    throw Object.assign(new Error("X did not return the public conversation. Try syncing again shortly."), { status: 503, expose: true });
  }

  const replies = new Map();
  let newestId = sinceId;
  $("[data-href]").each((_, element) => {
    const href = $(element).attr("data-href") || "";
    const match = href.match(/^\/([^/]+)\/status\/(\d+)/);
    if (!match || match[2] === tweetId) return;
    const article = $(element).find("article").first();
    const textElement = article.find('div[dir="auto"]').first();
    textElement.find("a").each((__, link) => { $(link).before(" "); $(link).after(" "); });
    const text = cleanText(textElement.text());
    if (!text) return;
    const username = match[1];
    const handle = article.find('img[alt^="@"]').first().attr("alt") || `@${username}`;
    const name = cleanText(article.find(`a[href="https://x.com/${username}"]`).first().text()) || username;
    const avatarUrl = article.find('img[alt^="@"]').first().attr("src") || "";
    replies.set(match[2], {
      id: `x:${match[2]}`, author: handle, name, text, avatarUrl,
      sourceUrl: new URL(href, "https://x.com").href,
      createdAt: postDate(match[2]).toISOString()
    });
    newestId = newerId(match[2], newestId);
  });

  return {
    replies: [...replies.values()], newestId, mode: "public", complete: false, pages: 1,
    limitation: "X only exposed part of this conversation on its public page."
  };
}

export async function getPost(id) {
  const data = await xFetch(`tweets/${id}`, { "tweet.fields": "author_id,created_at", expansions: "author_id", "user.fields": "name,username,profile_image_url" });
  const author = userMap(data.includes).get(data.data?.author_id);
  return {
    text: data.data?.text || "", author: author ? `@${author.username}` : "", name: author?.name || "",
    avatarUrl: author?.profile_image_url || "", createdAt: data.data?.created_at || postDate(id).toISOString()
  };
}
async function getOfficialReplies(tweetId, sourceUrl, sinceId = "") {
  const isInitialArchiveSync = !sinceId && Date.now() - postDate(tweetId).getTime() > 6.5 * 24 * 60 * 60 * 1000;
  const endpoint = isInitialArchiveSync ? "tweets/search/all" : "tweets/search/recent";
  const maxResults = isInitialArchiveSync ? "500" : "100";
  const all = new Map();
  const seenTokens = new Set();
  let nextToken = "";
  let newestId = sinceId;
  let pages = 0;

  do {
    if (pages > 0 && isInitialArchiveSync) await wait(1_050);
    const params = {
      query: `conversation_id:${tweetId} -is:retweet`, max_results: maxResults,
      "tweet.fields": "author_id,created_at,conversation_id,in_reply_to_user_id", expansions: "author_id",
      "user.fields": "name,username,profile_image_url", next_token: nextToken, since_id: sinceId
    };
    if (isInitialArchiveSync) params.start_time = new Date(postDate(tweetId).getTime() - 60_000).toISOString();
    const data = await xFetch(endpoint, params);
    pages += 1;
    const users = userMap(data.includes);
    for (const tweet of data.data || []) {
      if (tweet.id === tweetId) continue;
      const user = users.get(tweet.author_id);
      all.set(tweet.id, { id: `x:${tweet.id}`, author: user?.username ? `@${user.username}` : "@unknown", name: user?.name || "X user", text: tweet.text,
        avatarUrl: user?.profile_image_url || "", sourceUrl: user?.username ? `https://x.com/${user.username}/status/${tweet.id}` : sourceUrl,
        createdAt: tweet.created_at || new Date().toISOString() });
      newestId = newerId(tweet.id, newestId);
    }
    const candidate = data.meta?.next_token || "";
    if (!candidate || seenTokens.has(candidate)) break;
    seenTokens.add(candidate);
    nextToken = candidate;
  } while (nextToken);

  return { replies: [...all.values()], newestId, mode: "api", complete: true, pages, endpoint };
}

export async function getReplies(tweetId, sourceUrl, sinceId = "") {
  if (process.env.X_BEARER_TOKEN) return getOfficialReplies(tweetId, sourceUrl, sinceId);
  return scrapePublicReplies(tweetId, sourceUrl, sinceId);
}
