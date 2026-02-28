# Orbit — AI Reel Summarizer & Read-It-Later

> Save, summarize, and search your Instagram & Facebook Reels with AI.

## What is this?

Orbit lets you share any Reel from your iPhone (via an iOS Shortcut) to a webhook. The backend extracts the video, sends it to **Google Gemini 1.5 Pro** for multimodal analysis, and stores a structured AI summary (title, category, tags, key takeaways, and a semantic embedding) in Supabase. You then browse and search your entire Reel library from a clean web app.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | `pnpm` workspaces + Turborepo |
| Backend API | Cloudflare Workers + **Effect-ts** |
| Frontend | Vite + React + TypeScript + shadcn/ui + Tailwind CSS |
| Database & Auth | Supabase (PostgreSQL + `pgvector`) + Google OAuth |
| AI | Google Gemini 1.5 Pro (summarization) + text-embedding-004 (search) |
| Video Extraction | Apify (Instagram Reel Scraper) |
| Validation | Zod (shared contract between frontend & backend) |

---

## Monorepo Structure

```
/orbit
├── apps/
│   ├── web/        # Vite + React frontend (Cloudflare Pages)
│   └── worker/     # Cloudflare Worker backend (Effect-ts pipeline)
├── packages/
│   ├── shared-types/   # Zod schemas & TS types
│   └── tsconfig/       # Shared TypeScript configs
├── supabase/
│   └── migrations/     # SQL migrations (schema + RLS + pgvector)
└── turbo.json
```

---

## Getting Started

### 1. Prerequisites

- Node.js ≥ 20
- pnpm (`npm install -g pnpm`)
- A [Supabase](https://supabase.com) project
- A [Cloudflare](https://workers.cloudflare.com) account
- An [Apify](https://apify.com) API token
- A Google AI Studio API key (Gemini)

### 2. Install

```bash
pnpm install
```

### 3. Database Setup

Apply migrations in order via the Supabase Dashboard SQL Editor:

1. `supabase/migrations/001_initial_schema.sql` — tables, indexes, RLS
2. `supabase/migrations/002_semantic_search_function.sql` — `match_reels` RPC

### 4. Configure Environment Variables

**Frontend** (`apps/web/.env`):

```bash
cp apps/web/.env.example apps/web/.env
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_WORKER_URL
```

**Worker** — use Wrangler secrets (never commit raw keys):

```bash
cd apps/worker
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put APIFY_API_TOKEN
wrangler secret put GEMINI_API_KEY
```

### 5. Development

```bash
# Run everything (web + worker)
pnpm dev

# Or individually:
cd apps/web && pnpm dev      # http://localhost:5173
cd apps/worker && pnpm dev   # http://localhost:8787
```

### 6. Deploy

```bash
# Deploy the Cloudflare Worker
cd apps/worker && pnpm deploy

# Deploy the frontend to Cloudflare Pages
cd apps/web && pnpm build
# Then connect the `apps/web/dist` folder to a Cloudflare Pages project
```

---

## iOS Shortcut Setup

1. Open the **Settings** page in the web app.
2. Click **"Generate iOS Shortcut Token"** — copy the token immediately (shown only once).
3. In the iOS Shortcuts app, create a shortcut that:
   - Accepts a Share Sheet URL input
   - Makes a `POST` request to `https://your-worker.workers.dev/webhook/reel`
   - Sets `Authorization: Bearer <your-token>`
   - Sets body: `{ "url": "<Shortcut Input>" }`
4. Add the shortcut to your Share Sheet — now you can share any Reel directly from Instagram.

---

## Architecture: The Effect Pipeline

```
iOS Shortcut
     │ POST /webhook/reel
     ▼
[1] ParseAndValidateRequest  → Zod: WebhookPayloadSchema
     │
[2] AuthenticateWebhook      → SHA-256(token) lookup in user_api_keys
     │ user_id
[3] ExtractVideoMedia         → Apify Instagram Reel Scraper → mp4 URL + caption
     │
[4] GenerateAISummary         → Gemini 1.5 Pro (video + caption) → ReelExtractionSchema
     │
[5] GenerateEmbedding         → text-embedding-004 → vector[768]
     │
[6] PersistToDatabase         → Supabase saved_reels INSERT
     │
     └─→ 201 { success: true, reel: {...} }
```

Each stage is a typed `Effect` — failures surface with a tagged error type (`ParseError`, `AuthError`, `ApifyError`, `GeminiError`, `DatabaseError`) and map cleanly to HTTP status codes.

---

## Security

- **API keys**: The raw iOS Shortcut token is never stored. Only its SHA-256 hex digest is persisted in `user_api_keys`.
- **RLS**: Every Supabase table has Row Level Security enabled — users can only read/delete their own rows.
- **Service role key**: Used only in the Cloudflare Worker (server-side); never exposed to the browser.
- **`.env` files**: Strictly gitignored at all levels.
