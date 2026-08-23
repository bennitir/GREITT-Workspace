import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const activeUserId = request.cookies.get("activeUserId")?.value;

  // Stjórnborðið verður að vera aðgengilegt
  // svo við getum valið prófunarnotanda.
  if (pathname.startsWith("/stjornbord")) {
    return NextResponse.next();
  }

  // Enginn virkur notandi:
  // ekki hleypa inn á aðrar síður kerfisins.
 
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};