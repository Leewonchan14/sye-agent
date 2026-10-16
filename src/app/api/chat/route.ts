import type { UIMessage } from "ai";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { requireAuth } from "@/lib/auth";
import { saveSessionState } from "@/lib/db/session";
import { agentErrorMessage } from "@/lib/error-text";
import { getHermesConfig, missingHermesEnv } from "@/lib/hermes/config";
import { runHermesTurn } from "@/lib/hermes/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 채팅 백엔드 — Hermes Agent(hachi 프로필)가 유일한 경로다.
 * 프론트엔드는 그대로: Hermes 세션 SSE를 AI SDK UI 메시지 스트림으로 변환해 돌려준다.
 */
export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const missing = missingHermesEnv();
  if (missing.length > 0) {
    return Response.json(
      {
        error: `${missing.join(", ")}이 설정되지 않았습니다. .env 파일을 확인해주세요.`,
      },
      { status: 500 }
    );
  }

  let parsed: { messages?: unknown; sessionId?: unknown };
  try {
    parsed = await req.json();
  } catch {
    return Response.json({ error: "요청 본문을 읽을 수 없습니다." }, { status: 400 });
  }

  const messages = Array.isArray(parsed.messages) ? (parsed.messages as UIMessage[]) : [];
  const sessionId = typeof parsed.sessionId === "string" ? parsed.sessionId : undefined;

  if (messages.length === 0) {
    return Response.json({ error: "messages가 필요합니다." }, { status: 400 });
  }
  if (!sessionId) {
    return Response.json({ error: "sessionId가 필요합니다." }, { status: 400 });
  }

  const config = getHermesConfig();

  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: async ({ writer }) => {
      await runHermesTurn({
        writer,
        config,
        sessionId,
        uiMessages: messages,
        abortSignal: req.signal,
      });
    },
    onError: (error) => {
      console.error("[chat:hermes] stream error:", error);
      return agentErrorMessage(error);
    },
    onEnd: async ({ messages: allMessages }) => {
      // Hermes가 대화 히스토리를 소유하지만, 사이드바/검색/히스토리 UI를 위해
      // Neon에도 상태를 저장한다.
      try {
        await saveSessionState(sessionId, allMessages);
      } catch (err) {
        console.error("Failed to save session state:", err);
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
};
