import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const sessionToken =
    request.cookies.get("sessionToken")?.value;

  // Innskráningarsíðan sjálf þarf alltaf að vera aðgengileg.
  if (pathname === "/innskraning") {
    return NextResponse.next();
  }

  // Ef engin virk session-cookie er til
  // sendum við notandann á innskráningu.
  if (!sessionToken) {
    const url = request.nextUrl.clone();
    url.pathname = "/innskraning";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};