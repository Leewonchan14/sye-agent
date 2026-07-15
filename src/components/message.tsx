"use client";

import { Check, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { useCallback, useState } from "react";

import type { UIMessage } from "@ai-sdk/react";

import { ToolCallCard } from "@/components/tool-call-card";

export const MessageItem = ({ message }: { message: UIMessage }) => {
  const isUser = message.role === "user";

  if (!message.parts || message.parts.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 py-1.5">
      {message.parts.map((part, idx) => {
        switch (part.type) {
          case "text": {
            if (!part.text) return null;
            return isUser ? (
              <UserBubble key={idx} text={part.text} />
            ) : (
              <AssistantMessage key={idx} text={part.text} />
            );
          }
          case "reasoning": {
            if (!part.text) return null;
            return (
              <ReasoningBubble key={idx} text={part.text} />
            );
          }
          default: {
            const t = part as Record<string, unknown>;
            if (t.type === "dynamic-tool" || String(t.type).startsWith("tool-")) {
              return (
                <ToolCallCard
                  key={(t.toolCallId as string) ?? idx}
                  toolName={
                    t.type === "dynamic-tool"
                      ? (t.toolName as string)
                      : String(t.type).slice(5)
                  }
                  state={t.state as string}
                  input={t.input}
                  output={t.output}
                  errorText={t.errorText as string}
                  title={t.title as string}
                />
              );
            }
            return null;
          }
        }
      })}
    </div>
  );
};

// === User bubble — DESIGN.md §6.4 ===

const UserBubble = ({ text }: { text: string }) => (
  <div className="flex justify-end">
    <div
      className="max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] leading-relaxed text-[--color-ink]"
      style={{ backgroundColor: "var(--color-canvas-card)" }}
    >
      {text}
    </div>
  </div>
);

// === Assistant message — Chiikawa character bubble ===

// === Reasoning bubble — Chiikawa thinking aloud ===

const ReasoningBubble = ({ text }: { text: string }) => (
  <div className="flex items-start gap-3">
    <img
      src="/munjackgui-thinking.png"
      alt="thinking"
      className="size-8 shrink-0 rounded-full object-cover opacity-80"
      style={{ backgroundColor: "var(--color-canvas-soft)" }}
    />
    <div
      className="min-w-0 flex-1 rounded-lg px-3 py-2 text-[14px] leading-relaxed"
      style={{
        backgroundColor: "var(--color-canvas-soft)",
        color: "var(--color-muted)",
      }}
    >
      {text}
    </div>
  </div>
);

// === Assistant message — Chiikawa character bubble ===

const AssistantMessage = ({ text }: { text: string }) => (
  <div className="flex items-start gap-3">
    {/* Character avatar */}
    <img
      src="/munjackgui.webp"
      alt="치이카와"
      className="size-8 shrink-0 rounded-full object-cover"
      style={{ backgroundColor: "var(--color-canvas-soft)" }}
    />
    <div className="min-w-0 flex-1 pt-1 text-[16px] leading-relaxed text-[--color-ink]">
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        code({ className, children }) {
          const match = /language-(\w+)/.exec(className ?? "");
          const isInline = !match && !className;
          const codeStr = String(children).replace(/\n$/, "");
          if (isInline) {
            return (
              <code
                className="rounded px-1.5 py-0.5 font-mono text-sm"
                style={{
                  backgroundColor: "var(--color-canvas-soft)",
                  color: "var(--color-ink)",
                }}
              >
                {children}
              </code>
            );
          }
          return <CodeBlock language={match?.[1]} code={codeStr} />;
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: "var(--color-primary)" }}
            >
              {children}
            </a>
          );
        },
        table({ children }) {
          return (
            <div className="my-3 overflow-x-auto rounded-lg border" style={{ borderColor: "var(--color-hairline)" }}>
              <table className="min-w-full text-sm">{children}</table>
            </div>
          );
        },
        thead({ children }) {
          return (
            <thead style={{ borderBottom: `2px solid var(--color-hairline)` }}>
              {children}
            </thead>
          );
        },
        tbody({ children }) {
          return <tbody>{children}</tbody>;
        },
        tr({ children }) {
          return (
            <tr style={{ borderBottom: `1px solid var(--color-hairline-soft)` }}>
              {children}
            </tr>
          );
        },
        th({ children }) {
          return (
            <th
              className="px-3 py-2 text-left text-xs font-medium"
              style={{ color: "var(--color-muted)" }}
            >
              {children}
            </th>
          );
        },
        td({ children }) {
          return (
            <td className="px-3 py-2" style={{ color: "var(--color-ink)" }}>
              {children}
            </td>
          );
        },
        hr() {
          return (
            <hr className="my-4" style={{ borderColor: "var(--color-hairline)" }} />
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
    </div>
  </div>
);

// === Code block — DESIGN.md §6.8 dark theme ===

interface CodeBlockProps {
  code: string;
  language?: string;
}

const CodeBlock = ({ code, language }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <div
      className="relative mt-3 overflow-hidden rounded-lg"
      style={{ backgroundColor: "var(--color-dark)" }}
    >
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-xs" style={{ color: "var(--color-on-dark-soft)" }}>
          {language ?? "code"}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="flex items-center gap-1 text-xs transition-colors"
          style={{ color: "var(--color-on-dark-soft)" }}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> 복사됨
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> 복사
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 pb-4 font-mono text-sm leading-relaxed">
        <code style={{ color: "var(--color-on-dark)" }}>{code}</code>
      </pre>
    </div>
  );
};
