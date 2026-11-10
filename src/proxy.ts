import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check: app pages need a session cookie, or the visitor goes to sign-in and comes back
 * afterwards. The real check (is the session valid?) happens on the server for every API call.
 * The home page, sign-in pages, delivery hosting and the API are not matched.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has("mp_session")) return NextResponse.next();
  const url = request.nextUrl.clone();
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/new", "/contracts/:path*", "/ledger", "/fairness", "/settings"],
};
