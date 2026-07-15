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
      <ChatInner key={sid} sessionId={sid} />
    </div>
  );
};

/* ── ChatInner ── */

const ChatInner = ({ sessionId }: { sessionId: string }) => {
  const [input, setInput] = useState("");
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
      .catch(() => {});
  }, [sessionId, setMessages, tk]);

  const send = useCallback(
    (text: string) => {
      if (!text.trim() || status !== "ready") return;
      sendMessage({ text: text.trim() });
      setInput("");
    },
    [status, sendMessage]
  );

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
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
      className="flex flex-1 flex-col"
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
      {hasMsgs || streaming ? (
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
                    className="shimmer px-3 py-2 text-sm"
                    style={{ color: "var(--color-muted)" }}
                  >
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
          <EmptyState onSend={send} />
        </div>
      )}

      {/* Input — DESIGN.md §6.6 */}
      <div
        className="shrink-0 px-4 pb-4 pt-2"
        style={{ borderTop: "1px solid var(--color-hairline-soft)" }}
      >
        <div className="mx-auto max-w-[720px]">
          <form
            onSubmit={onSubmit}
            className="relative flex flex-col rounded-xl border"
            style={{
              borderColor: "var(--color-hairline)",
              backgroundColor: "var(--color-surface)",
            }}
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="오늘 어떤 도움을 드릴까요?"
              disabled={streaming}
              rows={1}
              className="min-h-11 max-h-32 resize-none rounded-xl border-0 bg-transparent p-4 pb-12 focus:outline-none focus-visible:ring-0 focus-visible:border-transparent"
              style={{ color: "var(--color-ink)" }}
            />
            <div className="flex items-center justify-end px-3 pb-3">
              <button
                type="submit"
                disabled={streaming || !input.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors"
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
          </form>
        </div>
      </div>
    </div>
  );
};

/* ── Empty State ── */

const EmptyState = ({ onSend }: { onSend: (text: string) => void }) => (
  <div className="flex flex-col items-center gap-1 pt-32 pb-8">
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      className="mb-6"
      style={{ color: "var(--color-primary)" }}
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
    <h1 className="text-2xl font-medium" style={{ color: "var(--color-ink)" }}>
      WonChan<span style={{ color: "var(--color-muted)" }}>님,</span>
    </h1>
    <p className="text-base" style={{ color: "var(--color-muted)" }}>
      다시 돌아왔군요
    </p>
    <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
      {["작성하기", "학습하기", "코드", "일상"].map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onSend(q)}
          className="rounded-full border px-4 py-1.5 text-sm transition-colors"
          style={{
            borderColor: "var(--color-hairline)",
            backgroundColor: "var(--color-surface)",
            color: "var(--color-muted)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-canvas-soft)";
            e.currentTarget.style.color = "var(--color-ink)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-surface)";
            e.currentTarget.style.color = "var(--color-muted)";
          }}
        >
          {q}
        </button>
      ))}
    </div>
  </div>
);
