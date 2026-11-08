import { monitorErrorResponse, requireAgentKey } from "@/lib/monitor/api";
import { runDailyCollectTick } from "@/lib/monitor/daily-collect";
import { publicOrigin } from "@/lib/monitor/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Oracle의 예약 스크립트 전용 — 오늘 수집할 고객사가 있으면 하치와레에게 맡긴다.
 * 고정 키는 스크립트만 쓰고, 하치와레에게는 런마다 일회성 콜백 토큰만 넘어간다.
 */
export const POST = async (req: Request) => {
  const authError = requireAgentKey(req);
  if (authError) return authError;
  try {
    return Response.json(
      await runDailyCollectTick(publicOrigin(req), undefined, new URL(req.url).origin)
    );
  } catch (error) {
    return monitorErrorResponse(error, "오늘 수집을 시작하지 못했어요.");
  }
};
