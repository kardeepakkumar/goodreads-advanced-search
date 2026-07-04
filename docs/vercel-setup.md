# Deploying to Vercel

## Overview

Vercel deploys automatically from GitHub — every push to `main` triggers a production deployment. You set environment variables once in the Vercel dashboard and they're injected at build and runtime.

Separately from deployment, a GitHub Actions workflow (`.github/workflows/tests.yml`) runs the test suite on every push to `main`. Vercel does not wait on it — it's an independent signal.

---

## Prerequisites

Before deploying, make sure you have:

1. A **Vercel account** (free tier is fine)
2. A **MongoDB Atlas** cluster with:
   - The `goodreadsBooks` database, collections, and indexes created (see `docs/mongo-setup.md`)
   - Atlas Search index created (`docs/mongo-setup.md` section 4)
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

The repo's `tests` workflow runs the full Vitest suite on the same push. Deployment does not wait on it — check the Actions tab (or the README badge) for the result.

---

## MongoDB Atlas checklist

All of these are covered step-by-step in `docs/mongo-setup.md`:

- [ ] Collections created with strict validators (section 2)
- [ ] Indexes created (section 3)
- [ ] `appConfig` singleton seeded (section 2.5)
- [ ] Atlas Search index created and `READY` (section 4)
- [ ] Database user has `readWrite` on `goodreadsBooks`
