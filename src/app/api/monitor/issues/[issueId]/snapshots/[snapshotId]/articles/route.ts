import { requireUser } from "@/lib/auth";
import { getIssueArticles } from "@/lib/db/monitor";
import { monitorErrorResponse, parseId } from "@/lib/monitor/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 이슈 집계 한 번에 센 기사 목록 */
export const GET = async (
  req: Request,
  ctx: { params: Promise<{ issueId: string; snapshotId: string }> }
) => {
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  const params = await ctx.params;
  const issueId = parseId(params.issueId);
  const snapshotId = parseId(params.snapshotId);
  if (!issueId || !snapshotId)
    return Response.json({ error: "id가 올바르지 않아요." }, { status: 400 });

  try {
    return Response.json({
      articles: await getIssueArticles(user.id, issueId, snapshotId),
    });
  } catch (error) {
    return monitorErrorResponse(error, "기사 목록을 불러오지 못했어요.");
  }
};
