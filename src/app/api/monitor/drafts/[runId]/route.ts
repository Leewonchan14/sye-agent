import { requireUser } from "@/lib/auth";
import { monitorErrorResponse } from "@/lib/monitor/api";
import { readSetupDraft } from "@/lib/monitor/draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async (req: Request, ctx: { params: Promise<{ runId: string }> }) => {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  // 경로 이름은 runId지만 값은 사용자에게 묶인 초안 id(`<Hermes 런 id>.<서명>`)다.
  const { runId: draftId } = await ctx.params;
  if (!/^[\w.-]{1,200}$/.test(draftId)) {
    return Response.json({ error: "초안 id가 올바르지 않아요." }, { status: 400 });
  }
  try {
    return Response.json(await readSetupDraft(user.id, draftId));
  } catch (error) {
    return monitorErrorResponse(error, "초안을 불러오지 못했어요.");
  }
};
