import { requireUser } from "@/lib/auth";
import { isSessionOwner } from "@/lib/db/session";
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
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  const { sessionId } = await ctx.params;
  if (!(await isSessionOwner(user.id, sessionId))) {
    return Response.json({ error: "이 대화에 접근할 수 없습니다." }, { status: 403 });
  }
  const turn = await getChatTurn(sessionId);
  if (!turn || turn.status !== "running") {
    return Response.json({ ok: true, status: turn?.status ?? "none" });
  }

  await stopHermesRun(getHermesConfig(user.id), turn.hermesRunId);
  await updateChatTurn(sessionId, { status: "cancelled" });

  return Response.json({ ok: true, status: "cancelled" });
};
