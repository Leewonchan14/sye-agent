import { z } from "zod";

import { requireAuth } from "@/lib/auth";
import { markRunReported } from "@/lib/db/monitor";
import { monitorErrorResponse, parseId, readJson } from "@/lib/monitor/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 리포트를 복사(=보냄)했다고 기록한다. 다음 수집에서 같은 기사를 빼는 기준이 된다. */
export const POST = async (req: Request, ctx: { params: Promise<{ runId: string }> }) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const runId = parseId((await ctx.params).runId);
  if (!runId)
    return Response.json({ error: "runId가 올바르지 않아요." }, { status: 400 });

  try {
    const { reportText } = z
      .object({ reportText: z.string().min(1).max(50_000) })
      .parse(await readJson(req));
    await markRunReported(runId, reportText);
    return Response.json({ ok: true });
  } catch (error) {
    return monitorErrorResponse(error, "보고 기록을 남기지 못했어요.");
  }
};
