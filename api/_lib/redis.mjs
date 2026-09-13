function credentials() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw Object.assign(new Error("Redis is not configured"), { status: 503, expose: true });
  return { url: url.replace(/\/$/, ""), token };
}

export async function pipeline(commands) {
  const { url, token } = credentials();
  const response = await fetch(`${url}/pipeline`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands), cache: "no-store"
  });
  if (!response.ok) throw new Error(`Redis request failed (${response.status})`);
  const values = await response.json();
  const failed = values.find((item) => item.error);
  if (failed) throw new Error(`Redis command failed: ${failed.error}`);
  return values.map((item) => item.result);
}

export async function command(value) { return (await pipeline([value]))[0]; }
