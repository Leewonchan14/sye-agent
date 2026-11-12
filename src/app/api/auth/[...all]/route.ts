import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = (req: Request) => getAuth().handler(req);

/** 로그인·회원가입·로그아웃·세션 조회 (`/api/auth/*`, Better Auth) */
export const { GET, POST } = toNextJsHandler(handler);
