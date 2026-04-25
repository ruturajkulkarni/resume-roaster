import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const SUPPORTED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/jpg",
]);

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data. Send the file as multipart/form-data." },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No file found in the request. Include it as the `file` field." },
      { status: 400 }
    );
  }

  if (!SUPPORTED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type "${file.type}". Upload a PDF, JPG, or PNG.` },
      { status: 400 }
    );
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // --- PDF ---
  if (file.type === "application/pdf") {
    try {
      // Use the inner lib file directly — pdf-parse's index.js reads test fixtures
      // on load which don't exist in Vercel's serverless deployment and cause a crash.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (b: Buffer) => Promise<{ text: string }>;
      const data = await pdfParse(buffer);
      const text = data.text?.trim();

      if (!text) {
        return NextResponse.json(
          { error: "Could not extract text from this PDF. It may be scanned or image-only. Try uploading a PNG/JPG screenshot instead." },
          { status: 422 }
        );
      }

      return NextResponse.json({ text });
    } catch (err) {
      console.error("[extract] pdf-parse error:", err);
      return NextResponse.json(
        { error: "Failed to parse the PDF. Make sure it is a valid, text-based PDF file." },
        { status: 422 }
      );
    }
  }

  // --- Image (JPG / PNG) — use OpenAI vision ---
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key is not configured. Set OPENAI_API_KEY in .env.local." },
      { status: 500 }
    );
  }

  try {
    const client = new OpenAI({ apiKey });
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${file.type};base64,${base64}`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: dataUrl, detail: "high" },
            },
            {
              type: "text",
              text: "This is a resume image. Extract ALL text from it verbatim, preserving structure (sections, bullet points, dates, etc.). Return only the extracted text — no commentary, no markdown fences.",
            },
          ],
        },
      ],
      max_tokens: 2000,
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) {
      return NextResponse.json(
        { error: "Could not extract text from the image. Make sure the resume is clearly readable." },
        { status: 422 }
      );
    }

    return NextResponse.json({ text });
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      if (err.status === 401) {
        return NextResponse.json(
          { error: "Invalid OpenAI API key." },
          { status: 500 }
        );
      }
      if (err.status === 429) {
        return NextResponse.json(
          { error: "OpenAI rate limit hit. Please wait a moment and try again." },
          { status: 429 }
        );
      }
    }
    console.error("[extract] vision error:", err);
    return NextResponse.json(
      { error: "Failed to extract text from the image." },
      { status: 502 }
    );
  }
}
