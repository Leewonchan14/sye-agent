"use client";

import { useQuery } from "@tanstack/react-query";
import { sample } from "lodash";
import { LogOut, Menu } from "lucide-react";
import useLocalStorageState from "use-local-storage-state";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { useChat } from "@ai-sdk/react";

import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";

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
import { PasswordGate } from "@/components/password-gate";
import { SessionSidebar } from "@/components/session-sidebar";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { useAuthStore } from "@/lib/auth-store";

/* ── ChatShell ── */

export const ChatShell = ({ sessionId: initialSessionId }: { sessionId?: string }) => {
  const router = useRouter();
  const [sessionId, setSessionId] = useState(
    () => initialSessionId ?? crypto.randomUUID()
  );
  const [sidebarOpen, setSidebarOpen] = useLocalStorageState("sidebar_open", {
    defaultValue: false,
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);

  const {
    data: isValid,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["auth-validate", token ?? ""],
    queryFn: async () => {
      if (!token) return await new Promise((res) => setTimeout(() => res(false), 3000));
      const res = await fetch("/api/auth", {
        headers: { "x-auth-token": token },
      });
      const d = await res.json();
      return d.valid === true;
    },
    enabled: !!token,
    retry: 1,
    staleTime: 0,
  });

  const onNew = useCallback(() => {
    setSessionId(crypto.randomUUID());
    router.push("/");
  }, [router]);

  const onSelect = useCallback(
    (id: string) => {
      router.push(`/${id}`);
    },
    [router]
  );

  const toggle = useCallback(() => setSidebarOpen((p) => !p), []);

  // Loading: token present but validation pending
  if (isLoading) {
    return (
      <div
        className="flex min-h-dvh flex-col"
        style={{ backgroundColor: "var(--color-canvas)" }}
      >
        <ChatLoading />
      </div>
    );
  }

  // Not authenticated: no token, invalid token, or query error
  if (!token || isValid === false || isError) {
    return <PasswordGate onSuccess={() => {}} />;
  }

  return (
    <div
      className="flex h-dvh flex-col md:flex-row relative"
      style={{ backgroundColor: "var(--color-canvas)" }}
    >
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <SessionSidebar
          activeSessionId={sessionId}
          onSelect={onSelect}
          onNew={onNew}
          isOpen={sidebarOpen}
          onToggle={toggle}
        />
      </div>

      {/* Mobile top bar */}
      <div
        className="md:hidden flex items-center gap-2 px-3 h-12 shrink-0"
        style={{ borderBottom: "1px solid var(--color-hairline)" }}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <Avatar size="sm">
          <AvatarImage src="/munjackgui.png" alt="치이카와" />
        </Avatar>
        <span
          className="flex-1 text-sm font-medium"
          style={{ color: "var(--color-ink)" }}
        >
          치이카와 데이트 메이트
        </span>
        <Button variant="ghost" size="icon" onClick={logout} aria-label="Logout">
          <LogOut className="h-5 w-5" />
        </Button>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative h-full w-64">
            <SessionSidebar
              activeSessionId={sessionId}
              onSelect={(id) => {
                onSelect(id);
                setMobileMenuOpen(false);
              }}
              onNew={() => {
                onNew();
                setMobileMenuOpen(false);
              }}
              isOpen={true}
              onToggle={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ChatInner key={sessionId} sessionId={sessionId} />
      </div>
    </div>
  );
};

/* ── ChatInner ── */

const ChatInner = ({ sessionId }: { sessionId: string }) => {
  const tk = useAuthStore((s) => s.token);

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
  } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { sessionId },
      headers: { "x-auth-token": tk },
    }),
    onFinish: ({ messages: allMessages }) => {
      // Save complete session state from frontend
      fetch("/api/messages/session-state", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-auth-token": tk,
        },
        body: JSON.stringify({ sessionId, messages: allMessages }),
      }).catch((err) =>
        console.error("Failed to save session state from frontend:", err)
      );
    },
  });

  // Load saved messages into useChat once query resolves
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      setMessages(initialMessages as Parameters<typeof setMessages>[0]);
    }
  }, [initialMessages, setMessages]);

  const [showHearts, setShowHearts] = useState(false);

  const handlePromptSubmit = useCallback(
    (message: { text: string }) => {
      if (!message.text.trim() || status !== "ready") return;
      const trimmed = message.text.trim();

      // "사랑해" easter egg — trigger hearts
      if (trimmed.includes("사랑해") || trimmed.includes("좋아해")) {
        setShowHearts(true);
      }

      sendMessage({ text: trimmed });
    },
    [status, sendMessage]
  );

  const handleQuestionClick = useCallback(
    (text: string) => {
      if (status === "ready") sendMessage({ text });
    },
    [status, sendMessage]
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

  const streaming = status === "submitted" || status === "streaming";
  const hasMsgs = messages.length > 0;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={{ backgroundColor: "var(--color-canvas)" }}
    >
      <HeartsOverlay show={showHearts} onDone={() => setShowHearts(false)} />

      {/* Error alert */}
      {error && (
        <div
          className="mx-auto mb-2 flex max-w-180 items-center justify-between rounded-md border px-4 py-2 text-sm"
          style={{
            borderColor: "var(--color-error)",
            backgroundColor: "var(--color-canvas-soft)",
            color: "var(--color-error)",
          }}
        >
          <span>{error.message}</span>
          <Button variant="ghost" size="icon-xs" onClick={clearError} className="ml-2">
            ✕
          </Button>
        </div>
      )}

      {/* Messages */}
      {showLoading ? (
        <ChatLoading />
      ) : hasMsgs || streaming ? (
        <MessageScrollerProvider autoScroll>
          <MessageScroller className="flex-1">
            <MessageScrollerViewport>
              <MessageScrollerContent className="mx-auto max-w-180 px-4">
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
          <EmptyState onQuestionClick={handleQuestionClick} />
        </div>
      )}

      {/* Input area */}
      {!showLoading && (
        <div className="shrink-0 px-4 pb-6">
          <div className="mx-auto max-w-180">
            <PromptInput
              onSubmit={handlePromptSubmit}
              className="relative flex flex-col border rounded-2xl **:data-[slot=input-group]:focus-within:border **:data-[slot=input-group]:focus-within:ring-0"
              style={{
                borderColor: "var(--color-hairline)",
                backgroundColor: "var(--color-canvas-soft)",
              }}
            >
              <PromptInputBody>
                <PromptInputTextarea
                  placeholder="어디로 데이트하러 갈까요…?"
                  disabled={streaming}
                  className="min-h-13 max-h-32 resize-none border-0 bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-relaxed text-[--color-ink] placeholder:text-[--color-muted-soft] focus:outline-none focus-visible:ring-0"
                />
              </PromptInputBody>
              <PromptInputFooter>
                <PromptInputTools>
                  <RotatingPhrase />
                </PromptInputTools>
                <PromptInputSubmit status={status} onStop={stop} />
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
        alt="치이카와"
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
        alt="치이카와"
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
  const hour = new Date().getHours();
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
    <div className="flex flex-col h-full justify-center items-center gap-1">
      {/* Character icon */}
      <div className="mb-5">
        <img
          src="/munjackgui.png"
          alt="치이카와"
          className="size-16 rounded-full object-cover"
          style={{ backgroundColor: "var(--color-canvas-soft)" }}
          draggable={false}
        />
      </div>
      <h1
        className="text-[22px] font-normal leading-snug"
        style={{ color: "var(--color-ink)" }}
      >
        예은
        <span style={{ color: "var(--color-muted)" }}>님…!</span>
      </h1>
      <p className="text-[15px] animate-fade-in" style={{ color: "var(--color-ink)" }}>
        {timeGreeting}
      </p>
      <p
        key={fadeKey}
        className="text-[13px] mt-1 animate-bounce-fade-in"
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
