"use client";

import { Send, Square } from "lucide-react";

import { useCallback, useEffect, useState } from "react";

import { useChat } from "@ai-sdk/react";

import { DefaultChatTransport } from "ai";

import { MessageItem } from "@/components/message";
import { PasswordGate } from "@/components/password-gate";
import { SessionSidebar } from "@/components/session-sidebar";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Textarea } from "@/components/ui/textarea";

/* ── ChatShell ── */

export const ChatShell = () => {
  const [authed, setAuthed] = useState(false);
  const [sid, setSid] = useState("");
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setAuthed(localStorage.getItem("auth_0411") === "true");
    let s = localStorage.getItem("sessionId");
    if (!s) {
      s = crypto.randomUUID();
      localStorage.setItem("sessionId", s);
    }
    setSid(s);
    setMounted(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const onNew = useCallback(() => {
    const ns = crypto.randomUUID();
    localStorage.setItem("sessionId", ns);
    setSid(ns);
  }, []);

  const onSelect = useCallback((id: string) => {
    localStorage.setItem("sessionId", id);
    setSid(id);
  }, []);

  const toggle = useCallback(() => setSidebarOpen((p) => !p), []);

  if (!mounted)
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ backgroundColor: "var(--color-canvas)" }}
      />
    );
  if (!authed) return <PasswordGate onSuccess={() => setAuthed(true)} />;

  return (
    <div
      className="flex h-screen flex-row"
      style={{ backgroundColor: "var(--color-canvas)" }}
    >
      <SessionSidebar
        activeSessionId={sid}
        onSelect={onSelect}
        onNew={onNew}
        isOpen={sidebarOpen}
        onToggle={toggle}
      />
      <div className="flex min-w-0 flex-1 flex-col min-h-0">
        <ChatInner key={sid} sessionId={sid} />
      </div>
    </div>
  );
};

/* ── ChatInner ── */

const ChatInner = ({ sessionId }: { sessionId: string }) => {
  const [input, setInput] = useState("");
  const [messagesLoading, setMessagesLoading] = useState(true);
  const tk = localStorage.getItem("auth_token") ?? "";

  const { messages, status, setMessages, sendMessage, stop, error, clearError } = useChat(
    {
      transport: new DefaultChatTransport({
        api: "/api/chat",
        body: { sessionId },
        headers: { "x-auth-token": tk },
      }),
    }
  );

  useEffect(() => {
    setMessagesLoading(true);
    fetch(`/api/messages?sessionId=${sessionId}`, { headers: { "x-auth-token": tk } })
      .then((r) => r.json())
      .then((d) => {
        if (d.messages?.length)
          setMessages(
            d.messages.map((m: Record<string, unknown>) => ({
              id: m.id,
              role: m.role,
              parts: [{ type: "text", text: m.content }],
            }))
          );
      })
      .catch(() => {})
      .finally(() => setMessagesLoading(false));
  }, [sessionId, setMessages, tk]);

  const send = useCallback(
    (text: string) => {
      if (!text.trim() || status !== "ready") return;
      sendMessage({ text: text.trim() });
      setInput("");
    },
    [status, sendMessage]
  );

  const onInputSubmit = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault();
      send(input);
    },
    [input, send]
  );
  const onKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send(input);
      }
    },
    [input, send]
  );

  const streaming = status === "submitted" || status === "streaming";
  const hasMsgs = messages.length > 0;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ backgroundColor: "var(--color-canvas)" }}
    >
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-end px-4">
        {streaming && (
          <button
            type="button"
            onClick={stop}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:opacity-70"
            style={{ color: "var(--color-muted)" }}
          >
            <Square className="h-3.5 w-3.5" /> 중지
          </button>
        )}
      </header>

      {/* Error alert */}
      {error && (
        <div
          className="mx-auto mb-2 flex max-w-[720px] items-center justify-between rounded-md border px-4 py-2 text-sm"
          style={{
            borderColor: "var(--color-error)",
            backgroundColor: "var(--color-canvas-soft)",
            color: "var(--color-error)",
          }}
        >
          <span>{error.message}</span>
          <button
            type="button"
            onClick={clearError}
            className="ml-2 shrink-0 leading-none hover:opacity-70"
          >
            ✕
          </button>
        </div>
      )}

      {/* Messages */}
      {messagesLoading ? (
        <ChatLoading />
      ) : hasMsgs || streaming ? (
        <MessageScrollerProvider autoScroll>
          <MessageScroller className="flex-1">
            <MessageScrollerViewport>
              <MessageScrollerContent className="mx-auto max-w-[720px] px-4">
                {messages.map((m) => (
                  <MessageScrollerItem
                    key={m.id}
                    messageId={m.id}
                    scrollAnchor={m.role === "user"}
                  >
                    <MessageItem message={m} />
                  </MessageScrollerItem>
                ))}
                {streaming && (
                  <div
                    className="px-3 py-2 text-sm"
                    style={{ color: "var(--color-muted)" }}
                  >
                    생각 중이에요…♪
                  </div>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton variant="outline" />
          </MessageScroller>
        </MessageScrollerProvider>
      ) : (
        <div className="flex flex-1 flex-col items-center">
          <EmptyState />
        </div>
      )}

      {/* Input area */}
      {!messagesLoading && (
      <div className="shrink-0 px-4 pb-6">
        <div className="mx-auto max-w-[720px]">
          <form
            onSubmit={onInputSubmit}
            className="relative flex flex-col rounded-2xl border"
            style={{
              borderColor: "var(--color-hairline)",
              backgroundColor: "var(--color-canvas-soft)",
            }}
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="어디로 함께 떠나볼까요…?"
              disabled={streaming}
              rows={1}
              className="min-h-[52px] max-h-32 resize-none rounded-2xl border-0 bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-relaxed text-[--color-ink] placeholder:text-[--color-muted-soft] focus:outline-none focus-visible:ring-0"
            />
            {/* Toolbar-style bottom bar */}
            <div className="flex items-center justify-between px-2 pb-2">
              <div className="flex items-center gap-1">
                <RotatingPhrase />
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="submit"
                  disabled={streaming || !input.trim()}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
                  style={{
                    backgroundColor:
                      streaming || !input.trim()
                        ? "var(--color-hairline)"
                        : "var(--color-primary)",
                    color: streaming || !input.trim() ? "var(--color-muted)" : "#fff",
                  }}
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </form>

          {/* Suggestion chips — BELOW input (Claude.ai pattern) */}
          {!hasMsgs && (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-3">
              <SuggestionChip icon="🌸" label="데이트 코스 추천" onClick={() => send("춘천에서 원찬님 예은님 데이트 코스 추천해줘…!")} />
              <SuggestionChip icon="🗺️" label="춘천 여행 일정" onClick={() => send("춘천 1박 2일 여행 일정 짜줘…!")} />
              <SuggestionChip icon="🍽️" label="맛집 찾기" onClick={() => send("춘천 근처 분위기 좋은 맛집 알려줘…!")} />
              <SuggestionChip icon="💝" label="체크리스트" onClick={() => send("둘이 함께 여행 준비물 체크리스트 알려줘…!")} />
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
};

/* ── Suggestion Chip ── */

const SuggestionChip = ({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors"
    style={{
      borderColor: "var(--color-hairline)",
      backgroundColor: "var(--color-surface)",
      color: "var(--color-body)",
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.backgroundColor = "var(--color-canvas-soft)";
      e.currentTarget.style.color = "var(--color-ink)";
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.backgroundColor = "var(--color-surface)";
      e.currentTarget.style.color = "var(--color-body)";
    }}
  >
    <span className="text-sm leading-none">{icon}</span>
    {label}
  </button>
);

/* ── Chat Loading ── */

const loadingPhrases = [
  "잠시만 기다려줘…!",
  "준비 중이야…♪",
  "거의 다 왔어…!",
  "데이터 불러오는 중…♪",
  "원찬님 예은님… 기다려줘…!",
  "좋은 정보 찾는 중…♪",
  "잠깐만…! 곧 갈게…!",
];

const ChatLoading = () => (
  <div className="flex flex-1 flex-col items-center justify-center gap-4">
    <img
      src="/munjackgui.webp"
      alt="치이카와"
      className="size-20 animate-bounce rounded-full object-cover"
      style={{ backgroundColor: "var(--color-canvas-soft)" }}
    />
    <p className="text-sm" style={{ color: "var(--color-muted)" }}>
      {loadingPhrases[Math.floor(Math.random() * loadingPhrases.length)]}
    </p>
  </div>
);

/* ── Rotating Phrase Badge ── */

const phrases = [
  "힘내자…!",
  "같이 가자…!",
  "야호…!",
  "좋아…♪",
  "원찬니임…!",
  "예은니임…!",
  "여행 가쟈…!",
  "맛난 거 먹쟈…!",
  "무섭지 않아…!",
  "둘이 함께…!",
  "즐거워…♪",
  "괜찮아…!",
  "행복해…!",
  "내가 도와줄게…!",
  "잘 될 거야…!",
];

const RotatingPhrase = () => {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => {
      setIdx((p) => (p + 1) % phrases.length);
    }, 3000);
    return () => clearInterval(iv);
  }, []);

  return (
    <span className="flex items-center gap-1.5 text-[12px] font-medium transition-opacity duration-300" style={{ color: "var(--color-muted)" }}>
      <img
        src="/munjackgui.webp"
        alt="치이카와"
        className="size-5 rounded-full object-cover"
      />
      {phrases[idx]}
    </span>
  );
};

/* ── Empty State ── */

const subPhrases = [
  "뭔가 작고 귀여운 제가… 둘만의 여행을 도와드릴게요…♪",
  "어떻게든 되겠지…!!",
  "서두르지 않아도 괜찮아…!",
  "추억은… 계속… 남는 거야…!",
  "몇 번이라도… 계속 응원할게…!!",
  "괜찮아, 항상 어떻게든 됐잖아…!!",
  "그거 완전 최고잖아…!!",
  "둘이 함께라면… 뭐든 즐거워…♪",
  "안 될 것 같으면… 그만둬도 되는 거야…!",
  "알아… 지칠 때도 있는 거지…",
  "원찬님 예은님이라면… 분명 행복할 거야…!",
  "오늘도 둘이서 즐겁게…♪",
];

const EmptyState = () => {
  const [subIdx, setSubIdx] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setSubIdx((p) => (p + 1) % subPhrases.length), 3000);
    return () => clearInterval(iv);
  }, []);
  return (
  <div className="flex flex-col items-center gap-1 pt-32 pb-4">
    {/* Character icon */}
    <div className="mb-5">
      <img
        src="/munjackgui.webp"
        alt="치이카와"
        className="size-16 rounded-full object-cover"
        style={{ backgroundColor: "var(--color-canvas-soft)" }}
      />
    </div>
    <h1
      className="text-[22px] font-normal leading-snug"
      style={{ color: "var(--color-ink)" }}
    >
      원찬<span style={{ color: "var(--color-muted)" }}>님…!</span>{" "}
      예은<span style={{ color: "var(--color-muted)" }}>님…!</span>
    </h1>
    <p className="text-[15px] transition-opacity duration-300" style={{ color: "var(--color-muted)" }}>
      {subPhrases[subIdx]}
    </p>
  </div>
  );
};
