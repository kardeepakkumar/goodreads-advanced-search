# Deploying to Vercel

## Overview

Vercel deploys automatically from GitHub — no GitHub Actions needed. Every push to `main` triggers a production deployment. You set environment variables once in the Vercel dashboard and they're injected at build and runtime.

---

## Prerequisites

Before deploying, make sure you have:

1. A **Vercel account** (free tier is fine)
2. A **MongoDB Atlas** cluster with:
   - The `goodreadsBooks` database and collections created (run `migration/setup/` scripts)
   - Atlas Search index created (`migration/search/`)
   - Network access set to allow all IPs: `0.0.0.0/0` — Vercel uses dynamic IPs, you cannot allowlist them
3. The app working locally (`npm run dev`)

---

## Step 1 — Push to GitHub

Push this repo to GitHub if you haven't already:

```bash
git remote add origin https://github.com/yourusername/goodreads-advanced-search.git
git push -u origin main
```

---

## Step 2 — Import into Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repository
3. Vercel auto-detects Next.js — no build settings to change
4. **Do not deploy yet** — add environment variables first

---

## Step 3 — Set Environment Variables

In the Vercel project dashboard → **Settings → Environment Variables**, add:

| Variable | Value |
|---|---|
| `MONGODB_URI` | Your Atlas connection string (`mongodb+srv://...`) |
| `ADMIN_USERNAME` | Your chosen admin username |
| `ADMIN_PASSWORD_HASH_B64` | Base64-encoded bcrypt hash (see below) |
| `IRON_SESSION_SECRET` | Random 32+ character string |

### Generating `ADMIN_PASSWORD_HASH_B64`

Run this locally (requires Node.js):

```bash
node -e "
const b = require('bcryptjs');
b.hash('your-password-here', 10).then(h => {
  console.log(Buffer.from(h).toString('base64'));
});
"
```

Copy the output into the Vercel env var. The base64 encoding is necessary because bcrypt hashes contain `$` characters that shell environments mangle.

### Generating `IRON_SESSION_SECRET`

```bash
openssl rand -hex 32
```

---

## Step 4 — Deploy

Click **Deploy** in Vercel. The first build takes ~60 seconds.

---

## Step 5 — Configure the scraper

Once deployed, go to `https://your-app.vercel.app/admin` and log in.

In the **Config** section, paste your Goodreads session cookie. This is required for the scraper to access shelf data.

To get your cookie:
1. Log into Goodreads in your browser
2. Open DevTools → Network → reload any Goodreads page
3. Find any request to `goodreads.com`, look at the **Request Headers**
4. Copy the full value of the `Cookie` header

---

## Step 6 — Queue your first scrape

In **Queue Job**, enter a genre slug (e.g. `fantasy`, `science-fiction`, `horror`) and click Queue.

The scraper runs automatically in the background via the Next.js instrumentation hook — no manual triggering needed.

> **Note on Vercel serverless**: The background ticker started by `instrumentation.ts` runs within each serverless function invocation but does not persist between cold starts. On Vercel, the scraper only runs when there is incoming traffic. For continuous background scraping without browser interaction, use an external cron service (e.g. [cron-job.org](https://cron-job.org)) to ping `POST /api/admin/tick` every 30 seconds using a session cookie from a logged-in admin browser.

---

## Automatic deployments

After setup, every push to `main` automatically triggers a new Vercel deployment. Environment variables persist across deployments — you only set them once.

No GitHub Actions are needed for basic deployment. If you want to add tests or lint checks before deploy, you can add a GitHub Actions workflow that Vercel waits on, but it's optional.

---

## MongoDB Atlas checklist

- [ ] Collections created via `migration/setup/02-create-collections.js`
- [ ] Indexes created via `migration/setup/03-create-indexes.js`
- [ ] `appConfig` seeded via `migration/setup/04-seed-appconfig.js`
- [ ] Atlas Search index created (`migration/search/09-create-search-index.sh`)
- [ ] Database user has `readWrite` on `goodreadsBooks`
