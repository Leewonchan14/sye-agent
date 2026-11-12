import { monitorErrorResponse, requireAgentKey } from "@/lib/monitor/api";
import { runDailyCollectTick } from "@/lib/monitor/daily-collect";
import { publicOrigin } from "@/lib/monitor/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 예약 스크립트(`scripts/monitor-tick.py`) 전용 — 모든 사용자의 고객사·이슈 중
 * 시각이 된 것을 에이전트에게 맡긴다. 사용자 요청이 아니라 소유자 확인 없이 전체를 본다.
 * 고정 키는 스크립트만 쓰고, 에이전트에게는 런마다 일회성 콜백 토큰만 넘어간다.
 */
export const POST = async (req: Request) => {
  const authError = requireAgentKey(req);
  if (authError) return authError;
  try {
    return Response.json(await runDailyCollectTick(publicOrigin(req)));
  } catch (error) {
    return monitorErrorResponse(error, "오늘 수집을 시작하지 못했어요.");
  }
};
