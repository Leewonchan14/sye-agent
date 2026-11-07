import { getAgentClientContext } from "@/lib/db/monitor";
import { monitorErrorResponse, requireAgentKey } from "@/lib/monitor/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hermes 전용 — 고객사 카테고리·규칙과 최근 14일 보고한 URL */
export const GET = async (req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const keyError = requireAgentKey(req);
  if (keyError) return keyError;
  try {
    return Response.json(await getAgentClientContext((await ctx.params).slug));
  } catch (error) {
    return monitorErrorResponse(error, "고객사 설정을 불러오지 못했어요.");
  }
};
