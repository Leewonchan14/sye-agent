"use client";

import { Cloud, MapPin, Plus, Send } from "lucide-react";

import { useCallback, useEffect, useRef, useState } from "react";

import { useChat } from "@ai-sdk/react";

import { DefaultChatTransport } from "ai";

import { ExampleQuestions } from "@/components/example-questions";
import { MessageItem } from "@/components/message";
import { PasswordGate } from "@/components/password-gate";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const ChatInner = ({
  sessionId,
  onNewChat,
}: {
  sessionId: string;
  onNewChat: () => void;
}) => {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const authToken = localStorage.getItem("auth_token") ?? "";

  const { messages, status, setMessages, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { sessionId },
      headers: { "x-auth-token": authToken },
    }),
  });

  // Load history on mount
  useEffect(() => {
    fetch(`/api/messages?sessionId=${sessionId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.messages?.length > 0) {
          const uiMessages = data.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            parts: [{ type: "text", text: m.content } as const],
          }));
          setMessages(uiMessages);
        }
      })
      .catch(() => {});
  }, [sessionId, setMessages]);

  // Auto-scroll to bottom
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

  const handleQuestionClick = useCallback(
    (question: string) => {
      handleSend(question);
    },
    [handleSend]
  );

  const handleFormSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      handleSend(input);
    },
    [input, handleSend]
  );

  const handleTextareaKeyDown = useCallback(
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
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-primary">
          <Cloud className="h-6 w-6" />
          <MapPin className="h-5 w-5" />
          <span className="ml-1 text-base font-semibold text-foreground">
            트래블 에이전트
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onNewChat}
          disabled={isStreaming}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />새 채팅
        </Button>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-[720px] space-y-6">
          {!hasMessages && !isStreaming && (
            <>
              <div className="flex flex-col items-center gap-3 pt-16 pb-8">
                <div className="flex items-center gap-1 text-primary">
                  <Cloud className="h-10 w-10" />
                  <MapPin className="h-8 w-8" />
                </div>
                <h2 className="text-xl font-semibold text-foreground">트래블 에이전트</h2>
                <p className="text-sm text-muted-foreground">춘천 여행을 도와드릴게요!</p>
              </div>

              <ExampleQuestions onQuestionClick={handleQuestionClick} />
            </>
          )}

          {messages.map((msg) => (
            <MessageItem key={msg.id} message={msg} />
          ))}

          {isStreaming && messages[messages.length - 1]?.role === "user" && (
            <div className="flex gap-3">
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-4 py-3">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary/60" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary/60 [animation-delay:0.2s]" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary/60 [animation-delay:0.4s]" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="sticky bottom-0 border-t bg-background p-4">
        <form
          onSubmit={handleFormSubmit}
          className="mx-auto flex max-w-[720px] items-end gap-3"
        >
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder="메시지를 입력해주세요..."
            disabled={isStreaming}
            rows={1}
            className="min-h-11 resize-none rounded-xl border p-3 focus:outline-none focus:ring-2"
          />
          <Button
            type="submit"
            size="icon"
            disabled={isStreaming || !input.trim()}
            className="h-11 w-11 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
};

export const ChatShell = () => {
  const [isAuthed, setIsAuthed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string>("");

  useEffect(() => {
    const authed = localStorage.getItem("auth_0411") === "true";
    setIsAuthed(authed);

    let sid = localStorage.getItem("sessionId");
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem("sessionId", sid);
    }
    setSessionId(sid);
    setIsLoading(false);
  }, []);

  const handleNewChat = useCallback(() => {
    const newSid = crypto.randomUUID();
    localStorage.setItem("sessionId", newSid);
    setSessionId(newSid);
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
      </div>
    );
  }

  if (!isAuthed) {
    return <PasswordGate onSuccess={() => setIsAuthed(true)} />;
  }

  return <ChatInner key={sessionId} sessionId={sessionId} onNewChat={handleNewChat} />;
};
