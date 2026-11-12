import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { getDb, schema } from "@/lib/db/db";
import { seedDefaultSuggestions } from "@/lib/db/suggestions";

/**
 * 이메일·비밀번호 로그인 (Better Auth).
 *
 * DB 연결은 요청 시점에 만든다 — 빌드 중에는 DATABASE_URL이 없을 수 있다.
 */
const createAuth = () =>
  betterAuth({
    appName: process.env.NEXT_PUBLIC_APP_NAME || "AI 어시스턴트",
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    /**
     * 접속 주소(서버 IP·도메인·localhost)가 여러 개여도 로그인되도록, 요청이 들어온 바로 그 호스트의
     * 출처를 믿는다. 다른 사이트에서 보낸 요청은 Origin이 Host와 달라 그대로 막힌다.
     */
    trustedOrigins: (request) => {
      const host =
        request?.headers.get("x-forwarded-host") ?? request?.headers.get("host");
      return host ? [`http://${host}`, `https://${host}`] : [];
    },
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rateLimit: schema.rateLimit,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30일
      updateAge: 60 * 60 * 24, // 하루에 한 번 연장
    },
    rateLimit: {
      // 테스트 서버처럼 여러 계정을 빠르게 만들 때만 AUTH_RATE_LIMIT=off로 끈다.
      enabled: process.env.AUTH_RATE_LIMIT !== "off",
      storage: "database",
      modelName: "rateLimit",
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // 새 사용자에게 기본 예시 질문을 채워 준다. 실패해도 가입은 막지 않는다.
          after: async (created) => {
            await seedDefaultSuggestions(created.id).catch((error) =>
              console.error("[auth] failed to seed suggestions:", error)
            );
          },
        },
      },
    },
    advanced: {
      // https로만 접속하는 배포에서만 Secure 쿠키를 쓴다. http(사설망·localhost)로 열면
      // 브라우저가 Secure 쿠키를 버려 로그인이 유지되지 않는다.
      useSecureCookies:
        process.env.AUTH_SECURE_COOKIES === "true" ||
        (process.env.BETTER_AUTH_URL ?? "").startsWith("https://"),
    },
    plugins: [nextCookies()],
  });

let instance: ReturnType<typeof createAuth> | undefined;

export const getAuth = () => {
  instance ??= createAuth();
  return instance;
};

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

/** 요청 쿠키로 로그인한 사용자를 찾는다. 없으면 null. */
export const getRequestUser = async (req: Request): Promise<AuthUser | null> => {
  const result = await getAuth().api.getSession({ headers: req.headers });
  if (!result) return null;
  const { id, email, name } = result.user;
  return { id, email, name };
};

/**
 * API 라우트 공통 인증 — 로그인한 사용자를, 아니면 401 응답을 돌려준다.
 *
 * ```ts
 * const user = await requireUser(req);
 * if (user instanceof Response) return user;
 * ```
 */
export const requireUser = async (req: Request): Promise<AuthUser | Response> => {
  try {
    const user = await getRequestUser(req);
    if (user) return user;
  } catch (error) {
    console.error("[auth] session lookup failed:", error);
  }
  return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
};
