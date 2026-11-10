import { DateSpotError, getDigestToken } from "@/lib/db/dates";
import { monitorErrorResponse, safeEqual } from "@/lib/monitor/api";
import { hashCallbackToken } from "@/lib/monitor/hermes";

export const dateErrorResponse = (error: unknown, fallback: string): Response => {
  if (error instanceof DateSpotError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return monitorErrorResponse(error, fallback);
};

/**
 * 하치와레가 결과를 보낼 때의 인증 — 그 조사에 발급한 일회성 토큰(`x-monitor-token`)
 * 또는 고정 키(`x-monitor-key`, 직접 올릴 때).
 */
export const requireDigestAccess = async (
  req: Request,
  digestId: number
): Promise<Response | null> => {
  const key = process.env.MONITOR_INGEST_KEY;
  const givenKey = req.headers.get("x-monitor-key");
  if (key && givenKey && safeEqual(givenKey, key)) return null;

  const givenToken = req.headers.get("x-monitor-token");
  const stored = givenToken ? await getDigestToken(digestId) : null;
  if (
    givenToken &&
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
};
