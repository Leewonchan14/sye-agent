import { z } from "zod";

import { requireAuth } from "@/lib/auth";
import { getMonitorIssuePayload, updateMonitorIssue } from "@/lib/db/monitor";
import { monitorErrorResponse, parseId, readJson } from "@/lib/monitor/api";
import { reconcileIssuePending } from "@/lib/monitor/hermes";

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
    const issue = await updateMonitorIssue(
      issueId,
      patchSchema.parse(await readJson(req))
    );
    return Response.json({ issue });
  } catch (error) {
    return monitorErrorResponse(error, "이슈를 저장하지 못했어요.");
  }
};
