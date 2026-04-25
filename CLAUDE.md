@AGENTS.md

# Resume Roaster

AI-powered resume roasting app built with Next.js 16, TypeScript, and Tailwind CSS.

## Stack

- **Framework:** Next.js 16 (App Router, no `src/` directory — app lives at `app/`)
- **Styling:** Tailwind CSS v4 (imported via `@import "tailwindcss"` in globals.css, not a config file)
- **AI:** Groq API (`llama-3.3-70b-versatile`) for roasting — uses the OpenAI SDK pointed at Groq's base URL
- **PDF extraction:** `unpdf` (serverless-compatible, replaces pdf-parse which fails on Vercel)
- **Image OCR:** OpenAI vision API (`gpt-4o-mini`) — only used for JPG/PNG uploads
- **Database:** Supabase (saves every roast; RLS disabled — anon key used for both reads and writes)
- **Deployment:** Vercel at https://resume-roaster-lemon.vercel.app

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `GROQ_API_KEY` | Yes | Resume roasting via Groq |
| `OPENAI_API_KEY` | Optional | Image OCR (JPG/PNG uploads only) |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional | Supabase anon key |

Supabase is optional — the app works without it, roasting still functions.

## Project Structure

```
app/
  page.tsx              # Landing page + upload UI + results card (client component)
  layout.tsx            # Root layout with metadata
  globals.css           # Tailwind import + fade-in keyframe animations
  api/
    extract/route.ts    # POST: file → extracted text (PDF via unpdf, image via OpenAI vision)
    roast/route.ts      # POST: resume text → roast JSON (Groq llama-3.3-70b-versatile)
  upload/page.tsx       # Stub (unused)
  results/page.tsx      # Stub (unused)
lib/
  supabase.ts           # Supabase client (returns null when env vars absent)
  utils.ts              # cn() helper
types/
  index.ts              # Shared types
```

## API Routes

### POST /api/extract
Accepts `multipart/form-data` with a `file` field (PDF, JPG, PNG, max 10MB).
Returns `{ text: string }`.
- PDF → `unpdf` (no native dependencies, works on Vercel serverless)
- Image → OpenAI vision API (requires `OPENAI_API_KEY`)

### POST /api/roast
Accepts `{ resume: string }`.
Returns structured JSON:
```json
{
  "roast": "...",
  "score": { "overall": 5, "breakdown": { "clarity": 5, "impact": 4, "formatting": 6, "keywords": 4, "ats": 5 } },
  "improvements": [{ "number": 1, "title": "...", "before": "...", "after": "..." }, ...],
  "vibe": "..."
}
```
After a successful roast, saves to Supabase `roasts` table (fire-and-forget).

## Supabase Table

```sql
CREATE TABLE roasts (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  resume_text TEXT NOT NULL,
  roast_response JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

RLS is disabled. History is not exposed in the UI (privacy) but viewable in the Supabase dashboard.

## Key Decisions

- **Groq over OpenAI** — free tier with generous limits; same OpenAI SDK, just different `baseURL` and model
- **unpdf over pdf-parse** — pdf-parse crashes on Vercel because it probes for test fixture files at load time that don't exist in serverless deployments
- **No history UI** — resume data is sensitive; roasts are saved for analytics but not shown to visitors
- **Supabase save is fire-and-forget** — a DB failure never blocks the roast response returned to the user
