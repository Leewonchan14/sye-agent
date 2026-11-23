import { requireAuth } from "@/lib/auth";
import { rerollPick } from "@/lib/db/picks";
import { parseId } from "@/lib/monitor/api";
import { pickErrorResponse } from "@/lib/picks/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 지금 결과를 빼고 다시 뽑는다 — 한 번만 */
export const POST = async (
  req: Request,
  ctx: { params: Promise<{ pickId: string }> }
) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  const pickId = parseId((await ctx.params).pickId);
  if (!pickId)
    return Response.json({ error: "pickId가 올바르지 않아요." }, { status: 400 });
  try {
    return Response.json(await rerollPick(pickId));
  } catch (error) {
    return pickErrorResponse(error, "다시 뽑지 못했어요.");
  }
};
