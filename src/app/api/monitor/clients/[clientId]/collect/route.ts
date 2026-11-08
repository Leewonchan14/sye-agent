import { requireAuth } from "@/lib/auth";
import { getClientView } from "@/lib/db/monitor";
import { monitorErrorResponse, parseId } from "@/lib/monitor/api";
import { startCollectNow } from "@/lib/monitor/daily-collect";
import { publicOrigin } from "@/lib/monitor/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "지금 한 번 수집" — 정해진 시각을 기다리지 않고 이번 구간을 모은다. */
export const POST = async (
  req: Request,
  ctx: { params: Promise<{ clientId: string }> }
) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const clientId = parseId((await ctx.params).clientId);
  if (!clientId)
    return Response.json({ error: "clientId가 올바르지 않아요." }, { status: 400 });

  try {
    const runId = await startCollectNow(publicOrigin(req), await getClientView(clientId));
    return Response.json({ runId }, { status: 202 });
  } catch (error) {
    return monitorErrorResponse(error, "수집을 시작하지 못했어요.");
  }
};
