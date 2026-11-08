import { z } from "zod";

import { requireAuth } from "@/lib/auth";
import {
  getIssueRow,
  getMonitorIssuePayload,
  updateMonitorIssue,
} from "@/lib/db/monitor";
import { monitorErrorResponse, parseId, readJson } from "@/lib/monitor/api";
import { reconcileIssuePending } from "@/lib/monitor/hermes";
import { TIME } from "@/lib/monitor/period";
import {
  issueCollectSlot,
  MAX_ISSUE_GAP_MINUTES,
  MIN_ISSUE_GAP_MINUTES,
} from "@/lib/monitor/schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async (
  req: Request,
  ctx: { params: Promise<{ issueId: string }> }
) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const issueId = parseId((await ctx.params).issueId);
  if (!issueId)
    return Response.json({ error: "issueId가 올바르지 않아요." }, { status: 400 });

  try {
    await reconcileIssuePending(issueId);
    return Response.json(await getMonitorIssuePayload(issueId));
  } catch (error) {
    return monitorErrorResponse(error, "이슈를 불러오지 못했어요.");
  }
};

const patchSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  keywords: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  brandTerms: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  isActive: z.boolean().optional(),
  collectStart: z.string().regex(TIME, "시각 형식이 올바르지 않아요.").optional(),
  collectGapMinutes: z
    .number()
    .int()
    .min(MIN_ISSUE_GAP_MINUTES, "간격은 30분 이상이어야 해요.")
    .max(MAX_ISSUE_GAP_MINUTES, "간격은 24시간 이하여야 해요.")
    .optional(),
});

export const PATCH = async (
  req: Request,
  ctx: { params: Promise<{ issueId: string }> }
) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const issueId = parseId((await ctx.params).issueId);
  if (!issueId)
    return Response.json({ error: "issueId가 올바르지 않아요." }, { status: 400 });

  try {
    const patch = patchSchema.parse(await readJson(req));
    const row = await getIssueRow(issueId);
    if (!row) return Response.json({ error: "이슈가 없어요." }, { status: 404 });

    // 일정을 바꾸면 이미 지난 시각을 뒤늦게 돌리지 않고 다음 시각부터 시작한다.
    const rescheduled =
      (patch.collectStart !== undefined && patch.collectStart !== row.collectStart) ||
      (patch.collectGapMinutes !== undefined &&
        patch.collectGapMinutes !== row.collectGapMinutes);
    const issue = await updateMonitorIssue(issueId, {
      ...patch,
      ...(rescheduled && {
        lastAutoSlot: issueCollectSlot({
          collectStart: patch.collectStart ?? row.collectStart,
          collectGapMinutes: patch.collectGapMinutes ?? row.collectGapMinutes,
        }).key,
      }),
    });
    return Response.json({ issue });
  } catch (error) {
    return monitorErrorResponse(error, "이슈를 저장하지 못했어요.");
  }
};
