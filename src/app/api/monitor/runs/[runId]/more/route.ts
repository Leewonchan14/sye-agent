import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { assertRunOwner, getMonitorClientPayload } from "@/lib/db/monitor";
import { monitorErrorResponse, parseId, readJson } from "@/lib/monitor/api";
import { startMoreSearch } from "@/lib/monitor/hermes";
import { publicOrigin } from "@/lib/monitor/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  category: z.string().max(40).optional(),
  request: z.string().trim().min(1).max(1000),
});

/** "더 찾기" — Hermes에게 추가 검색을 맡기고, 결과는 agent/runs로 돌아온다. */
export const POST = async (req: Request, ctx: { params: Promise<{ runId: string }> }) => {
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  const runId = parseId((await ctx.params).runId);
  if (!runId)
    return Response.json({ error: "runId가 올바르지 않아요." }, { status: 400 });

  try {
    const body = bodySchema.parse(await readJson(req));
    const run = await assertRunOwner(user.id, runId);
    if (run.pendingHermesRunId) {
      return Response.json({ error: "이미 에이전트가 찾고 있어요." }, { status: 409 });
    }
    const { client, items } = await getMonitorClientPayload(user.id, run.clientId, runId);
    const category = client.categories.find((c) => c.key === body.category);

    await startMoreSearch({
      origin: publicOrigin(req),
      runId,
      clientName: client.name,
      categories: client.categories,
      rules: client.rules,
      category: category ?? null,
      request: body.request,
      existingUrls: items.map((i) => i.url),
    });
    return Response.json({ ok: true }, { status: 202 });
  } catch (error) {
    return monitorErrorResponse(error, "에이전트에게 요청하지 못했어요.");
  }
};
