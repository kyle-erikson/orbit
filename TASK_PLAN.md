# Implementation Plan: AI Reel Summarizer & Read-It-Later MVP

## Project Overview
We are building a "read-it-later" web application specifically designed to process, summarize, and categorize short-form video content (Instagram/Facebook Reels) using AI. The user will share a Reel URL via an iOS Apple Shortcut to a webhook. The backend will extract the video, summarize its contents using a multimodal LLM, and store the structured data for easy retrieval and semantic search.

## Tech Stack
* **Monorepo Management:** `pnpm` workspaces (or Turborepo).
* **Infrastructure:** Cloudflare Workers (Backend API) & Cloudflare Pages (Frontend hosting).
* **Frontend:** Vite + React + TypeScript + shadcn/ui + Tailwind CSS.
* **Backend Logic:** TypeScript using `Effect-ts` for robust error handling, tracing, and dependency injection.
* **Database & Auth:** Supabase (PostgreSQL with `pgvector` extension) + Google OAuth.
* **Validation:** Zod (Runtime typing for API inputs, LLM outputs, and shared across the monorepo).
* **Third-Party Services:** Apify (Video extraction) & Google Gemini 1.5 Pro (Multimodal summarization & Text Embeddings).

---

## 1. Monorepo Structure
Initialize the project as a monorepo to share types and configurations.

```text
/reel-summarizer
├── apps/
│   ├── web/                # Vite + React frontend
│   └── worker/             # Cloudflare Worker backend (Effect-ts)
├── packages/
│   ├── shared-types/       # Zod schemas & TS types (used by web and worker)
│   └── tsconfig/           # Base tsconfig files
├── package.json            # Root workspace config
├── pnpm-workspace.yaml     # Workspace definition
└── .gitignore              # STRICTLY IGNORE ALL .env FILES
```

## 2. Database Schema & Security (Supabase)
Initialize a Supabase project and apply the following schema. Row Level Security (RLS) MUST be enabled on all tables.

### Table: user_api_keys (For authenticating the iOS Shortcut webhook)
- id (uuid, primary key)
- user_id (uuid, references auth.users)
- key_hash (text) - SECURITY REQUIREMENT: Never store the raw API key. Store a SHA-256 hash.
- created_at (timestamp)
- last_used_at (timestamp)

### Table: saved_reels
- id (uuid, primary key)
- user_id (uuid, references auth.users)
- original_url (text) - The raw FB/IG link.
- title (text) - AI-generated.
- summary (text) - AI-generated.
- category (text) - Broad AI-generated category.
- tags (text array) - Granular AI-generated tags.
- key_takeaways (jsonb) - Array of specific actionable bullet points.
- embedding (vector) - pgvector column for natural language search.
- created_at (timestamp)

## 3. Backend Architecture (Cloudflare Workers + Effect-ts)
The apps/worker package will act as the webhook receiver. The core logic must be written functionally using Effect-ts.

### The Effect Pipeline:
Model the request lifecycle as a series of composable Effects:
1. ParseAndValidateRequest: Accept POST request, parse the JSON body for the URL using the shared Zod schema.
2. AuthenticateWebhook: Read the Authorization header (Bearer token). Hash the provided token and verify it against the user_api_keys table in Supabase. Yield the user_id.
3. ExtractVideoMedia: Call the Apify API (e.g., Instagram Reel Scraper actor) with the provided URL. Return the .mp4 URL and raw caption.
4. GenerateAISummary: Pass the .mp4 and caption to Google Gemini 1.5 Pro.
   - Prompt Directive: Instruct the AI to act as an information extractor. It must watch the video and read the caption to summarize the core value.
   - Validation: Force Gemini to output JSON. Use Zod to parse the output against an expected ReelExtractionSchema (title, summary, category, tags, key_takeaways) from packages/shared-types.
   - Note on Keyframes: Rely on Gemini's native frame-sampling during this step to extract visual context. Do not build an explicit image extraction/storage pipeline at this time.
5. GenerateEmbedding [Optional/Modular]: Pass the AI-generated summary to Google's text-embedding-004 model to get a vector array.
6. PersistToDatabase: Insert the original URL, the Zod-validated AI payload, the vector embedding, and the user_id into the saved_reels Supabase table.

## 4. Frontend Architecture (Vite + React + shadcn)
Build a mobile-first responsive web application in apps/web.

### Core Views:
1. Login: Supabase Google OAuth integration.
2. Dashboard/Feed: A clean, scrollable list of saved_reels.
   - Display the Title, Category badge, Tags, and Summary.
   - Include a prominent "View Original" link/button bound to original_url.
3. Search Bar: Implement a text input that queries the Supabase database. Prepare the UI for semantic search querying against the pgvector column.
4. Settings: A page where the user can click "Generate iOS Shortcut Token". The frontend generates a secure random string, displays the raw string to the user exactly once, and sends the hashed version to Supabase.

## 5. Implementation Phases
1. Phase 1: Workspace & Infrastructure Scaffold
   - Set up pnpm workspace, apps/web, apps/worker, and packages/shared-types.
   - Define the Zod schemas in shared-types.
2. Phase 2: Database & Auth
   - Execute Supabase SQL migrations (tables, pgvector, RLS).
   - Implement Google OAuth in the Vite frontend.
3. Phase 3: The AI Backend Pipeline
   - Build the Effect-ts pipeline in the Cloudflare Worker.
   - Integrate Apify, Gemini API, and Supabase database insertions.
4. Phase 4: Frontend UI & Webhook Authentication
   - Build the Settings page to generate/hash the API key.
   - Update the Worker to enforce token validation.
   - Build the main feed UI to fetch and display the saved reels.