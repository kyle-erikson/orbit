# Deployment Guide

This guide covers deploying every piece of the Orbit stack to production, both manually from the command line and automatically via GitHub Actions.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Production Services                   │
│                                                         │
│  ┌─────────────────┐     ┌─────────────────────────┐    │
│  │ Cloudflare Pages│     │   Cloudflare Worker     │    │
│  │  (apps/web)     │────►│   (apps/worker)         │    │
│  │  orbit.pages.dev│     │   orbit-worker.*.dev    │    │
│  └─────────────────┘     └────────────┬────────────┘    │
│                                       │                  │
│            ┌──────────────────────────┤                  │
│            │          ┌───────────────┘                  │
│            ▼          ▼                                  │
│  ┌──────────────────────────────────┐                   │
│  │            Supabase              │                   │
│  │  PostgreSQL + pgvector + Auth    │                   │
│  └──────────────────────────────────┘                   │
│                                                         │
│  External: Apify (video) · Gemini API (AI)              │
└─────────────────────────────────────────────────────────┘
```

---

## Part 1 — Supabase

### One-Time Setup

#### Install the Supabase CLI

```bash
brew install supabase/tap/supabase
supabase login   # Opens browser, saves your access token locally
```

#### Link Your Project

```bash
# From repo root
supabase init    # Creates supabase/config.toml (commit this file)
supabase link --project-ref <your-project-ref>
```

Your `project-ref` is the alphanumeric ID in your Supabase dashboard URL:
`https://supabase.com/dashboard/project/<project-ref>`

You'll be prompted for your **database password** (set when you created the project).

### Manual Migration Deployment

```bash
# Apply all unapplied migrations to production
supabase db push
```

This is safe to run repeatedly — Supabase tracks which migrations have already been applied in an internal `supabase_migrations` table and skips them.

### Creating New Migrations

**Always** use the CLI to create new migration files. This ensures the correct timestamp prefix, which controls ordering:

```bash
# Creates: supabase/migrations/YYYYMMDDHHMMSS_your_description.sql
supabase migration new your_description_here
```

Edit the generated file, then push:

```bash
supabase db push
```

> ❌ **Never edit an existing migration file** after it has been applied to any environment. Supabase tracks files by filename — editing an applied file causes schema drift and confusion. Always create a new migration.

### Secrets Needed for Automation

| Secret Name | Where to Get It |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → [Access Tokens](https://supabase.com/dashboard/account/tokens) → Generate new token |
| `SUPABASE_DB_PASSWORD` | Set when you created the Supabase project |
| `SUPABASE_PROJECT_ID` | The `project-ref` from your dashboard URL |

---

## Part 2 — Cloudflare Worker

### One-Time Setup

#### Install & Authenticate Wrangler

```bash
npm install -g wrangler
wrangler login   # Opens browser, authenticates with your Cloudflare account
```

#### Set Production Secrets

Run each command and enter the value at the prompt. These are stored encrypted in Cloudflare's secret store — you never need to re-enter them for future deployments:

```bash
cd apps/worker

wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put APIFY_API_TOKEN
wrangler secret put GEMINI_API_KEY
```

### Manual Deployment

```bash
cd apps/worker
pnpm deploy
```

Wrangler outputs your worker URL on success, e.g.:
`https://orbit-worker.your-subdomain.workers.dev`

Save this URL — you need it for the frontend's `VITE_WORKER_URL` environment variable.

### Updating Secrets

If a key rotates, update just that secret — no redeployment needed:

```bash
wrangler secret put GEMINI_API_KEY   # prompts for new value
```

### Secrets Needed for Automation

| Secret Name | Where to Get It |
|---|---|
| `CLOUDFLARE_API_TOKEN` | [Cloudflare Dashboard](https://dash.cloudflare.com) → My Profile → API Tokens → Create Token → Use "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard → right sidebar on any Workers page |

---

## Part 3 — Cloudflare Pages (Frontend)

### One-Time Setup: Connect GitHub Repo

This is the recommended approach — Cloudflare Pages watches your repo and deploys automatically on every push.

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Authorize Cloudflare to access your GitHub account and select the `orbit` repo
3. Configure the build:

| Setting | Value |
|---|---|
| **Root directory** | `apps/web` |
| **Build command** | `pnpm install && pnpm build` |
| **Build output directory** | `dist` |
| **Node.js version** | `20` (set in **Environment Variables** as `NODE_VERSION=20`) |

4. Add **Environment Variables** (in the Pages project settings, under "Production"):

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon public key |
| `VITE_WORKER_URL` | `https://orbit-worker.your-subdomain.workers.dev` |

5. Click **Save and Deploy**

Once deployed, Cloudflare gives you a URL like `https://orbit.pages.dev`.

### Post-Deployment: Update Supabase Auth URLs

Go to Supabase → **Authentication** → **URL Configuration** and add:

- **Site URL:** `https://orbit.pages.dev`
- **Redirect URLs:** `https://orbit.pages.dev/dashboard`

If you add a custom domain later, add it here too.

### Manual Deployment (CLI alternative)

```bash
cd apps/web
pnpm build
wrangler pages deploy dist --project-name orbit
```

### Custom Domain

1. Cloudflare Pages project → **Custom Domains** → **Set up a custom domain**
2. Enter your domain (it must be on Cloudflare DNS for automatic SSL)
3. Add the custom domain to Supabase Auth redirect URLs

---

## Part 4 — GitHub Actions (Full CI/CD)

This automates all three deployments on every push to `main`.

### Required GitHub Secrets

Add these in your GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret | Where to Get It |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → Edit Cloudflare Workers template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard → sidebar on any Workers/Pages page |
| `SUPABASE_ACCESS_TOKEN` | Supabase → Account → [Access Tokens](https://supabase.com/dashboard/account/tokens) |
| `SUPABASE_DB_PASSWORD` | Your Supabase project database password |
| `SUPABASE_PROJECT_ID` | Alphanumeric ID in your Supabase project URL |

### GitHub Actions Workflow

Create this file in your repo:

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  # ────────────────────────────────────────────────────────────
  # Job 1: Apply Supabase DB migrations
  # Runs only when migration files are added or changed
  # ────────────────────────────────────────────────────────────
  deploy-database:
    name: Supabase Migrations
    runs-on: ubuntu-latest
    if: |
      contains(toJson(github.event.commits.*.modified), 'supabase/migrations') ||
      contains(toJson(github.event.commits.*.added), 'supabase/migrations')
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Apply migrations
        run: supabase db push --linked --password "$SUPABASE_DB_PASSWORD"
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}

  # ────────────────────────────────────────────────────────────
  # Job 2: Deploy Cloudflare Worker
  # Runs when worker source or shared types change
  # ────────────────────────────────────────────────────────────
  deploy-worker:
    name: Cloudflare Worker
    runs-on: ubuntu-latest
    if: |
      contains(toJson(github.event.commits.*.modified), 'apps/worker') ||
      contains(toJson(github.event.commits.*.added), 'apps/worker') ||
      contains(toJson(github.event.commits.*.modified), 'packages/shared-types') ||
      contains(toJson(github.event.commits.*.modified), 'packages/tsconfig')
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Deploy Worker
        run: pnpm exec wrangler deploy
        working-directory: apps/worker
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}

  # ────────────────────────────────────────────────────────────
  # Job 3: Deploy Cloudflare Pages (Frontend)
  # Cloudflare Pages handles this automatically via its GitHub
  # integration (connected in the Cloudflare dashboard).
  # This job is an optional manual override using the CLI.
  # ────────────────────────────────────────────────────────────
  deploy-frontend:
    name: Cloudflare Pages
    runs-on: ubuntu-latest
    # Only needed if you're NOT using Cloudflare's built-in GitHub integration.
    # If you connected Pages to GitHub in the dashboard, DELETE this job.
    if: |
      contains(toJson(github.event.commits.*.modified), 'apps/web') ||
      contains(toJson(github.event.commits.*.added), 'apps/web') ||
      contains(toJson(github.event.commits.*.modified), 'packages/shared-types')
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build frontend
        run: pnpm build
        working-directory: apps/web
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
          VITE_WORKER_URL: ${{ secrets.VITE_WORKER_URL }}

      - name: Deploy to Cloudflare Pages
        run: pnpm exec wrangler pages deploy dist --project-name orbit
        working-directory: apps/web
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

> **Note on the frontend job:** If you connected Cloudflare Pages to your GitHub repo in the Cloudflare dashboard (recommended), the `deploy-frontend` job is redundant — Cloudflare handles it automatically. Only include that job if you prefer to control builds entirely from GitHub Actions.

---

## Part 5 — Day-to-Day Deployment Cheatsheet

### Scenario: I changed the frontend UI

```bash
git add -A && git commit -m "feat: update dashboard card layout"
git push origin main
# → Cloudflare Pages auto-deploys in ~60s
```

### Scenario: I changed the Worker pipeline

```bash
git add -A && git commit -m "feat: add retry logic to Apify stage"
git push origin main
# → GitHub Actions deploys the worker (~30s)

# Or manually:
cd apps/worker && pnpm deploy
```

### Scenario: I need a new database column

```bash
# 1. Create the migration file
supabase migration new add_thumbnail_url_to_saved_reels

# 2. Edit the generated SQL file
# supabase/migrations/YYYYMMDDHHMMSS_add_thumbnail_url_to_saved_reels.sql
# Example:
# ALTER TABLE public.saved_reels ADD COLUMN thumbnail_url text;

# 3. Apply locally (if using Supabase CLI local dev)
supabase db push

# 4. Commit and push — GitHub Actions applies to production
git add -A && git commit -m "db: add thumbnail_url to saved_reels"
git push origin main
```

### Scenario: A secret/API key was rotated

```bash
# Worker secrets — update in Cloudflare's secret store (no redeployment needed)
cd apps/worker
wrangler secret put GEMINI_API_KEY   # enter new key at prompt

# Frontend env vars — update in Cloudflare Pages dashboard
# Pages → Your project → Settings → Environment Variables
```

---

## Deployment Summary Table

| What | How | Trigger |
|---|---|---|
| DB schema changes | `supabase db push` | GitHub Actions or manual |
| Cloudflare Worker | `wrangler deploy` | GitHub Actions or manual |
| Frontend (Pages) | `git push origin main` | Automatic (Pages GitHub integration) |
| Worker secrets | `wrangler secret put <NAME>` | Manual only (one-time per secret) |
| Frontend env vars | Cloudflare Pages dashboard | Manual (rare) |
| Auth redirect URLs | Supabase dashboard | Manual (when domain changes) |
