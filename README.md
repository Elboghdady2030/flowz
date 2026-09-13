# Flowz

Flowz collects replies to an X post, holds every new reply for admin approval, and publishes approved comments to an animated public wall.

## Pages

- `/` is the clean, presentation-ready live wall.
- `/admin` is the password-protected source, import, sync, and moderation workflow.
- `/api/health` reports storage and X integration status.

## Environment

Copy `.env.example` to `.env.local` for local development. The deployed Vercel project receives the Redis variables from its Upstash integration.

```dotenv
KV_REST_API_URL=
KV_REST_API_TOKEN=
ADMIN_PASSWORD=
SESSION_SECRET=
X_BEARER_TOKEN=
```

`X_BEARER_TOKEN` is optional for manual imports and required for complete X syncing. Without it, Flowz can only collect the subset X exposes in its logged-out public page and marks the result as partial. Full-archive access and API credits are required to collect replies to posts older than seven days. Store the token only as a Vercel secret.

## Workflow

1. Sign in at `/admin`.
2. Connect the source X post.
3. Leave Auto sync on. The first authenticated sync follows every X results page, then checks for new replies every 30 seconds while the admin is open.
4. Approve or reject every pending reply.
5. Every pending reply is loaded into the admin queue, and approved replies enter the animated wall within ten seconds.

## Deploy

```bash
vercel link
vercel --prod
git push origin main
```

The public client never receives Redis, X API, password, or session secrets.
