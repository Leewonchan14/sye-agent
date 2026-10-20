import { requireAuth } from "@/lib/auth";
import { getChatTurn } from "@/lib/db/turn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/chat/{sessionId}/turn` — 서버가 기억하는 턴 상태.
 *
 * 브라우저가 사라진 동안(탭 닫힘·네트워크 끊김)에도 서버는 런을 계속 기록하므로,
 * 다시 열린 화면은 이걸 보고 "내가 모르는 턴"을 찾아 되살린다
 * (`chat.tsx`의 콜드 복구 — 사용자 메시지는 `userText`, 나머지는 프레임 재생).
 */
export const GET = async (
  req: Request,
  ctx: { params: Promise<{ sessionId: string }> }
) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const { sessionId } = await ctx.params;
  const turn = await getChatTurn(sessionId);

  // 프레임이 하나도 없는 끝난 턴은 복구할 게 없다 (로그가 지워졌거나 시작 직후).
  if (!turn || (turn.status !== "running" && turn.nextOffset === 0)) {
    return Response.json({ turn: null });
  }

  return Response.json({
    turn: {
      runId: turn.hermesRunId,
      status: turn.status,
      nextOffset: turn.nextOffset,
      userText: turn.userText,
    },
  });
};
