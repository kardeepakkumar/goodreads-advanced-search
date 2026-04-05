# environments.md

## Overview

| Mode | Source |
|---|---|
| Local development | `.env.local` (git-ignored, never committed) |
| Vercel production | Vercel dashboard → Environment Variables |

Next.js loads `.env.local` automatically in development. No code changes needed between modes.

---

## Required Environment Variables

| Variable | Description |
|---|---|
| `MONGODB_URI` | Atlas connection string: `mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/goodreadsBooks` |
| `ADMIN_USERNAME` | Username for `/admin` login |
| `ADMIN_PASSWORD_HASH_B64` | Base64-encoded bcrypt hash of the admin password (see below) |
| `IRON_SESSION_SECRET` | Random 32+ character string for session encryption |

> The Goodreads session cookie and rate limit are stored in MongoDB (`appConfig`) and set via the admin UI — not environment variables.

---

## Local Setup

```bash
cp .env.example .env.local
# Fill in real values
npm run dev
```

`.env.local` is git-ignored. Never commit it.

---

## Generating `ADMIN_PASSWORD_HASH_B64`

The hash is base64-encoded to prevent dotenv-expand from mangling the `$` characters in bcrypt hashes:

```bash
node -e "
const b = require('bcryptjs');
b.hash('your-password', 10).then(h => console.log(Buffer.from(h).toString('base64')));
"
```

---

## Generating `IRON_SESSION_SECRET`

```bash
openssl rand -hex 32
```

---

## Gitignored files

| File | Contains |
|---|---|
| `.env.local` | Real secrets for local dev |
| `.env.*.local` | Any local env variant |
| `cookie.txt` | Raw Goodreads cookie (local scraping research) |
| `books_raw.jl` | Source dataset for initial migration |
| `tsconfig.tsbuildinfo` | TypeScript incremental build cache |

See `.env.example` for the committed reference template (no real values).

---

## Full deployment walkthrough

See `docs/vercel-setup.md`.
