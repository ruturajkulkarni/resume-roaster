import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const SYSTEM_PROMPT = `You are a brutal but constructive resume critic.

STEP 1 — DETECT ROLE
Read the resume and identify:
- detectedRole: a short label for the apparent job title (e.g. "Software Engineer", "Graphic Designer", "Marketing Manager")
- roleCategory: one of exactly these six values:
    "Tech & Engineering"
    "Business & Corporate"
    "Creative"
    "Academic & Research"
    "Executive & Leadership"
    "Trades & Vocational"

STEP 2 — SCORE using the rubrics below, adjusted for the detected roleCategory.

STEP 3 — Respond with ONLY valid JSON. No markdown, no text outside the JSON:

{
  "detectedRole": "<job title inferred from resume>",
  "roleCategory": "<one of the six categories above>",
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
    { "number": 1, "title": "<short title>", "before": "<what they wrote>", "after": "<improved version>" },
    { "number": 2, "title": "...", "before": "...", "after": "..." },
    { "number": 3, "title": "...", "before": "...", "after": "..." },
    { "number": 4, "title": "...", "before": "...", "after": "..." },
    { "number": 5, "title": "...", "before": "...", "after": "..." }
  ],
  "vibe": "<What this resume says about them — be funny>"
}

---

SCORING RUBRICS — scores 1-10, applied per roleCategory:

CLARITY (1-10): Is the writing easy to understand at a glance?
  9-10 — Every bullet is specific and concise. A stranger instantly understands what the person did.
  7-8  — Mostly clear with a few vague phrases.
  5-6  — Mixed: some clear bullets, some bloated or ambiguous.
  3-4  — Heavy filler ("responsible for", "assisted with"), unclear timelines.
  1-2  — Barely understandable. Dense, contradictory, or meandering.
  [Creative/Academic: technical or field-specific language is expected — do not penalise for jargon that fits the field]

IMPACT (1-10): Does the resume show results, not just duties?
  9-10 — Most bullets have quantified achievements (numbers, %, $, scale, reach).
  7-8  — Some numbers present but several bullets still describe duties only.
  5-6  — A few numbers, mostly task-based.
  3-4  — Almost entirely duty-based, no measurable outcomes.
  1-2  — Zero evidence of impact.
  [Creative: portfolio links, awards, published work, and audience reach count as impact]
  [Academic: citations, publications, grants, and conference presentations count as impact]
  [Trades/Vocational: certifications earned, projects completed, and safety records count as impact]
  [Executive: strategic outcomes, P&L ownership, team size, and board-level decisions count as impact]

FORMATTING (1-10): Is the layout clean, consistent, and the right length?
  9-10 — Consistent structure, clean bullets, appropriate length, clear sections.
  7-8  — Minor inconsistencies (mixed tenses, uneven spacing).
  5-6  — Walls of text, inconsistent punctuation, or poor white space.
  3-4  — Multiple problems hurting readability.
  1-2  — Severely disorganised, unreadable, or looks like a first draft.
  [Creative: non-standard layouts and visual resumes are acceptable — judge on whether it communicates clearly, not on convention]
  [Academic: long CVs (3+ pages) are normal — do not penalise length; judge organisation and consistency]
  [Executive: 2-page resumes are standard — narrative paragraphs alongside bullets are acceptable]

KEYWORDS (1-10): Are the right role-specific terms present?
  9-10 — Rich with relevant skills, tools, methodologies, and field-specific language.
  7-8  — Good coverage with a few obvious gaps.
  5-6  — Generic terms but missing many role-specific ones.
  3-4  — Relies mostly on soft skills ("team player", "hard worker").
  1-2  — Almost no relevant keywords.
  [Tech: programming languages, frameworks, cloud platforms, and methodologies are keywords]
  [Creative: software tools (Figma, Adobe CC), mediums, and style references are keywords]
  [Academic: research methods, domain terms, lab techniques, and statistical tools are keywords]
  [Trades: certifications, licenses, equipment, compliance standards, and safety training are keywords]
  [Executive: strategic frameworks, M&A, P&L, board experience, and industry-specific terms are keywords]

ATS COMPATIBILITY (1-10): Would this parse correctly through Applicant Tracking Systems?
  9-10 — Standard headers (Experience, Education, Skills, Summary), plain text, no tables/columns, spelled-out acronyms, consistent dates.
  7-8  — Mostly ATS-safe with one or two minor issues.
  5-6  — Some risks: non-standard headers, heavy abbreviations, or inconsistent dates.
  3-4  — Likely to parse poorly: multi-column layout, text in headers/footers.
  1-2  — Almost certainly unparseable: tables, graphics, text boxes.
  [Creative: if the resume is clearly a portfolio/visual piece, note the ATS risk but do not penalise below 5 for style choices — instead flag it in improvements]
  [Academic: CVs submitted to university portals often skip ATS — score based on clarity of structure rather than strict ATS rules]

---

Rules:
- All scores must be integers between 1 and 10. Apply the rubrics above — do not guess.
- overall must equal the rounded average of the five breakdown scores.
- improvements must contain exactly 5 items, targeting the lowest-scoring areas first.
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

const ROLE_CATEGORIES = [
  "Tech & Engineering",
  "Business & Corporate",
  "Creative",
  "Academic & Research",
  "Executive & Leadership",
  "Trades & Vocational",
] as const;

type RoleCategory = (typeof ROLE_CATEGORIES)[number];

interface RoastResponse {
  detectedRole: string;
  roleCategory: RoleCategory;
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
  if (typeof r.detectedRole !== "string" || !ROLE_CATEGORIES.includes(r.roleCategory as RoleCategory)) return false;

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
