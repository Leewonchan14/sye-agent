"use client";

import { PanelLeft, Send, Square } from "lucide-react";

import { useCallback, useEffect, useRef, useState } from "react";

import { useChat } from "@ai-sdk/react";

import { DefaultChatTransport } from "ai";

import { ExampleQuestions } from "@/components/example-questions";
import { MessageItem } from "@/components/message";
import { PasswordGate } from "@/components/password-gate";
import { SessionSidebar } from "@/components/session-sidebar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// === Top-level: ChatShell ===

export const ChatShell = () => {
  const [isAuthed, setIsAuthed] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
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
      <ChatInner
        key={sessionId}
        sessionId={sessionId}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
      />
    </div>
  );
};

// === Inner: ChatInner ===

const ChatInner = ({
  sessionId,
  sidebarOpen,
  onToggleSidebar,
}: {
  sessionId: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) => {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const authToken = localStorage.getItem("auth_token") ?? "";

  const { messages, status, setMessages, sendMessage, stop } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { sessionId },
      headers: { "x-auth-token": authToken },
    }),
  });

  // Load history
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

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
      {/* Header */}
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4">
        <div className="flex items-center gap-2">
          {!sidebarOpen && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors"
              aria-label="Open sidebar"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          )}
        </div>
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scroll-smooth">
        <div className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 py-8">
          {!hasMessages && !isStreaming && <EmptyState onSend={handleSend} />}

          {messages.map((msg) => (
            <MessageItem key={msg.id} message={msg} />
          ))}

          {isStreaming && (
            <div className="flex items-center gap-1.5 px-1">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary/60" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary/60 [animation-delay:0.2s]" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary/60 [animation-delay:0.4s]" />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="sticky bottom-0 bg-background pb-2 pt-4">
        <div className="mx-auto max-w-[720px] px-4">
          <form
            onSubmit={handleFormSubmit}
            className="relative flex flex-col rounded-xl border bg-card shadow-sm"
          >
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="오늘 어떤 도움을 드릴까요?"
              disabled={isStreaming}
              rows={1}
              className="min-h-11 max-h-32 resize-none rounded-xl border-0 bg-transparent p-4 pb-12 focus:outline-none focus:ring-0"
            />
            <div className="flex items-center justify-between px-3 pb-3">
              <div className="flex items-center gap-1" />
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

// === Empty State ===

const EmptyState = ({ onSend }: { onSend: (text: string) => void }) => (
  <div className="flex flex-col items-center gap-2 pt-24 pb-8">
    {/* Decorative icon */}
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      className="mb-4 text-warm-accent"
    >
      <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="12" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="4" fill="currentColor" />
      <line
        x1="24"
        y1="4"
        x2="24"
        y2="8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="24"
        y1="40"
        x2="24"
        y2="44"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="4"
        y1="24"
        x2="8"
        y2="24"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="40"
        y1="24"
        x2="44"
        y2="24"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>

    <h1 className="text-center">
      <span className="text-2xl font-medium text-foreground">WonChan</span>
      <span className="ml-2 text-base text-muted-foreground">님,</span>
    </h1>
    <p className="text-base text-muted-foreground">다시 돌아왔군요</p>

    <div className="mt-8 w-full">
      <ExampleQuestions onQuestionClick={onSend} />
    </div>
  </div>
);
