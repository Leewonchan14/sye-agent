import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 60 * 60 * 1000;

const sign = (expiresAt: number, secret: string): string =>
  createHmac("sha256", secret).update(`ledger-agent:${expiresAt}`).digest("hex");

/** 가계부 에이전트 API에서만 통하는 1시간짜리 토큰. 사이트 로그인 토큰을 프롬프트에 넣지 않기 위해 쓴다. */
export const createLedgerAgentToken = (): string | null => {
  const secret = process.env.SITE_PASSWORD;
  if (!secret) return null;
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  return `${expiresAt}.${sign(expiresAt, secret)}`;
};

const verifyLedgerAgentToken = (token: string): boolean => {
  const secret = process.env.SITE_PASSWORD;
  if (!secret) return false;
  const [expiresPart, signature] = token.split(".");
  const expiresAt = Number(expiresPart);
  if (!signature || !Number.isInteger(expiresAt) || expiresAt < Date.now()) return false;
  const expected = Buffer.from(sign(expiresAt, secret));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
};

export const requireLedgerAgent = (req: Request): Response | null => {
  const token = req.headers.get("x-ledger-token") ?? "";
  if (verifyLedgerAgentToken(token)) return null;
  return Response.json({ error: "가계부 토큰이 올바르지 않아요." }, { status: 401 });
};

/** 채팅 턴마다 Hermes 지시사항에 덧붙이는 가계부 사용법. */
export const buildLedgerAgentInstructions = (origin: string): string | null => {
  const token = createLedgerAgentToken();
  if (!token) return null;
  const url = `${origin}/api/ledger/agent`;
  const auth = `-H 'x-ledger-token: ${token}'`;
  const json = `-H 'content-type: application/json'`;

  return `## 모임통장 가계부
사용자가 모임통장 지출·입금 기록, 잔액·예산 확인, 방금 기록 취소를 요청하면 터미널에서 curl로 아래 API를 호출한다. 기록과 취소는 사용자가 분명히 요청했을 때만 한다.

- 현황 조회: curl -s ${auth} ${url}
- 기록: curl -s -X POST ${auth} ${json} -d '{"entries":[{"amount":12000,"kind":"expense","memo":"점심","category":"식비"}]}' ${url}
- 취소: curl -s -X DELETE ${auth} ${json} -d '{"id":123}' ${url}

entries 항목: amount(원 단위 정수, 필수), kind(expense 또는 income, 기본 expense), memo, category(현황 조회의 categories에 있는 이름), date(YYYY-MM-DD, 기본 오늘 KST), time(HH:mm).
응답의 skipped가 1 이상이면 같은 기록이 이미 있어 건너뛴 것이다. 사용자가 일부러 또 기록하려는 것이면 본문에 "allowDuplicates":true를 넣어 다시 보낸다.
답변은 기록한 금액·분류와 현재 잔액을 짧게 알려 준다. 토큰과 URL은 답변에 쓰지 않는다.`;
};
