import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const SYSTEM_PROMPT = `You are a brutal but constructive resume critic. Analyze the resume and respond with ONLY valid JSON matching this exact structure — no markdown, no explanation outside the JSON:

{
  "roast": "A savage but funny opening roast (1-2 sentences, make them laugh)",
  "score": {
    "overall": <number 1-10, average of breakdown>,
    "breakdown": {
      "clarity": <number 1-10>,
      "impact": <number 1-10>,
      "formatting": <number 1-10>,
      "keywords": <number 1-10>,
      "ats": <number 1-10>
    }
  },
  "improvements": [
    {
      "number": 1,
      "title": "<short title>",
      "before": "<example of what they wrote>",
      "after": "<improved version>"
    },
    { "number": 2, "title": "...", "before": "...", "after": "..." },
    { "number": 3, "title": "...", "before": "...", "after": "..." },
    { "number": 4, "title": "...", "before": "...", "after": "..." },
    { "number": 5, "title": "...", "before": "...", "after": "..." }
  ],
  "vibe": "<What this resume says about them — be funny>"
}

Rules:
- All scores must be integers between 1 and 10.
- overall must equal the rounded average of the five breakdown scores.
- improvements must contain exactly 5 items.
- before/after must be concrete examples pulled from or inspired by the actual resume.
- The roast must be funny AND grounded in something specific from the resume.`;

export async function POST(request: NextRequest) {
  // Validate API key presence before doing anything else
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "OpenAI API key is not configured.",
        hint: "Set OPENAI_API_KEY in your .env.local file.",
      },
      { status: 500 }
    );
  }

  // Parse request body
  let resume: string;
  try {
    const body = await request.json();
    resume = body?.resume;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body. Expected JSON with a `resume` field." },
      { status: 400 }
    );
  }

  if (!resume || typeof resume !== "string" || resume.trim().length === 0) {
    return NextResponse.json(
      { error: "The `resume` field is required and must be a non-empty string." },
      { status: 400 }
    );
  }

  if (resume.trim().length < 50) {
    return NextResponse.json(
      { error: "Resume text is too short to roast. Give us something to work with." },
      { status: 400 }
    );
  }

  // Call OpenAI
  const client = new OpenAI({ apiKey });

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: resume.trim() },
      ],
      max_tokens: 1500,
      temperature: 0.9,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      return NextResponse.json(
        { error: "OpenAI returned an empty response. Please try again." },
        { status: 502 }
      );
    }

    // Parse and lightly validate the returned JSON
    let analysis: RoastResponse;
    try {
      analysis = JSON.parse(raw) as RoastResponse;
    } catch {
      return NextResponse.json(
        { error: "Failed to parse OpenAI response as JSON.", raw },
        { status: 502 }
      );
    }

    if (!isValidRoastResponse(analysis)) {
      return NextResponse.json(
        { error: "OpenAI response was missing required fields.", raw: analysis },
        { status: 502 }
      );
    }

    // Persist to Supabase — fire-and-forget so a DB failure never breaks the roast.
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (sbUrl && sbKey) {
      const db = createClient(sbUrl, sbKey);
      db.from("roasts")
        .insert({ resume_text: resume.trim(), roast_response: analysis })
        .then(({ error }) => {
          if (error) console.error("[roast] supabase insert error:", error.message);
        });
    }

    return NextResponse.json(analysis);
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      const status = err.status ?? 502;

      if (status === 401) {
        return NextResponse.json(
          { error: "Invalid OpenAI API key. Check your OPENAI_API_KEY environment variable." },
          { status: 500 }
        );
      }

      if (status === 429) {
        return NextResponse.json(
          { error: "OpenAI rate limit reached. Please wait a moment and try again." },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: `OpenAI API error: ${err.message}` },
        { status: status >= 500 ? 502 : status }
      );
    }

    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScoreBreakdown {
  clarity: number;
  impact: number;
  formatting: number;
  keywords: number;
  ats: number;
}

interface Improvement {
  number: number;
  title: string;
  before: string;
  after: string;
}

interface RoastResponse {
  roast: string;
  score: {
    overall: number;
    breakdown: ScoreBreakdown;
  };
  improvements: Improvement[];
  vibe: string;
}

function isNumber1to10(v: unknown): v is number {
  return typeof v === "number" && v >= 1 && v <= 10;
}

function isValidRoastResponse(v: unknown): v is RoastResponse {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;

  if (typeof r.roast !== "string" || typeof r.vibe !== "string") return false;

  const score = r.score as Record<string, unknown> | undefined;
  if (!score || !isNumber1to10(score.overall)) return false;

  const bd = score.breakdown as Record<string, unknown> | undefined;
  if (
    !bd ||
    !isNumber1to10(bd.clarity) ||
    !isNumber1to10(bd.impact) ||
    !isNumber1to10(bd.formatting) ||
    !isNumber1to10(bd.keywords) ||
    !isNumber1to10(bd.ats)
  ) {
    return false;
  }

  if (!Array.isArray(r.improvements) || r.improvements.length !== 5) return false;
  for (const item of r.improvements) {
    const i = item as Record<string, unknown>;
    if (typeof i.title !== "string" || typeof i.before !== "string" || typeof i.after !== "string") {
      return false;
    }
  }

  return true;
}
