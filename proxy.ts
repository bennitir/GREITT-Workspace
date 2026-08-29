import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const sessionToken =
    request.cookies.get("sessionToken")?.value;

  // Sendum núverandi slóð áfram til server-side layout.
  // Þar getum við borið hana saman við stöðu notandans
  // í gagnagrunninum.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-gloggt-pathname", pathname);

  // Innskráningarsíðan þarf alltaf að vera aðgengileg.
  if (pathname === "/innskraning") {
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // Lykilorðaskiptasíðan þarf að vera aðgengileg
  // þegar session-cookie er til.
  if (pathname === "/skipta-lykilordi") {
    if (!sessionToken) {
      const url = request.nextUrl.clone();
      url.pathname = "/innskraning";

      return NextResponse.redirect(url);
    }

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // Án session-cookie má ekki sjá neitt annað í GLÖGGT.
  if (!sessionToken) {
    const url = request.nextUrl.clone();
    url.pathname = "/innskraning";

    return NextResponse.redirect(url);
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};