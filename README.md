# Tweet Comment Flow

A static web page for collecting replies from a tweet, moderating them in an admin queue, and publishing approved comments into a free-flowing branded card wall.

## Run Locally

```bash
npm install
npm run dev
```

You can also open `index.html` directly in a browser.

## GitHub Push

Replace `YOUR_GITHUB_REPO_URL` with your repository URL.

```bash
git init
git add .
git commit -m "Build tweet comment flow page"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

## Vercel Deploy

```bash
npm install -g vercel
vercel login
vercel link
vercel --prod
```

For GitHub-based deployment, import the GitHub repo in Vercel after pushing. Vercel will deploy each push to `main`.

## Real Tweet Reply Collection

This demo keeps data in the browser with `localStorage`. For production, connect a serverless endpoint to the official X API and store replies in a database. Keep the same moderation rule: new replies should be saved as `pending`, and only approved replies should be returned to the public board.

Recommended production pieces:

- X API bearer token stored as a Vercel environment variable.
- A scheduled Vercel Cron job to fetch replies for the source tweet.
- A small database such as Vercel Postgres, Supabase, Neon, or Upstash Redis.
- Admin authentication before allowing approvals.

Never expose the X API token in browser-side JavaScript.
