import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const sessionToken =
    request.cookies.get("sessionToken")?.value;

  // Sendum núverandi slóð áfram til server-side layout.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-gloggt-pathname", pathname);

  // Opinberar slóðir sem þurfa ekki session-cookie.
  if (
    pathname === "/innskraning" ||
pathname === "/gleymt-lykilord" ||
pathname === "/endurstilla-lykilord" ||
pathname === "/api/insight/worker" ||
pathname === "/api/insight/scheduler"
  ) {
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // Lykilorðaskiptasíðan þarf session-cookie.
  if (pathname === "/skipta-lykilordi") {
    if (!sessionToken) {
      return NextResponse.redirect(
        new URL("/innskraning", request.url)
      );
    }

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // Án session-cookie má ekki sjá annað í GLÖGGT.
  if (!sessionToken) {
    if (pathname.startsWith("/mobile")) {
      return NextResponse.redirect(
        new URL("/innskraning?next=%2Fmobile", request.url)
      );
    }

    return NextResponse.redirect(
      new URL("/innskraning", request.url)
    );
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|gloggt-192.png|gloggt-512.png).*)",
  ],
};