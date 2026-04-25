import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const SYSTEM_PROMPT = `You are a brutal but constructive resume critic. Analyze the resume and respond with ONLY valid JSON matching this exact structure — no markdown, no explanation outside the JSON:

{
  "roast": "A savage but funny opening roast (1-2 sentences, make them laugh)",
  "score": {
    "overall": <number 1-10, rounded average of the five breakdown scores>,
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

---

SCORING RUBRICS — apply these criteria exactly and consistently:

CLARITY (1-10): Is the writing easy to understand at a glance?
  9-10 — Every bullet is specific, concise, and jargon-free. A stranger understands the role instantly.
  7-8  — Mostly clear with minor vague phrases or unnecessarily complex wording.
  5-6  — Some bullets are clear, others are vague or bloated. Mixed quality.
  3-4  — Frequent use of filler words ("responsible for", "assisted with"), unclear timelines, or confusing structure.
  1-2  — Hard to understand what the person actually did. Dense, meandering, or contradictory.

IMPACT (1-10): Does the resume show results, not just duties?
  9-10 — Most bullets have quantified achievements (numbers, %, $, scale). Shows clear outcomes and ownership.
  7-8  — Some quantified results but several bullets still describe duties rather than accomplishments.
  5-6  — A few numbers scattered in, but mostly task-based descriptions with no evidence of results.
  3-4  — Almost entirely duty-based ("managed X", "worked on Y") with no measurable outcomes.
  1-2  — Zero evidence of impact. Reads like a job description, not an achievement record.

FORMATTING (1-10): Is the layout clean, consistent, and appropriately concise?
  9-10 — Consistent structure, clean bullet points, appropriate length (1 page <10 yrs, max 2 pages), clear sections.
  7-8  — Mostly clean with minor inconsistencies (mixed tenses, uneven spacing, slightly too long/short).
  5-6  — Noticeable issues: walls of text, inconsistent punctuation, poor use of white space, or odd length.
  3-4  — Multiple formatting problems that hurt readability: no clear sections, random capitalization, cluttered layout.
  1-2  — Severely disorganized. No structure, unreadable, or looks like a first draft.

KEYWORDS (1-10): Are the right industry and role-specific terms present?
  9-10 — Rich with relevant technical skills, tools, methodologies, and role-specific language for their field.
  7-8  — Good keyword coverage with a few obvious gaps for the apparent target role.
  5-6  — Generic terms present but missing many role-specific or industry-standard keywords.
  3-4  — Very thin on keywords. Relies on soft skills ("team player", "hard worker") over technical terms.
  1-2  — Almost no relevant keywords. Would be invisible to any recruiter search or job match.

ATS COMPATIBILITY (1-10): Would this resume parse correctly through Applicant Tracking Systems?
  9-10 — Standard section headers (Experience, Education, Skills, Summary), plain text bullets, no tables or columns, spelled-out acronyms, consistent date formats.
  7-8  — Mostly ATS-safe with minor issues (one non-standard header, occasional symbol, or inconsistent dates).
  5-6  — Some ATS risks: non-standard section names, heavy use of abbreviations, or slight reliance on formatting.
  3-4  — Likely to parse poorly: multi-column layout, text in headers/footers, missing standard sections.
  1-2  — Almost certainly unparseable: tables, graphics, text boxes, or PDF with no selectable text.

---

Rules:
- All scores must be integers between 1 and 10. Use the rubrics above — do not guess.
- overall must equal the rounded average of the five breakdown scores.
- improvements must contain exactly 5 items targeting the lowest-scoring areas first.
- before/after must be concrete examples pulled directly from or inspired by the actual resume.
- The roast must be funny AND grounded in something specific from the resume.`;

export async function POST(request: NextRequest) {
  // Validate API key presence before doing anything else
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Groq API key is not configured.",
        hint: "Set GROQ_API_KEY in your .env.local file.",
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

  // Call Groq (OpenAI-compatible API)
  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });

  try {
    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
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
          { error: "Invalid Groq API key. Check your GROQ_API_KEY environment variable." },
          { status: 500 }
        );
      }

      if (status === 429) {
        return NextResponse.json(
          { error: "Groq rate limit reached. Please wait a moment and try again." },
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
