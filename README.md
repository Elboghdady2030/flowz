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

`X_BEARER_TOKEN` is optional for manual imports and required for **Sync replies from X**. Create it in an X developer App and store it only as a Vercel secret.

## Workflow

1. Sign in at `/admin`.
2. Connect the source X post.
3. Sync recent replies from X or use manual import.
4. Approve or reject every pending reply.
5. Approved replies appear on `/` within five seconds.

## Deploy

```bash
vercel link
vercel --prod
git push origin main
```

The public client never receives Redis, X API, password, or session secrets.
