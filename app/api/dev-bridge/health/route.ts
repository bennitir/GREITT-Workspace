import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "GLÖGGT Dev Bridge",
    mode: "read-only",
    timestamp: new Date().toISOString(),
  });
}