import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { banMediaForRun } from "@/lib/db/monitor";
import { monitorErrorResponse, parseId, readJson } from "@/lib/monitor/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 이 매체를 제외 매체 규칙에 추가하고, 이번 수집에서도 뺀다. */
export const POST = async (req: Request, ctx: { params: Promise<{ runId: string }> }) => {
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  const runId = parseId((await ctx.params).runId);
  if (!runId)
    return Response.json({ error: "runId가 올바르지 않아요." }, { status: 400 });

  try {
    const { media } = z
      .object({ media: z.string().trim().min(1).max(80) })
      .parse(await readJson(req));
    await banMediaForRun(user.id, runId, media);
    return Response.json({ ok: true });
  } catch (error) {
    return monitorErrorResponse(error, "제외 매체를 추가하지 못했어요.");
  }
};
