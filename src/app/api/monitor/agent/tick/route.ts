import { after } from "next/server";

import { runDateSpotTick } from "@/lib/dates/tick";
import { writeRecapComments } from "@/lib/ledger/recap-comment";
import { monitorErrorResponse, requireAgentKey } from "@/lib/monitor/api";
import { runDailyCollectTick } from "@/lib/monitor/daily-collect";
import { publicOrigin } from "@/lib/monitor/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** 데이트 추천 조사는 모니터링과 따로 실패해도 서로 막지 않는다. */
const dateSpotTick = async (origin: string, siteOrigin: string) => {
  try {
    return await runDateSpotTick(origin, undefined, siteOrigin);
  } catch (error) {
    console.error("[date-spots]", error);
    return {
      started: [] as string[],
      failed: [{ client: "데이트 추천", error: errorText(error) }],
      notifications: [] as string[],
      checks: [] as number[],
    };
  }
};

/**
 * Oracle의 예약 스크립트 전용 — 오늘 수집할 고객사가 있으면 하치와레에게 맡긴다.
 * 데이트 추천 매일 조사도 같은 시계로 돈다.
 * 고정 키는 스크립트만 쓰고, 하치와레에게는 런마다 일회성 콜백 토큰만 넘어간다.
 */
export const POST = async (req: Request) => {
  const authError = requireAgentKey(req);
  if (authError) return authError;
  // 응답을 돌려준 뒤에 돌아서 수집 시계를 늦추지 않는다.
  after(writeRecapComments);
  try {
    const origin = publicOrigin(req);
    const siteOrigin = new URL(req.url).origin;
    const [monitor, dates] = await Promise.all([
      runDailyCollectTick(origin, undefined, siteOrigin),
      dateSpotTick(origin, siteOrigin),
    ]);
    const nextCheckAt = Math.min(Date.parse(monitor.nextCheckAt), ...dates.checks);
    return Response.json({
      started: [...monitor.started, ...dates.started],
      failed: [...monitor.failed, ...dates.failed],
      notifications: [...monitor.notifications, ...dates.notifications],
      nextCheckAt: new Date(nextCheckAt).toISOString(),
    });
  } catch (error) {
    return monitorErrorResponse(error, "오늘 수집을 시작하지 못했어요.");
  }
};
