import { NextResponse } from "next/server";

export async function GET() {
  // Internal diagnostics are never exposed by hosted or production builds.
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL) {
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  return NextResponse.json({
    ok: true,
    service: "GLÖGGT Dev Bridge",
    mode: "read-only",
    timestamp: new Date().toISOString(),
  });
}