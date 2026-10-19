"use client";

import { kst } from "@/lib/kst";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sample } from "lodash";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useChat } from "@ai-sdk/react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";

import type { UIMessage } from "ai";
import { DefaultChatTransport, isToolUIPart } from "ai";

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { ExampleQuestions } from "@/components/example-questions";
import { HeartsOverlay } from "@/components/hearts";
import { MessageItem } from "@/components/message";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { useAuthStore } from "@/lib/auth-store";
import { chatErrorMessage } from "@/lib/error-text";
import { useSessionSidebarSync } from "@/lib/use-session-sidebar-sync";
import { extractMessageText } from "@/lib/utils";

/* ── 끊긴 턴 이어받기 헬퍼 ── */

/** 서버가 `message-metadata`로 보내 주는 이어받기 커서. */
interface StreamMetadata {
  /** 재생을 시작할 프레임 offset (열린 파트의 시작). */
  streamOffset?: number;
  /** 이 앞의 파트는 그대로 두고 그 뒤부터 재생한다. */
  keepParts?: number;
  /** 턴이 끝났는지 — false면 브라우저가 이어받는다. */
  streamDone?: boolean;
  /** 이 답변이 어느 Hermes 런의 결과인지 — "이미 화면에 있는 턴"인지 판별하는 표식. */
  turnRunId?: string;
}

/** 이 앱이 쓰는 메시지 타입 — metadata가 위 커서로 좁혀진다. */
type StreamUIMessage = UIMessage<StreamMetadata>;

/**
 * 세션별 이어받기 커서 — 서버가 파트 경계마다 `message-metadata`로 알려준 지점.
 * (전송 계층의 재접속 콜백이 렌더 밖에서 읽어야 해서 ref 대신 모듈 스코프에 둔다.)
 */
const streamCursorBySession = new Map<string, { offset: number; keepParts: number }>();
const readStreamCursor = (sessionId: string): { offset: number; keepParts: number } =>
  streamCursorBySession.get(sessionId) ?? { offset: 0, keepParts: 0 };

/** 이어받기 전 — 경계 이후(열려 있던) 파트를 버려 재생으로 다시 만들 수 있게 한다. */
const truncateLastAssistant = (
  messages: StreamUIMessage[],
  keepParts: number
): StreamUIMessage[] => {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant" || last.parts.length <= keepParts)
    return messages;
  return [...messages.slice(0, -1), { ...last, parts: last.parts.slice(0, keepParts) }];
};

/** 이어받지 못한 턴을 중단 상태로 표시한다 — 도구 카드가 스피너로 굳지 않게. */
const markLastInterrupted = (
  messages: StreamUIMessage[],
  label = "턴이 중단됐어요."
): StreamUIMessage[] => {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return messages;

  const parts = last.parts.map((part) => {
    if (
      isToolUIPart(part) &&
      (part.state === "input-available" || part.state === "input-streaming")
    ) {
      // 출력 없이 끝난 카드 — 스피너 대신 오류 상태로 굳힌다.
      return {
        ...part,
        state: "output-error",
        errorText: label,
      } as unknown as StreamUIMessage["parts"][number];
    }
    return part;
  });
  const metadata: StreamMetadata = { ...last.metadata, streamDone: true };
  return [...messages.slice(0, -1), { ...last, parts, metadata }];
};

/* ── ChatShell ── */

export const ChatShell = ({ sessionId: initialSessionId }: { sessionId?: string }) => {
  // 첫 화면(/)의 새 세션 ID는 마운트 시 한 번만 생성한다.
  // 렌더마다 새로 만들면 리렌더 시 key가 바뀌어 대화가 초기화된다.
  const [newSessionId] = useState(() => uuidv4());
  const sessionId = initialSessionId ?? newSessionId;

  return (
    <SidebarLayout activeSessionId={sessionId}>
      <ChatInner key={sessionId} sessionId={sessionId} />
    </SidebarLayout>
  );
};

/* ── ChatInner ── */

const ChatInner = ({ sessionId }: { sessionId: string }) => {
  const tk = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const { handleFinish } = useSessionSidebarSync({
    sessionId,
    token: tk ?? "",
  });

  const { data: initialMessages, isLoading: messagesLoading } = useQuery({
    queryKey: ["messages", sessionId],
    queryFn: async () => {
      const r = await fetch(`/api/messages?sessionId=${sessionId}`, {
        headers: { "x-auth-token": tk },
      });
      const d = await r.json();
      // Prefer complete session state (preserves exact SSE structure)
      if (d.state) return d.state as UIMessage[];
      return [];
    },
    staleTime: 5_000,
  });

  const {
    messages: rawMessages,
    status,
    setMessages,
    sendMessage,
    stop,
    error,
    clearError,
    regenerate,
    resumeStream,
  } = useChat<StreamUIMessage>({
    id: sessionId,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { sessionId },
      headers: { "x-auth-token": tk },
      // 끊긴 턴 이어받기 — 서버가 이 GET으로 프레임을 재생하고 런에 다시 붙는다.
      prepareReconnectToStreamRequest: () => ({
        api: `/api/chat/${sessionId}/stream`,
        headers: {
          "x-auth-token": tk ?? "",
          "x-stream-offset": String(readStreamCursor(sessionId).offset),
        },
      }),
    }),
    onFinish: handleFinish,
  });

  // BE 에러(설정 누락, LLM 호출 실패 등) 내용을 토스트로 그대로 보여주고 입력창을 다시 열어준다.
  useEffect(() => {
    if (!error) return;

    toast.error("메시지를 보내지 못했어요", {
      description: chatErrorMessage(error),
      duration: 12_000,
      action: { label: "다시 시도", onClick: () => regenerate() },
    });
    clearError();
  }, [error, clearError, regenerate]);

  // Load saved messages into useChat once query resolves
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      setMessages(initialMessages as Parameters<typeof setMessages>[0]);
    }
  }, [initialMessages, setMessages]);

  /**
   * 스트림이 `finish` 없이 끊겼으면(소프트 데드라인·네트워크·탭 절전) 이어받는다.
   * 커서(offset/keepParts)는 서버가 파트 경계마다 보내 준 `message-metadata`에서 온다.
   *
   * 재개 스트림도 소프트 데드라인에 걸려 다시 끊길 수 있으므로, 더 진행이 없을 때까지
   * 루프로 이어받는다. 세 번 연속 커서가 그대로면 이어받을 게 없다고 보고 중단으로 표시한다.
   */
  const resumeLoopRef = useRef(false);
  const lastOffsetRef = useRef(-1);
  const noProgressRef = useRef(0);
  /** 재개 루프가 최신 메시지 상태를 읽도록 하는 참조 (React 상태는 클로저에 갇힌다). */
  const rawMessagesRef = useRef<StreamUIMessage[]>([]);

  useEffect(() => {
    rawMessagesRef.current = rawMessages;
  }, [rawMessages]);

  /**
   * 재개 루프 — 커서가 더 진행하지 않을 때까지 이어받는다.
   * 재개 스트림도 소프트 데드라인에 걸려 다시 끊길 수 있어서 루프가 필요하고,
   * 세 번 연속 커서가 그대로면 이어받을 게 없다고 보고 중단으로 표시한다.
   */
  const runResumeLoop = useCallback(async () => {
    if (resumeLoopRef.current) return;
    resumeLoopRef.current = true;
    try {
      for (let attempt = 0; attempt < 50; attempt++) {
        const current = rawMessagesRef.current.at(-1);
        if (!current || current.role !== "assistant") return;
        const currentMeta: StreamMetadata = current.metadata ?? {};
        if (currentMeta.streamDone || typeof currentMeta.streamOffset !== "number")
          return;

        if (currentMeta.streamOffset === lastOffsetRef.current) {
          noProgressRef.current += 1;
          if (noProgressRef.current > 3) {
            // 더 이상 이어받을 게 없다 — 중단으로 표시하고 스피너를 멈춘다.
            toast.error("턴이 중단됐어요", {
              description: "연결이 끊겨 이어받지 못했어요. 다시 시도해 주세요.",
              duration: 10_000,
            });
            setMessages((prev) => markLastInterrupted(prev));
            return;
          }
        } else {
          noProgressRef.current = 0;
          lastOffsetRef.current = currentMeta.streamOffset;
        }

        // 열려 있던 파트는 경계까지만 남기고 자른 뒤 재생으로 다시 만든다.
        // 커서(전송 헤더)와 자르는 기준을 같은 metadata에서 맞춰야 파트가 유실되지 않는다.
        streamCursorBySession.set(sessionId, {
          offset: currentMeta.streamOffset,
          keepParts: currentMeta.keepParts ?? 0,
        });
        setMessages((prev) => truncateLastAssistant(prev, currentMeta.keepParts ?? 0));
        await resumeStream();
        // 재개 스트림이 끝난 뒤 상태 반영을 기다렸다가 다시 판단한다.
        const { promise: settled, resolve: settle } = Promise.withResolvers<void>();
        setTimeout(settle, 300);
        await settled;
      }
    } catch (resumeError) {
      console.error("[chat] resume failed:", resumeError);
    } finally {
      resumeLoopRef.current = false;
    }
  }, [sessionId, setMessages, resumeStream]);

  useEffect(() => {
    const last = rawMessages.at(-1);
    if (!last || last.role !== "assistant") {
      noProgressRef.current = 0;
      lastOffsetRef.current = -1;
      return;
    }

    const meta: StreamMetadata = last.metadata ?? {};
    if (typeof meta.streamOffset === "number") {
      streamCursorBySession.set(sessionId, {
        offset: meta.streamOffset,
        keepParts: meta.keepParts ?? 0,
      });
    }
    if (meta.streamDone || typeof meta.streamOffset !== "number") return;
    if (status !== "ready") return;

    void runResumeLoop();
  }, [rawMessages, status, sessionId, runResumeLoop]);

  /**
   * 콜드 복구 — 브라우저가 사라진 동안(탭 닫힘·다른 기기) 서버가 기록한 턴을 되살린다.
   *
   * 서버는 클라이언트가 떠나도 런과 프레임 기록을 이어 가므로, 다시 열린 화면은
   * ① 사용자 메시지를 되살리고 ② offset 0부터 전체 프레임을 재생해 답변까지 복원한다.
   * (프레임 로그는 하루 뒤 정리된다 — 그 안에 돌아오면 복구된다.)
   */
  const coldRecoveredRef = useRef<string | null>(null);
  useEffect(() => {
    if (messagesLoading) return;
    if (coldRecoveredRef.current === sessionId) return;
    if (status !== "ready") return;

    const loaded = (initialMessages ?? []) as StreamUIMessage[];
    const loadedLast = loaded.at(-1);
    const loadedAssistant = [...loaded].reverse().find((m) => m.role === "assistant");
    const loadedMeta: StreamMetadata = loadedAssistant?.metadata ?? {};

    // 저장된 상태가 이미 진행 중인 턴을 들고 있으면 위의 재개 경로가 처리한다.
    if (
      loadedLast?.role === "assistant" &&
      !loadedMeta.streamDone &&
      typeof loadedMeta.streamOffset === "number"
    ) {
      return;
    }
    // 이미 이 턴의 답변이 저장돼 있으면(재생 완료 후 저장된 상태) 다시 재생하지 않는다.
    const knownRunId = loadedMeta.turnRunId;

    coldRecoveredRef.current = sessionId;
    void (async () => {
      try {
        const r = await fetch(`/api/chat/${sessionId}/turn`, {
          headers: { "x-auth-token": tk ?? "" },
        });
        if (!r.ok) return;
        const { turn } = (await r.json()) as {
          turn: { runId: string; userText: string | null } | null;
        };
        if (!turn || turn.runId === knownRunId) return;

        const userText = turn.userText?.trim();
        if (!userText) return;

        // 사용자 메시지를 되살린다(없을 때만) — assistant 메시지는 재생의 `start`가 만든다.
        // 저장된 상태가 아직 반영 전일 수 있으니, 그때는 DB에서 읽은 메시지를 기준으로 삼는다.
        setMessages((prev) => {
          const base = prev.length >= loaded.length ? prev : loaded;
          const tail = base.at(-1);
          if (tail?.role === "user" && extractMessageText(tail).trim() === userText) {
            return base;
          }
          return [
            ...base,
            {
              id: uuidv4(),
              role: "user",
              parts: [{ type: "text", text: userText }],
            } as StreamUIMessage,
          ];
        });

        // offset 0부터 전체 재생 — 이미 끝난 턴이면 `finish`까지 재생되고
        // onFinish가 화면 상태를 저장해 다음 방문부터는 재생 없이 복원된다.
        streamCursorBySession.set(sessionId, { offset: 0, keepParts: 0 });
        lastOffsetRef.current = -1;
        noProgressRef.current = 0;
        await resumeStream();
        await runResumeLoop(); // 아직 살아 있는 턴이면 이어받는다
      } catch (coldError) {
        console.error("[chat] cold resume failed:", coldError);
      }
    })();
  }, [
    messagesLoading,
    initialMessages,
    status,
    sessionId,
    tk,
    setMessages,
    resumeStream,
    runResumeLoop,
  ]);

  /**
   * 정지 버튼 — 브라우저 스트림만 끊으면 서버의 디태치 런은 계속 살아 있으므로,
   * 런도 함께 멈추도록 cancel API를 부른다. 화면은 곧바로 "중단"으로 표시해
   * 이어받기 루프/오류 토스트가 뒤따르지 않게 한다.
   */
  const handleStop = useCallback(() => {
    streamCursorBySession.delete(sessionId);
    noProgressRef.current = 0;
    lastOffsetRef.current = -1;
    setMessages((prev) => markLastInterrupted(prev, "사용자가 멈췄어요."));
    clearError();
    void fetch(`/api/chat/${sessionId}/cancel`, {
      method: "POST",
      headers: { "x-auth-token": tk ?? "" },
    }).catch(() => {});
    stop();
  }, [sessionId, tk, stop, setMessages, clearError]);

  const [showHearts, setShowHearts] = useState(false);

  const invalidateTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 타이머 정리: 언마운트 시 예약된 invalidation 취소
  useEffect(() => {
    return () => {
      clearTimeout(invalidateTimerRef.current);
    };
  }, []);

  const scheduleInvalidate = useCallback(() => {
    if (invalidateTimerRef.current) clearTimeout(invalidateTimerRef.current);
    invalidateTimerRef.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    }, 2000);
  }, [queryClient]);

  /**
   * 첫 화면(/)에서 시작한 대화를 실제 세션 URL(/[sessionId])로 승격한다.
   * shallow replaceState라 라우트 재렌더(스트리밍 중단) 없이 URL만 바뀐다.
   */
  const promoteToSessionUrl = useCallback(() => {
    if (window.location.pathname !== "/") return;
    window.history.replaceState(null, "", `/${sessionId}`);
  }, [sessionId]);

  const handlePromptSubmit = useCallback(
    (message: { text: string }) => {
      if (!message.text.trim() || status !== "ready") return;
      const trimmed = message.text.trim();

      promoteToSessionUrl();
      scheduleInvalidate();

      // "사랑해" easter egg — trigger hearts
      if (trimmed.includes("사랑해") || trimmed.includes("좋아해")) {
        setShowHearts(true);
      }

      sendMessage({ text: trimmed });
    },
    [status, sendMessage, scheduleInvalidate, promoteToSessionUrl]
  );

  const handleQuestionClick = useCallback(
    (text: string) => {
      if (status !== "ready") return;

      promoteToSessionUrl();
      scheduleInvalidate();

      // "사랑해" easter egg — trigger hearts
      if (text.includes("사랑해") || text.includes("좋아해")) {
        setShowHearts(true);
      }

      sendMessage({ text });
    },
    [status, sendMessage, scheduleInvalidate, promoteToSessionUrl]
  );

  /* ── Debounced loading: show ChatLoading only after 300ms ── */
  const [debounceLoading, setDebounceLoading] = useState(false);
  const showLoading = messagesLoading || debounceLoading;

  useEffect(() => {
    if (messagesLoading) {
      setDebounceLoading(true);
      return;
    }
    const timer = setTimeout(() => setDebounceLoading(false), 300);
    return () => clearTimeout(timer);
  }, [messagesLoading]);

  /* ── Split multi-step assistant messages at step boundaries ── */
  const messages = useMemo(() => {
    const result: typeof rawMessages = [];
    for (const msg of rawMessages) {
      if (msg.role !== "assistant") {
        result.push(msg);
        continue;
      }

      const stepIndices: number[] = [];
      for (let i = 0; i < msg.parts.length; i++) {
        if (msg.parts[i]?.type === "step-start") {
          stepIndices.push(i);
        }
      }

      if (stepIndices.length === 0) {
        result.push(msg);
        continue;
      }

      let prev = 0;
      for (let s = 0; s <= stepIndices.length; s++) {
        const end = s < stepIndices.length ? stepIndices[s] : msg.parts.length;
        const segment = msg.parts.slice(prev, end);
        if (segment.length > 0) {
          result.push({ ...msg, id: `${msg.id}__s${s}`, parts: segment });
        }
        prev = end + 1;
      }
    }
    return result;
  }, [rawMessages]);

  const streaming = useMemo(
    () => status === "submitted" || status === "streaming",
    [status]
  );

  const showLoader = useMemo(() => {
    if (status === "submitted") return true;

    const lastMessage = messages.at(-1);
    if (status !== "streaming" || lastMessage?.role !== "assistant") return false;

    // reasoning 아니고, pending tool이 없고, text도 없어야 함 (tool 완료 → 다음 LLM 대기)
    const isReasoning = lastMessage.parts.at(-1)?.type === "reasoning";

    if (isReasoning) return false;

    const hasLastText = lastMessage.parts.at(-1)?.type === "text";
    if (streaming && hasLastText) return false;

    const hasPendingTool = lastMessage.parts.some(
      (part) => "output" in part && part.type.includes("tool") && !part.output
    );

    return !hasPendingTool;
  }, [status, messages]);

  const hasMsgs = messages.length > 0;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ backgroundColor: "var(--color-canvas)" }}
    >
      <HeartsOverlay show={showHearts} onDone={() => setShowHearts(false)} />

      {/* Messages */}
      {showLoading ? (
        <ChatLoading />
      ) : hasMsgs || streaming ? (
        <MessageScrollerProvider autoScroll>
          <MessageScroller className="flex-1">
            <MessageScrollerViewport>
              <MessageScrollerContent className="mx-auto w-full max-w-2xl px-4 pt-12">
                {messages.map((m, idx) => (
                  <MessageScrollerItem
                    key={m.id}
                    messageId={m.id}
                    scrollAnchor={m.role === "user"}
                  >
                    <MessageItem
                      message={m}
                      isLastMessage={idx === messages.length - 1}
                      isStreaming={streaming}
                    />
                  </MessageScrollerItem>
                ))}
                {showLoader && (
                  <div className="flex animate-bounce items-center gap-2 px-3 py-2">
                    <Avatar size="sm" className="inline-flex md:hidden">
                      <AvatarImage src="/munjackgui.png" alt="하치와레" />
                    </Avatar>
                    <span className="text-sm text-muted-foreground">생각 중이에요…♪</span>
                  </div>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton variant="outline" />
          </MessageScroller>
        </MessageScrollerProvider>
      ) : (
        <div className="flex flex-1 flex-col items-center">
          <EmptyState onQuestionClick={handleQuestionClick} />
        </div>
      )}

      {/* Input area */}
      {!showLoading && (
        <div className="shrink-0 px-4 pb-6">
          <div className="mx-auto w-full max-w-2xl">
            <PromptInput
              onSubmit={handlePromptSubmit}
              className="relative flex flex-col rounded-2xl border **:data-[slot=input-group]:focus-within:border **:data-[slot=input-group]:focus-within:ring-0"
              style={{
                borderColor: "var(--color-hairline)",
                backgroundColor: "var(--color-canvas-soft)",
              }}
            >
              <PromptInputBody>
                <PromptInputTextarea
                  placeholder="뭐 하고 싶어…?"
                  className="max-h-32 min-h-13 resize-none border-0 bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-relaxed text-[--color-ink] placeholder:text-[--color-muted-soft] focus:outline-none focus-visible:ring-0"
                />
              </PromptInputBody>
              <PromptInputFooter>
                <PromptInputTools>
                  <RotatingPhrase />
                </PromptInputTools>
                <PromptInputSubmit status={status} onStop={handleStop} />
              </PromptInputFooter>
            </PromptInput>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Suggestion Chip ── */

/* ── Chat Loading ── */

const loadingPhrases = [
  "잠시만 기다려줘…!",
  "준비 중이야…♪",
  "거의 다 왔어…!",
  "데이터 불러오는 중…♪",
  "예은님… 기다려줘…!",
  "좋은 정보 찾는 중…♪",
  "잠깐만…! 곧 갈게…!",
];

const ChatLoading = () => {
  const phrase = useMemo(() => sample(loadingPhrases)!, []);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <img
        src="/munjackgui.png"
        alt="하치와레"
        className="size-20 animate-bounce rounded-full object-cover"
        style={{ backgroundColor: "var(--color-canvas-soft)" }}
      />
      <p
        className="text-sm"
        style={{ color: "var(--color-muted)" }}
        suppressHydrationWarning
      >
        {phrase}
      </p>
    </div>
  );
};

/* ── Rotating Phrase Badge ── */

const phrases = [
  "힘내자…!",
  "같이 가자…!",
  "야호…!",
  "좋아…♪",
  "예은니임…!",
  "데이트 가쟈…!",
  "맛난 거 먹쟈…!",
  "무섭지 않아…!",
  "둘이 함께…!",
  "즐거워…♪",
  "괜찮아…!",
  "완전 최고…!",
  "내가 도와줄게…!",
  "잘 될 거야…!",
  "…라는 거야…!",
  "알고 있어?〜",
  "사랑해…! 하고 말해봐…♪",
  "좋아한다고… 말해줘…!",
  "예은님 마음… 궁금해…!",
  "파나소닉 분석해볼까…!",
  "홍콩관광청 뉴스 볼래…!",
  "파나소닉 조회 해볼래…!",
  "브랜드 모니터링 해줘…!",
  "브랜드 뉴스 수집…!",
  "HKTB 분석…!",
];

const RotatingPhrase = () => {
  const [phrase, setPhrase] = useState(() => sample(phrases)!);
  const [fadeKey, setFadeKey] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => {
      setPhrase(sample(phrases)!);
      setFadeKey((p) => p + 1);
    }, 3000);
    return () => clearInterval(iv);
  }, []);

  return (
    <span
      className="flex items-center gap-1.5 text-[12px] font-medium"
      style={{ color: "var(--color-muted)" }}
    >
      <img
        src="/munjackgui.png"
        alt="하치와레"
        className="size-5 rounded-full object-cover"
        draggable={false}
      />
      <span key={fadeKey} className="animate-bounce-fade-in">
        {phrase}
      </span>
    </span>
  );
};

/* ── Empty State ── */

const subPhrases = [
  "어떻게든 되겠지…!!",
  "서두르지 않아도 괜찮아…!",
  "즐거운 기분… 계속… 가져가자…!",
  "몇 번이라도… 계속 응원할게…!!",
  "괜찮아, 항상 어떻게든 됐잖아…!!",
  "그거 완전 최고잖아…!!",
  "둘이 함께라면… 뭐든 즐거워…♪",
  "안 되면… 다른 방법… 찾아보자…!",
  "쉬고 싶을 땐… 쉬는 게… 최고야…!",
  "예은님이라면… 분명 행복할 거야…!",
  "오늘도 둘이서 즐겁게…♪",
  "맛집…이라는 거야…!?",
  "알고 있어?〜 그거 완전… 최고의 데이트 코스…라는 뜻이야!?",
];

const getTimeGreeting = (): string => {
  const hour = kst().hour();
  if (hour >= 6 && hour < 11) return "좋은 아침…! 예은님…♪";
  if (hour >= 11 && hour < 14) return "예은님…! 점심은 챙겨 먹었어…?";
  if (hour >= 14 && hour < 18) return "따스한 오후야…! 예은님…♪";
  if (hour >= 18 && hour < 24) return "저녁이 왔어…! 둘이서 저녁 어때…?";
  return "이 시간까지 깨어있구나…! 푹 쉬어야 해…!";
};

const EmptyState = ({ onQuestionClick }: { onQuestionClick: (q: string) => void }) => {
  const [subIdx, setSubIdx] = useState(0);
  const [fadeKey, setFadeKey] = useState(0);

  const timeGreeting = useMemo(() => getTimeGreeting(), []);

  useEffect(() => {
    const iv = setInterval(() => {
      setSubIdx((p) => (p + 1) % subPhrases.length);
      setFadeKey((p) => p + 1);
    }, 3000);
    return () => clearInterval(iv);
  }, []);
  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center gap-1">
      {/* Character icon */}
      <div className="mb-5">
        <img
          src="/munjackgui.png"
          alt="하치와레"
          className="size-16 rounded-full object-cover"
          style={{ backgroundColor: "var(--color-canvas-soft)" }}
          draggable={false}
        />
      </div>
      <h1
        className="text-[22px] leading-snug font-normal"
        style={{ color: "var(--color-ink)" }}
      >
        예은
        <span style={{ color: "var(--color-muted)" }}>님…!</span>
      </h1>
      <p className="animate-fade-in text-[15px]" style={{ color: "var(--color-ink)" }}>
        {timeGreeting}
      </p>
      <p
        key={fadeKey}
        className="animate-bounce-fade-in mt-1 text-[13px]"
        style={{ color: "var(--color-muted)" }}
      >
        {subPhrases[subIdx]}
      </p>
      <div className="mt-5">
        <ExampleQuestions onQuestionClick={onQuestionClick} />
      </div>
    </div>
  );
};
