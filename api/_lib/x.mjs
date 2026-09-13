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
export async function getPost(id) {
  const data = await xFetch(`tweets/${id}`, { "tweet.fields": "author_id,created_at", expansions: "author_id", "user.fields": "name,username,profile_image_url" });
  const author = userMap(data.includes).get(data.data?.author_id);
  return { text: data.data?.text || "", author: author ? `@${author.username}` : "", name: author?.name || "", avatarUrl: author?.profile_image_url || "" };
}
export async function getReplies(tweetId, sourceUrl) {
  const all = []; let nextToken = "";
  for (let page = 0; page < 3; page += 1) {
    const data = await xFetch("tweets/search/recent", {
      query: `conversation_id:${tweetId} -is:retweet`, max_results: "100",
      "tweet.fields": "author_id,created_at,conversation_id,in_reply_to_user_id", expansions: "author_id",
      "user.fields": "name,username,profile_image_url", next_token: nextToken
    });
    const users = userMap(data.includes);
    for (const tweet of data.data || []) {
      if (tweet.id === tweetId) continue;
      const user = users.get(tweet.author_id);
      all.push({ id: `x:${tweet.id}`, author: user?.username ? `@${user.username}` : "@unknown", name: user?.name || "X user", text: tweet.text,
        avatarUrl: user?.profile_image_url || "", sourceUrl: user?.username ? `https://x.com/${user.username}/status/${tweet.id}` : sourceUrl,
        createdAt: tweet.created_at || new Date().toISOString() });
    }
    nextToken = data.meta?.next_token || ""; if (!nextToken) break;
  }
  return all;
}
