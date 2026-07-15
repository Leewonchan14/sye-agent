"use client";

import { Send, Square } from "lucide-react";

import { useCallback, useEffect, useState } from "react";

import { useChat } from "@ai-sdk/react";

import { DefaultChatTransport } from "ai";

import { MessageItem } from "@/components/message";
import { PasswordGate } from "@/components/password-gate";
import { SessionSidebar } from "@/components/session-sidebar";
import { Button } from "@/components/ui/button";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Textarea } from "@/components/ui/textarea";

// === ChatShell — top-level gate ===

export const ChatShell = () => {
  const [isAuthed, setIsAuthed] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setIsAuthed(localStorage.getItem("auth_0411") === "true");
    let sid = localStorage.getItem("sessionId");
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem("sessionId", sid);
    }
    setSessionId(sid);
    setMounted(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const handleNewChat = useCallback(() => {
    const newSid = crypto.randomUUID();
    localStorage.setItem("sessionId", newSid);
    setSessionId(newSid);
  }, []);

  const handleSelectSession = useCallback((id: string) => {
    localStorage.setItem("sessionId", id);
    setSessionId(id);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" />
    );
  }

  if (!isAuthed) {
    return <PasswordGate onSuccess={() => setIsAuthed(true)} />;
  }

  return (
    <div className="flex h-screen flex-row bg-background">
      <SessionSidebar
        activeSessionId={sessionId}
        onSelect={handleSelectSession}
        onNew={handleNewChat}
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
      />
      <ChatInner key={sessionId} sessionId={sessionId} />
    </div>
  );
};

// === ChatInner — messages + input ===

const ChatInner = ({ sessionId }: { sessionId: string }) => {
  const [input, setInput] = useState("");
  const authToken = localStorage.getItem("auth_token") ?? "";

  const { messages, status, setMessages, sendMessage, stop, error, clearError } = useChat(
    {
      transport: new DefaultChatTransport({
        api: "/api/chat",
        body: { sessionId },
        headers: { "x-auth-token": authToken },
      }),
    }
  );

  // Load history on mount
  useEffect(() => {
    fetch(`/api/messages?sessionId=${sessionId}`, {
      headers: { "x-auth-token": authToken },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.messages?.length > 0) {
          const uiMessages = data.messages.map((m: Record<string, unknown>) => ({
            id: m.id as string,
            role: m.role as string,
            parts: [{ type: "text", text: m.content as string }],
          }));
          setMessages(uiMessages);
        }
      })
      .catch(() => {});
  }, [sessionId, setMessages, authToken]);

  const handleSend = useCallback(
    (text: string) => {
      if (!text.trim() || status !== "ready") return;
      sendMessage({ text: text.trim() });
      setInput("");
    },
    [status, sendMessage]
  );

  const handleFormSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      handleSend(input);
    },
    [input, handleSend]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend(input);
      }
    },
    [input, handleSend]
  );

  const isStreaming = status === "submitted" || status === "streaming";
  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-1 flex-col bg-background">
      {/* Header — whitespace only, no border */}
      <header className="flex h-14 shrink-0 items-center justify-end px-4">
        {isStreaming && (
          <Button
            variant="ghost"
            size="sm"
            onClick={stop}
            className="gap-1.5 text-xs text-muted-foreground"
          >
            <Square className="h-3.5 w-3.5" />
            중지
          </Button>
        )}
      </header>

      {/* Error alert */}
      {error && (
        <div className="mx-auto mb-2 flex max-w-[720px] items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          <span>{error.message}</span>
          <button
            type="button"
            onClick={clearError}
            className="ml-2 shrink-0 leading-none text-destructive/70 hover:text-destructive"
          >
            ✕
          </button>
        </div>
      )}

      {/* Messages — shadcn MessageScroller composition */}
      {hasMessages || isStreaming ? (
        <MessageScrollerProvider autoScroll>
          <MessageScroller className="flex-1">
            <MessageScrollerViewport>
              <MessageScrollerContent className="mx-auto max-w-[720px] px-4">
                {messages.map((msg) => (
                  <MessageScrollerItem
                    key={msg.id}
                    messageId={msg.id}
                    scrollAnchor={msg.role === "user"}
                  >
                    <MessageItem message={msg} />
                  </MessageScrollerItem>
                ))}

                {/* Streaming shimmer */}
                {isStreaming && (
                  <div className="shimmer px-3 py-2 text-sm text-muted-foreground">
                    생각 중...
                  </div>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <EmptyState onSend={handleSend} />
        </div>
      )}

      {/* Input area — DESIGN.md §8: borderless inside card */}
      <div className="shrink-0 px-4 pb-4 pt-2">
        <div className="mx-auto max-w-[720px]">
          <form
            onSubmit={handleFormSubmit}
            className="relative flex flex-col rounded-xl border bg-card shadow-sm"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="오늘 어떤 도움을 드릴까요?"
              disabled={isStreaming}
              rows={1}
              className="min-h-11 max-h-32 resize-none rounded-xl border-0 bg-transparent p-4 pb-12 focus:outline-none focus-visible:ring-0 focus-visible:border-transparent"
            />
            <div className="flex items-center justify-end px-3 pb-3">
              <Button
                type="submit"
                size="icon"
                disabled={isStreaming || !input.trim()}
                className="h-8 w-8 shrink-0 rounded-md"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// === Empty State — Claude.ai greeting style ===

const EmptyState = ({ onSend }: { onSend: (text: string) => void }) => (
  <div className="flex flex-col items-center gap-1 pt-32 pb-8">
    {/* Decorative icon — terracotta warm accent */}
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      className="mb-6 text-warm-accent"
    >
      <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="20" cy="20" r="10" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="20" cy="20" r="3" fill="currentColor" />
      <line
        x1="20"
        y1="2"
        x2="20"
        y2="6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <line
        x1="20"
        y1="34"
        x2="20"
        y2="38"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <line
        x1="2"
        y1="20"
        x2="6"
        y2="20"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <line
        x1="34"
        y1="20"
        x2="38"
        y2="20"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>

    <h1 className="text-2xl font-medium text-foreground">
      WonChan<span className="text-muted-foreground">님,</span>
    </h1>
    <p className="text-base text-muted-foreground">다시 돌아왔군요</p>

    {/* Suggestion chips — DESIGN.md §8 badge style */}
    <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
      {["작성하기", "학습하기", "코드", "일상"].map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onSend(q)}
          className="rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {q}
        </button>
      ))}
    </div>
  </div>
);
