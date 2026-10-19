import type { UIMessage } from "ai";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { requireAuth } from "@/lib/auth";
import { getActiveInstructions } from "@/lib/db/instructions";
import { pruneChatTurns, startChatTurn } from "@/lib/db/turn";
import { agentErrorMessage } from "@/lib/error-text";
import { ensureHermesSession } from "@/lib/hermes/client";
import {
  getHermesConfig,
  missingHermesEnv,
  toHermesSessionId,
} from "@/lib/hermes/config";
import { startHermesRun } from "@/lib/hermes/run-client";
import { runTurnStream } from "@/lib/hermes/turn-stream";
import { extractMessageText } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 스트림을 열어 두는 최대 시간 — Vercel 함수 한도(300s)보다 짧게 잡아 **스스로** 닫는다.
 * 그때 브라우저는 커서를 들고 `/api/chat/{sessionId}/stream`으로 이어받고, 런은 계속 산다.
 */
const softDeadlineMs = Number(process.env.CHAT_SOFT_DEADLINE_MS ?? 240_000);

/**
 * DB의 활성 사용자 지시 사항(+선택 env 문구)을 `instructions`로 만든다.
 * Hermes는 이 값을 프로필 기본 프롬프트(SOUL) 위에 덧입힌다.
 */
const buildInstructions = async (): Promise<string | undefined> => {
  const sections: string[] = [];

  try {
    const activeList = await getActiveInstructions();
    const userPart = activeList
      .map((instruction) => `[${instruction.label}]\n${instruction.content}`)
      .join("\n\n---\n\n");
    if (userPart) sections.push(`## 사용자가 등록한 추가 지시사항\n${userPart}`);
  } catch (error) {
    // 지시 사항을 못 읽어도 대화는 계속된다 (DB 일시 오류 등).
    console.error("[chat:hermes] failed to load active instructions:", error);
  }

  const extra = (process.env.HERMES_SYSTEM_MESSAGE ?? "").trim();
  if (extra) sections.push(extra);

  return sections.length > 0 ? sections.join("\n\n") : undefined;
};

/**
 * 채팅 백엔드 — Hermes Agent(hachi 프로필)의 **디태치 런**(`/v1/runs`)으로 턴을 돌린다.
 *
 * 턴은 Vercel 함수 수명과 분리돼 있다: 함수가 죽어도 런은 계속되고, 브라우저는 커서를 들고
 * 재개 라우트로 이어받는다(자세한 흐름은 `turn-stream.ts` 주석 참고).
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

  const lastMessage = messages.at(-1);
  if (!lastMessage || lastMessage.role !== "user") {
    throw new Error(
      "새 사용자 메시지가 필요해요. (이전 응답 재생성은 아직 지원되지 않아요)"
    );
  }
  const userText = extractMessageText(lastMessage).trim();
  if (!userText) throw new Error("보낼 사용자 메시지가 비어 있어요.");

  const config = getHermesConfig();
  const hermesSessionId = toHermesSessionId(config, sessionId);

  // 오래된 턴 로그 청소 (best-effort) — 대화 흐름을 막지 않는다.
  void pruneChatTurns().catch(() => {});

  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: async ({ writer }) => {
      const instructions = await buildInstructions();
      await ensureHermesSession(config, hermesSessionId, userText);

      const hermesRunId = await startHermesRun(config, {
        sessionId: hermesSessionId,
        input: userText,
        instructions,
      });
      await startChatTurn(sessionId, hermesRunId, userText);

      await runTurnStream({
        writer,
        config,
        sessionId,
        hermesSessionId,
        softDeadlineMs,
        signal: req.signal,
        turn: {
          sessionId,
          hermesRunId,
          status: "running",
          nextOffset: 0,
          hermesSeq: -1,
          userText,
          error: null,
        },
      });
    },
    onError: (error) => {
      console.error("[chat:runs] stream error:", error);
      return agentErrorMessage(error);
    },
  });

  return createUIMessageStreamResponse({ stream });
};
