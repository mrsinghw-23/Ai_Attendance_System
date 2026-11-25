import { NextRequest, NextResponse } from "next/server";

export function middleware(
  request: NextRequest
) {
  const token =
    request.cookies.get("token")?.value;

  const protectedRoutes = [
    "/",
    "/employees",
    "/locations",
    "/cameras",
    "/attendance",
    "/users",
    "/reports",
  ];

  const isProtected =
    protectedRoutes.some((route) =>
      request.nextUrl.pathname.startsWith(
        route
      )
    );

  if (isProtected && !token) {
    return NextResponse.redirect(
      new URL(
        "/login",
        request.url
      )
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/employees/:path*",
    "/locations/:path*",
    "/cameras/:path*",
    "/attendance/:path*",
    "/users/:path*",
    "/reports/:path*",
  ],
};