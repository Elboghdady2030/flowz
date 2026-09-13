import { load } from "cheerio";

function token() {
  if (!process.env.X_BEARER_TOKEN) throw Object.assign(new Error("Add X_BEARER_TOKEN in Vercel to enable live X syncing"), { status: 409, expose: true });
  return process.env.X_BEARER_TOKEN;
}
async function xFetch(path, params = {}) {
  const url = new URL(`https://api.x.com/2/${path}`);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token()}` }, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.detail || data.title || "X API request failed";
    throw Object.assign(new Error(message), { status: response.status === 429 ? 429 : 502, expose: true });
  }
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

  return { replies: [...replies.values()], newestId, mode: "public" };
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
  let page = 0;

  do {
    if (page > 0 && isInitialArchiveSync) await wait(1_050);
    const params = {
      query: `conversation_id:${tweetId} -is:retweet`, max_results: maxResults,
      "tweet.fields": "author_id,created_at,conversation_id,in_reply_to_user_id", expansions: "author_id",
      "user.fields": "name,username,profile_image_url", next_token: nextToken, since_id: sinceId
    };
    if (isInitialArchiveSync) params.start_time = new Date(postDate(tweetId).getTime() - 60_000).toISOString();
    const data = await xFetch(endpoint, params);
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
    page += 1;
  } while (nextToken);

  return { replies: [...all.values()], newestId, mode: "api" };
}

export async function getReplies(tweetId, sourceUrl, sinceId = "") {
  if (process.env.X_BEARER_TOKEN) {
    try { return await getOfficialReplies(tweetId, sourceUrl, sinceId); }
    catch (error) {
      console.error("Official X sync failed; using the public conversation", error);
    }
  }
  return scrapePublicReplies(tweetId, sourceUrl, sinceId);
}
