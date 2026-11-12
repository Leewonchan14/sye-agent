import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * 로그인 쿠키가 없으면 로그인 화면으로 보낸다.
 *
 * 쿠키가 있는지만 보는 빠른 검사다 — 실제 세션 검증은 API 라우트(`requireUser`)와
 * 화면(`useSession`)이 한다.
 */
export const proxy = (request: NextRequest) => {
  if (getSessionCookie(request)) return NextResponse.next();

  const url = new URL("/login", request.url);
  const next = request.nextUrl.pathname + request.nextUrl.search;
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
};

export const config = {
  // API·정적 파일·로그인/회원가입 화면은 건너뛴다.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login|signup|.*\\..*).*)"],
};
