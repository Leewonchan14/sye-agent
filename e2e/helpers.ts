import type { APIRequestContext, Page, PlaywrightWorkerArgs } from "@playwright/test";
import pg from "pg";

const databaseUrl = process.env.E2E_DATABASE_URL ?? "";
if (!/\/[^/?]*e2e[^/?]*(\?|$)/.test(databaseUrl)) {
  throw new Error("E2E_DATABASE_URL은 이름에 e2e가 들어간 임시 DB여야 합니다.");
}

export const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";

/**
 * 모든 스펙 파일이 같은 워커에서 이 pool을 함께 쓴다. 파일마다 afterAll에서 닫으면
 * 다음 파일이 닫힌 pool을 쓰게 되므로 닫지 않고, 쉬는 연결이 프로세스 종료를 막지 않게 한다.
 */
export const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 2,
  allowExitOnIdle: true,
});

/** 사용자와 사용자에 딸린 모든 데이터를 지운다 (user를 지우면 나머지는 cascade). */
export const resetUsers = async () => {
  await pool.query(`truncate "user", rate_limit, verification restart identity cascade`);
};

export const PASSWORD = "e2e-password-123";

let seq = 0;
/** 테스트마다 겹치지 않는 이메일 */
export const uniqueEmail = (prefix = "user") =>
  `${prefix}-${Date.now().toString(36)}-${(seq += 1)}@e2e.test`;

/** Better Auth는 쿠키가 있는 POST의 Origin을 확인한다. */
const originHeaders = { origin: baseURL };

/** API로 가입한다 — 응답 쿠키가 이 요청 컨텍스트(또는 페이지 컨텍스트)에 남는다. */
export const signUpWith = async (
  request: APIRequestContext,
  email = uniqueEmail(),
  name = "테스트 사용자"
) => {
  const res = await request.post("/api/auth/sign-up/email", {
    headers: originHeaders,
    data: { email, password: PASSWORD, name },
  });
  if (!res.ok()) throw new Error(`가입 실패 ${res.status()}: ${await res.text()}`);
  return email;
};

/** 페이지 브라우저 컨텍스트에 로그인된 새 사용자를 만든다. */
export const signUpPage = async (page: Page, name?: string) =>
  signUpWith(page.request, uniqueEmail(), name);

/** 쿠키가 따로 노는 API 클라이언트 — 사용자 A·B를 동시에 흉내 낼 때 쓴다. */
export const newUserClient = async (
  playwright: PlaywrightWorkerArgs["playwright"],
  prefix: string
) => {
  const request = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: originHeaders,
  });
  const email = await signUpWith(request, uniqueEmail(prefix), prefix);
  return { request, email };
};
