import { timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";

import { getCallbackToken, MonitorError } from "@/lib/db/monitor";
import { hashCallbackToken } from "@/lib/monitor/hermes";

/** 실패한 JSON 본문은 null로 돌려준다. */
export const readJson = async (req: Request): Promise<Record<string, unknown> | null> => {
  try {
    const body = await req.json();
    return typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

/** 검증 오류는 400(또는 MonitorError.status), 그 밖의 오류는 500. */
export const monitorErrorResponse = (error: unknown, fallback: string): Response => {
  if (error instanceof MonitorError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    const first = error.issues[0];
    const where = first?.path.join(".") || "요청";
    return Response.json(
      { error: `${where}: ${first?.message ?? "형식 오류"}` },
      { status: 400 }
    );
  }
  console.error(error);
  return Response.json({ error: fallback }, { status: 500 });
};

export const parseId = (value: string | null | undefined): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * Hermes(모니터링 스킬)가 호출하는 `/api/monitor/agent/*` 인증.
 * 사이트 비밀번호 토큰과 별도로 `MONITOR_INGEST_KEY`를 `x-monitor-key` 헤더로 받는다.
 */
export const requireAgentKey = (req: Request): Response | null => {
  const expected = process.env.MONITOR_INGEST_KEY;
  if (!expected) {
    return Response.json(
      { error: "서버에 MONITOR_INGEST_KEY가 설정되지 않았어요." },
      { status: 503 }
    );
  }
  const given = req.headers.get("x-monitor-key") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: "모니터링 키가 올바르지 않아요." }, { status: 401 });
  }
  return null;
};

export const safeEqual = (given: string, expected: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * 고정 키(`x-monitor-key`) 또는 이 런/이슈에 발급한 일회성 콜백 토큰(`x-monitor-token`)을 받는다.
 * 대시보드 버튼으로 시작한 Hermes 런은 토큰으로, 크론 수집은 고정 키로 들어온다.
 */
export const requireAgentAccess = async (
  req: Request,
  target: { kind: "run" | "issue"; id: number }
): Promise<Response | null> => {
  const key = process.env.MONITOR_INGEST_KEY;
  const givenKey = req.headers.get("x-monitor-key");
  if (key && givenKey && safeEqual(givenKey, key)) return null;

  const givenToken = req.headers.get("x-monitor-token");
  if (givenToken) {
    const stored = await getCallbackToken(target);
    if (
      stored?.hash &&
      stored.expiresAt &&
      stored.expiresAt.valueOf() > Date.now() &&
      safeEqual(hashCallbackToken(givenToken), stored.hash)
    ) {
      return null;
    }
    return Response.json(
      { error: "콜백 토큰이 올바르지 않거나 만료됐어요." },
      { status: 401 }
    );
  }
  return requireAgentKey(req);
};
