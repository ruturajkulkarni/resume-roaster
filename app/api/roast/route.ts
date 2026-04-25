import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  // TODO: Parse resume text/file and call AI to roast it
  return NextResponse.json({ message: "Roast endpoint coming soon" });
}
