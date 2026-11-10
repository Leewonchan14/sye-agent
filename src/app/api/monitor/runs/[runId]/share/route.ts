import { randomBytes } from "node:crypto";

import { requireAuth } from "@/lib/auth";
import { getRunRow, setRunShareToken } from "@/lib/db/monitor";
import { monitorErrorResponse, parseId } from "@/lib/monitor/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const readRunId = async (ctx: { params: Promise<{ runId: string }> }) =>
  parseId((await ctx.params).runId);

/** 고객사에 보낼 읽기 전용 리포트 링크를 켠다. 이미 켜져 있으면 같은 링크를 돌려준다. */
export const POST = async (req: Request, ctx: { params: Promise<{ runId: string }> }) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const runId = await readRunId(ctx);
  if (!runId)
    return Response.json({ error: "runId가 올바르지 않아요." }, { status: 400 });

  try {
    const run = await getRunRow(runId);
    if (!run) return Response.json({ error: "수집 결과가 없어요." }, { status: 404 });
    const token = run.shareToken ?? randomBytes(18).toString("base64url");
    if (!run.shareToken) await setRunShareToken(runId, token);
    return Response.json({ token });
  } catch (error) {
    return monitorErrorResponse(error, "공유 링크를 만들지 못했어요.");
  }
};

/** 공유 링크를 끈다. 이미 보낸 링크는 더 열리지 않는다. */
export const DELETE = async (
  req: Request,
  ctx: { params: Promise<{ runId: string }> }
) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const runId = await readRunId(ctx);
  if (!runId)
    return Response.json({ error: "runId가 올바르지 않아요." }, { status: 400 });

  try {
    await setRunShareToken(runId, null);
    return Response.json({ ok: true });
  } catch (error) {
    return monitorErrorResponse(error, "공유 링크를 끄지 못했어요.");
  }
};
