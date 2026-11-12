import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { assertIssueOwner, getMonitorIssuePayload } from "@/lib/db/monitor";
import { monitorErrorResponse, parseId, readJson } from "@/lib/monitor/api";
import { startIssueRecount } from "@/lib/monitor/hermes";
import { publicOrigin } from "@/lib/monitor/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "지금 다시 집계" — 직전 정기 보고 이후 추가 기사를 Hermes에게 세게 한다. */
export const POST = async (
  req: Request,
  ctx: { params: Promise<{ issueId: string }> }
) => {
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  const issueId = parseId((await ctx.params).issueId);
  if (!issueId)
    return Response.json({ error: "issueId가 올바르지 않아요." }, { status: 400 });

  try {
    const { isReport } = z
      .object({ isReport: z.boolean().default(false) })
      .parse((await readJson(req)) ?? {});
    const row = await assertIssueOwner(user.id, issueId);
    if (row.pendingHermesRunId) {
      return Response.json({ error: "이미 집계하고 있어요." }, { status: 409 });
    }
    const { issue, snapshots } = await getMonitorIssuePayload(user.id, issueId);
    const lastReport = [...snapshots].reverse().find((s) => s.isReport);

    await startIssueRecount({
      origin: publicOrigin(req),
      issueId,
      title: issue.title,
      keywords: issue.keywords,
      brandTerms: issue.brandTerms,
      lastSnapshotAt: lastReport?.at ?? null,
      reportRecipient: issue.reportRecipient,
      reportTemplate: issue.reportTemplate,
      isReport,
    });
    return Response.json({ ok: true }, { status: 202 });
  } catch (error) {
    return monitorErrorResponse(error, "집계를 요청하지 못했어요.");
  }
};
