# Local Development Guide

This guide walks you through everything needed to run the Orbit stack locally — the Vite frontend, the Cloudflare Worker, and all connected external services.

---

## Prerequisites

### Software

| Tool | Min Version | Install |
|---|---|---|
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| pnpm | 9+ | `npm install -g pnpm` |
| Wrangler (Cloudflare CLI) | 3+ | `npm install -g wrangler` |
| Supabase CLI | latest | `brew install supabase/tap/supabase` |
| Git | any | pre-installed on macOS |

### External Accounts Needed

You need accounts (all have free tiers) at:

- [Supabase](https://supabase.com) — database, auth, pgvector
- [Cloudflare](https://dash.cloudflare.com) — hosting the Worker locally via Wrangler
- [Apify](https://apify.com) — Instagram Reel video extraction
- [Google AI Studio](https://aistudio.google.com) — Gemini API key
- [Google Cloud Console](https://console.cloud.google.com) — OAuth 2.0 credentials

---

## Step 1 — Install Dependencies

```bash
# From the repo root
pnpm install
```

---

## Step 2 — Set Up Supabase

### 2a. Create a Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New Project**
2. Choose a region close to you, set a strong database password (save it — you'll need it later)
3. Wait ~2 minutes for the project to provision

### 2b. Run the Database Migrations

Open the **SQL Editor** in your Supabase dashboard and run these files **in order**:

1. Paste and run: `supabase/migrations/001_initial_schema.sql`
2. Paste and run: `supabase/migrations/002_semantic_search_function.sql`

> **Tip:** Once you have the Supabase CLI linked (Step 2d), you can use `supabase db push` instead of the dashboard. See the [Deployment Guide](./deployment.md) for details.

### 2c. Enable Google OAuth

1. Supabase Dashboard → **Authentication** → **Providers** → **Google** → Enable it
2. You'll need a Google OAuth Client ID and Secret — see [Step 5](#step-5--set-up-google-oauth) below
3. Add your local URL to **Authentication** → **URL Configuration**:
   - **Site URL:** `http://localhost:5173`
   - **Redirect URLs:** `http://localhost:5173/dashboard`

### 2d. Grab Your Supabase Credentials

From **Project Settings** → **API**:

| Value | Used in |
|---|---|
| **Project URL** | `VITE_SUPABASE_URL` and `SUPABASE_URL` |
| **`anon` public key** | `VITE_SUPABASE_ANON_KEY` |
| **`service_role` secret key** | `SUPABASE_SERVICE_ROLE_KEY` (Worker only — never expose to browser) |

---

## Step 3 — Get an Apify API Token

1. Sign up / log in at [apify.com](https://apify.com)
2. Go to **Account** → **Integrations** → **API Tokens** → **Create new token**
3. Copy the token → this becomes `APIFY_API_TOKEN`

> **Free tier note:** Apify's free tier includes enough compute for light testing. The Worker uses the `apify~instagram-reel-scraper` actor.

---

## Step 4 — Get a Gemini API Key

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Click **Get API Key** → **Create API Key**
3. Copy the key → this becomes `GEMINI_API_KEY`

> The Worker uses **Gemini 1.5 Pro** for video summarization and **text-embedding-004** for semantic search embeddings. Both are available on the free tier within rate limits.

---

## Step 5 — Set Up Google OAuth

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Navigate to **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
4. Application type: **Web application**
5. Add to **Authorized redirect URIs**:
   ```
   https://<your-supabase-project-ref>.supabase.co/auth/v1/callback
   ```
   *(Get this URL from Supabase → Authentication → Providers → Google — it shows the exact callback URL to use)*
6. Copy the **Client ID** and **Client Secret** and paste them into Supabase → Authentication → Providers → Google

---

## Step 6 — Configure the Frontend Environment

```bash
cd apps/web
cp .env.example .env
```

Edit `apps/web/.env`:

```bash
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key-here
VITE_WORKER_URL=http://localhost:8787
```

> `VITE_WORKER_URL` points to your locally running Wrangler dev server. When you deploy, you'll change this to your production worker URL.

---

## Step 7 — Configure the Worker Environment

Wrangler reads local secrets from a `.dev.vars` file (automatically gitignored):

```bash
# Create this file at apps/worker/.dev.vars
touch apps/worker/.dev.vars
```

Add the following contents:

```bash
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
APIFY_API_TOKEN=your-apify-token-here
GEMINI_API_KEY=your-gemini-key-here
```

> **Security note:** `.dev.vars` is listed in `.gitignore` at the root. Never commit it.

---

## Step 8 — Run the Stack

Open two terminal windows:

**Terminal 1 — Frontend:**
```bash
cd apps/web
pnpm dev
# Vite starts at http://localhost:5173
```

**Terminal 2 — Worker:**
```bash
cd apps/worker
pnpm dev
# Wrangler starts at http://localhost:8787
```

Or run both at once from the repo root (requires Turbo):
```bash
pnpm dev
```

---

## Testing Each Part of the Stack

### ✅ Health Check (Worker is up)

```bash
curl http://localhost:8787/health
# Expected: {"status":"ok","timestamp":"..."}
```

### ✅ Auth Error (Pipeline parse/auth working)

```bash
curl -X POST http://localhost:8787/webhook/reel \
  -H "Authorization: Bearer invalid-token" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.instagram.com/reel/abc123/"}'
# Expected: {"success":false,"error":"AuthError","message":"Authentication failed"}
```

### ✅ Validation Error (Zod working)

```bash
curl -X POST http://localhost:8787/webhook/reel \
  -H "Authorization: Bearer some-token" \
  -H "Content-Type: application/json" \
  -d '{"url": "not-a-url"}'
# Expected: {"success":false,"error":"ParseError","message":"..."}
```

### ✅ Frontend Auth Flow

1. Open `http://localhost:5173`
2. Click **Continue with Google**
3. Complete OAuth → should redirect to `/dashboard`

### ✅ iOS Shortcut Token Generation

1. Log in to the web app
2. Navigate to `/settings`
3. Click **Generate iOS Shortcut Token**
4. Confirm a token appears (shown once), the copy button works, and the show/hide toggle works

### ✅ Full Pipeline (requires all keys)

1. Generate a valid iOS Shortcut token from the Settings page
2. Send a real Reel URL to the webhook:

```bash
curl -X POST http://localhost:8787/webhook/reel \
  -H "Authorization: Bearer <your-raw-token>" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.instagram.com/reel/<real-reel-id>/"}'
```

3. On success (`201`), refresh the Dashboard — the new reel should appear.

---

## Troubleshooting

### "Missing VITE_SUPABASE_URL" error on frontend startup

You haven't created `apps/web/.env`. Copy from `.env.example` and fill in your values.

### Worker starts but crashes immediately

Check that `apps/worker/.dev.vars` exists and has all four required keys.

### Google sign-in redirects to an error page

- Make sure `http://localhost:5173/dashboard` is added to **Supabase → Authentication → URL Configuration → Redirect URLs**
- Make sure the Supabase callback URL is added to your **Google Cloud OAuth Client's Authorized Redirect URIs**

### Apify run times out

Apify actor cold starts can take 20–30 seconds. The `waitForApifyRun` function in `pipeline.ts` polls for 60 seconds (20 × 3s). If you're hitting timeouts consistently, check your Apify dashboard to see if the actor run is actually failing.

### Gemini returns invalid JSON

The model response is cleaned of markdown fences defensively, but if structured output is unreliable, try switching to `gemini-1.5-flash` for faster (though less detailed) responses during development.

### Port already in use

```bash
# Kill whatever is on 5173 or 8787
lsof -ti :5173 | xargs kill
lsof -ti :8787 | xargs kill
```
