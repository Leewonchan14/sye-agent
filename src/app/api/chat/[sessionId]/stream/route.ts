import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { requireAuth } from "@/lib/auth";
import { claimChatTurnWriter, clearChatTurn, getChatTurn } from "@/lib/db/turn";
import { agentErrorMessage } from "@/lib/error-text";
import { getHermesConfig, toHermesSessionId } from "@/lib/hermes/config";
import { runTurnStream } from "@/lib/hermes/turn-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 본 라우트와 POST /api/chat이 같은 값을 써야 한다 (`route.ts` 참고). */
const softDeadlineMs = Number(process.env.CHAT_SOFT_DEADLINE_MS ?? 240_000);

/**
 * `GET /api/chat/{sessionId}/stream` — 끊긴 턴 이어받기.
 *
 * AI SDK의 재개 규약(`transport.reconnectToStream`)이 GET으로 이 경로를 부르고,
 * 클라이언트가 마지막으로 안전하게 받은 offset(`x-stream-offset`)부터 프레임을 재생한 뒤
 * 살아 있는 Hermes 런에 다시 붙는다. 이어받을 게 없으면 204를 돌려준다.
 */
export const GET = async (
  req: Request,
  ctx: { params: Promise<{ sessionId: string }> }
) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const { sessionId } = await ctx.params;
  const turn = await getChatTurn(sessionId);
  if (!turn) return new Response(null, { status: 204 });

  const url = new URL(req.url);
  const rawOffset = req.headers.get("x-stream-offset") ?? url.searchParams.get("offset");
  const parsed = Number(rawOffset);
  const clientOffset = Number.isFinite(parsed)
    ? Math.max(0, Math.min(Math.floor(parsed), turn.nextOffset))
    : 0;

  // 이미 끝난 턴이고 클라이언트도 끝까지 받았으면 재개할 게 없다 — 로그를 정리한다.
  if (turn.status !== "running" && clientOffset >= turn.nextOffset) {
    await clearChatTurn(sessionId);
    return new Response(null, { status: 204 });
  }

  const config = getHermesConfig();
  const hermesSessionId = toHermesSessionId(config, sessionId);

  /**
   * writer 리스 — 다른 릴레이가 살아 있으면(5초 heartbeat) 이 요청은 **읽기 전용**이다.
   * 새로고침을 반복해 재개 요청이 여러 개 붙어도 프레임 로그는 한 writer만 쓴다.
   * writer가 죽어 15초 넘게 조용하면 이 요청이 인계받아 기록을 이어 간다.
   */
  const writerId = crypto.randomUUID();
  const isWriter = await claimChatTurnWriter(sessionId, writerId);
  // 인계받았다면 그 사이 writer가 남긴 프레임/seq까지 반영된 최신 상태로 시작한다.
  const currentTurn = (isWriter ? await getChatTurn(sessionId) : null) ?? turn;

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      await runTurnStream({
        writer,
        config,
        sessionId,
        hermesSessionId,
        turn: currentTurn,
        writerId,
        readOnly: !isWriter,
        softDeadlineMs,
        signal: req.signal,
        replayFromOffset: clientOffset,
      });
    },
    onError: (error) => {
      console.error("[chat:runs] resume stream error:", error);
      return agentErrorMessage(error);
    },
  });

  return createUIMessageStreamResponse({ stream });
};
