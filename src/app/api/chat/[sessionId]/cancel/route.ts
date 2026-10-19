import { requireAuth } from "@/lib/auth";
import { getChatTurn, updateChatTurn } from "@/lib/db/turn";
import { getHermesConfig } from "@/lib/hermes/config";
import { stopHermesRun } from "@/lib/hermes/run-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /api/chat/{sessionId}/cancel` — 사용자가 정지를 눌렀을 때만 턴을 끊는다.
 *
 * 브라우저가 그냥 떠난 경우(새로고침·네트워크 끊김)에는 런을 살려 두고 재개로 이어받는다.
 */
export const POST = async (
  req: Request,
  ctx: { params: Promise<{ sessionId: string }> }
) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const { sessionId } = await ctx.params;
  const turn = await getChatTurn(sessionId);
  if (!turn || turn.status !== "running") {
    return Response.json({ ok: true, status: turn?.status ?? "none" });
  }

  await stopHermesRun(getHermesConfig(), turn.hermesRunId);
  await updateChatTurn(sessionId, { status: "cancelled" });

  return Response.json({ ok: true, status: "cancelled" });
};
