import type { UIMessage } from "ai";
import {
  createAgentUIStreamResponse,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";

import { getAgent } from "@/lib/agent";
import { requireAuth } from "@/lib/auth";
import { saveSessionState } from "@/lib/db/session";
import { agentErrorMessage } from "@/lib/error-text";
import { getChatBackend, getHermesConfig, missingHermesEnv } from "@/lib/hermes/config";
import { runHermesTurn } from "@/lib/hermes/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Hermes Agent(hachi 프로필) 백엔드 — `LLM_BACKEND=hermes`일 때 사용한다.
 * 프론트엔드는 그대로: Hermes 세션 SSE를 AI SDK UI 메시지 스트림으로 변환해 돌려준다.
 */
const handleHermesChat = async (req: Request): Promise<Response> => {
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
      // 기존 백엔드와 동일하게 Neon에도 상태를 저장한다.
      try {
        await saveSessionState(sessionId, allMessages);
      } catch (err) {
        console.error("Failed to save session state:", err);
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
};

export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  if (getChatBackend() === "hermes") {
    return handleHermesChat(req);
  }

  // ── ToolLoopAgent 백엔드 (기본값) ─────────────────────────────
  // Validate required configuration
  const missing: string[] = [];
  const hasProviderKey =
    !!process.env.DEEPSEEK_API_KEY || !!process.env.OPENCODE_GO_API_KEY;
  if (!hasProviderKey) missing.push("DEEPSEEK_API_KEY 또는 OPENCODE_GO_API_KEY");
  if (!process.env.NAVER_CLIENT_ID) missing.push("NAVER_CLIENT_ID");
  if (!process.env.NAVER_CLIENT_SECRET) missing.push("NAVER_CLIENT_SECRET");

  if (missing.length > 0) {
    return Response.json(
      {
        error: `${missing.join(", ")}이 설정되지 않았습니다. .env 파일을 확인해주세요.`,
      },
      { status: 500 }
    );
  }

  let messages: unknown[];
  let sessionId: string | undefined;
  try {
    ({ messages, sessionId } = await req.json());
  } catch {
    return Response.json({ error: "요청 본문을 읽을 수 없습니다." }, { status: 400 });
  }

  try {
    const agent = await getAgent(sessionId);

    return await createAgentUIStreamResponse({
      agent,
      uiMessages: messages,
      // 기본값은 "An error occurred." 라서 실제 원인이 클라이언트까지 전달되지 않는다.
      onError: (error) => {
        console.error("[chat] stream error:", error);
        return agentErrorMessage(error);
      },
      onEnd: async ({ messages: allMessages }) => {
        if (!sessionId || !allMessages) return;
        try {
          await saveSessionState(sessionId, allMessages);
        } catch (err) {
          console.error("Failed to save session state:", err);
        }
      },
    });
  } catch (error) {
    console.error("[chat] failed to start stream:", error);
    return Response.json({ error: agentErrorMessage(error) }, { status: 500 });
  }
};
