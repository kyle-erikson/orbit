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

This section walks you through generating an API key and building an Apple Shortcut so you can share any Instagram or Facebook Reel directly from the iOS share sheet into Orbit.

> **Why an API key?** The Orbit worker is a public HTTPS endpoint. The API key ties each incoming Reel to _your_ account so the AI summary is saved under your user ID. The raw key is never stored — only a SHA-256 hash of it is kept in the database.

---

### Step 1 — Generate Your API Key

1. Sign in to the Orbit web app and navigate to **Settings** (top-right menu).
2. Click **"Generate iOS Shortcut Token"**.
   - The app generates a cryptographically random 32-byte token in your browser.
   - Only the SHA-256 hash of the token is sent to the server and stored.
3. **Copy the token immediately** — it is displayed exactly once and cannot be recovered. Store it somewhere safe (e.g., your password manager or directly into the Shortcut you create in the next step).

> ⚠️ If you lose the token, simply generate a new one. Previous tokens remain valid until you manually delete them from your Supabase `user_api_keys` table.

---

### Step 2 — Find Your Worker URL

Your Cloudflare Worker URL is set as `VITE_WORKER_URL` in `apps/web/.env`. After deployment it will look like:

```
https://orbit-worker.<your-subdomain>.workers.dev
```

The webhook endpoint you will POST to is:

```
https://orbit-worker.<your-subdomain>.workers.dev/webhook/reel
```

---

### Step 3 — Build the Apple Shortcut

Open the **Shortcuts** app on your iPhone (iOS 16+) and tap **+** to create a new shortcut.

#### 3a. Accept a Reel URL from the Share Sheet

1. Tap **Add Action** → search for **"Receive"** → select **Receive input from Share Sheet**.
2. Under "Receive", make sure **URLs** is checked. This lets you trigger the shortcut from the Instagram or Facebook app's share sheet.
3. Tap **Done** on the receive action.

#### 3b. Build the JSON body

1. Tap **+** → search for **"Dictionary"** → select **Dictionary**.
2. Add one key-value pair:
   - **Key**: `url`
   - **Type**: Text
   - **Value**: tap the value field, then tap the blue variable chip **Shortcut Input** (this inserts the shared URL at runtime).

#### 3c. Make the HTTP Request

1. Tap **+** → search for **"Get Contents of URL"** → select **Get Contents of URL**.
2. Tap **"Show More"** to expand all options.
3. Configure the action as follows:

   | Field | Value |
   |---|---|
   | **URL** | `https://orbit-worker.<your-subdomain>.workers.dev/webhook/reel` |
   | **Method** | `POST` |
   | **Headers** → Add header | Key: `Authorization` · Value: `Bearer <paste-your-token-here>` |
   | **Headers** → Add header | Key: `Content-Type` · Value: `application/json` |
   | **Request Body** | Select **JSON** → choose the **Dictionary** variable from step 3b |

   The resulting HTTP body will look like:

   ```json
   {
     "url": "https://www.instagram.com/reel/ABC123xyz/"
   }
   ```

#### 3d. (Optional) Show a confirmation notification

1. Tap **+** → search for **"Show Notification"** → select **Show Notification**.
2. Set the body to something like **"Reel saved to Orbit 🚀"** so you get immediate feedback.

#### 3e. Name and save the shortcut

1. Tap the shortcut name at the top and rename it to **"Save to Orbit"** (or whatever you prefer).
2. Tap **Done** to save.

---

### Step 4 — Add to Share Sheet

1. Go back to the shortcut's detail page and tap the **⚙ Settings** (info) icon.
2. Enable **"Show in Share Sheet"**.
3. Under **"Accepted Types"**, make sure **URLs** is enabled.
4. Tap **Done**.

---

### Step 5 — Test It

1. Open Instagram (or Facebook) and find a Reel you want to save.
2. Tap the **Share** / **Send to** icon → scroll to **"Save to Orbit"** in the share sheet row.
3. Tap it. Within a few seconds you should receive the confirmation notification.
4. Open the Orbit web app — your Reel should appear on the Dashboard with a full AI summary.

---

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `401 Unauthorized` | Wrong or missing token | Re-check the `Authorization: Bearer ...` header. Regenerate the token if needed. |
| `422 Unprocessable` | Non-Reel URL passed in | Make sure you are sharing from a Reel (not a post, story, or profile page). |
| `500` / no response | Worker or Apify issue | Check Cloudflare Worker logs (`wrangler tail`) and verify your Apify token is valid. |
| Shortcut doesn't appear in share sheet | "Show in Share Sheet" not enabled | See Step 4 above. |
| Token was lost before copying | Token is not recoverable | Generate a new token in Settings — old tokens still work until deleted. |

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
