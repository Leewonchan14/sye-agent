import { requireAuth } from "@/lib/auth";
import { monitorErrorResponse } from "@/lib/monitor/api";
import { readSetupDraft } from "@/lib/monitor/draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async (req: Request, ctx: { params: Promise<{ runId: string }> }) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  const { runId } = await ctx.params;
  if (!/^[\w-]{1,120}$/.test(runId)) {
    return Response.json({ error: "runId가 올바르지 않아요." }, { status: 400 });
  }
  try {
    return Response.json(await readSetupDraft(runId));
  } catch (error) {
    return monitorErrorResponse(error, "초안을 불러오지 못했어요.");
  }
};
