import { addIssueSnapshot } from "@/lib/db/monitor";
import {
  monitorErrorResponse,
  parseId,
  readJson,
  requireAgentAccess,
} from "@/lib/monitor/api";
import { agentSnapshotSchema } from "@/lib/monitor/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hermes 전용 — 이슈 집계 스냅샷 저장 (고정 키 또는 이 이슈의 콜백 토큰) */
export const POST = async (
  req: Request,
  ctx: { params: Promise<{ issueId: string }> }
) => {
  const issueId = parseId((await ctx.params).issueId);
  if (!issueId) {
    return Response.json({ error: "issueId가 올바르지 않아요." }, { status: 400 });
  }

  const authError = await requireAgentAccess(req, { kind: "issue", id: issueId });
  if (authError) return authError;

  try {
    const input = agentSnapshotSchema.parse(await readJson(req));
    // 버튼으로 시작한 집계(콜백 토큰)는 에이전트의 시계·시간대를 믿지 않고 받은 시각을 쓴다.
    if (req.headers.get("x-monitor-token")) input.at = undefined;
    const snapshot = await addIssueSnapshot(issueId, input);
    return Response.json({ snapshot }, { status: 201 });
  } catch (error) {
    return monitorErrorResponse(error, "집계를 저장하지 못했어요.");
  }
};
