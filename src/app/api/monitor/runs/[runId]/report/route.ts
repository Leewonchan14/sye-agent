import { z } from "zod";

import { requireAuth } from "@/lib/auth";
import { markRunReported, unmarkRunReported } from "@/lib/db/monitor";
import { monitorErrorResponse, parseId, readJson } from "@/lib/monitor/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 고객사에 보고했다고 기록한다. 다음 수집에서 같은 기사를 빼는 기준이 된다. */
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

/** 보고 완료를 되돌린다. 포함했던 기사는 다음 수집에서 다시 집계된다. */
export const DELETE = async (
  req: Request,
  ctx: { params: Promise<{ runId: string }> }
) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const runId = parseId((await ctx.params).runId);
  if (!runId)
    return Response.json({ error: "runId가 올바르지 않아요." }, { status: 400 });

  try {
    await unmarkRunReported(runId);
    return Response.json({ ok: true });
  } catch (error) {
    return monitorErrorResponse(error, "보고 기록을 되돌리지 못했어요.");
  }
};
