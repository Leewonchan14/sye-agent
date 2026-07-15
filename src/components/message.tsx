"use client";

import { Check, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useCallback, useState } from "react";

import type { UIMessage } from "@ai-sdk/react";

import { ToolCallCard } from "@/components/tool-call-card";

export const MessageItem = ({ message }: { message: UIMessage }) => {
  const isUser = message.role === "user";

  if (!message.parts || message.parts.length === 0) return null;

  return (
    <div className="space-y-3">
      {message.parts.map((part, index) => {
        switch (part.type) {
          case "text": {
            const text = part.text;
            if (!text) return null;
            return isUser ? (
              <UserBubble key={index} content={text} />
            ) : (
              <AssistantMessage key={index} content={text} />
            );
          }
          case "reasoning": {
            if (!part.text) return null;
            return (
              <details key={index} className="rounded-md border bg-muted/30">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
                  Reasoning
                </summary>
                <div className="border-t px-3 py-2 text-xs text-muted-foreground italic">
                  {part.text}
                </div>
              </details>
            );
          }
          // Handle tool-{name} parts
          default: {
            // Check if this is a tool-* typed part
            const type = part.type;
            if (type.startsWith("tool-") && "toolCallId" in part) {
              const toolPart = part as typeof part & {
                toolCallId: string;
                state: string;
                title?: string;
                input?: unknown;
                output?: unknown;
                errorText?: string;
              };
              return (
                <ToolCallCard
                  key={toolPart.toolCallId ?? index}
                  toolName={type.slice(5)}
                  state={toolPart.state}
                  input={"input" in toolPart ? toolPart.input : undefined}
                  output={"output" in toolPart ? toolPart.output : undefined}
                  errorText={"errorText" in toolPart ? toolPart.errorText : undefined}
                  title={toolPart.title}
                />
              );
            }
            // Handle dynamic-tool parts
            if (type === "dynamic-tool" && "toolCallId" in part) {
              const toolPart = part as typeof part & {
                toolName: string;
                toolCallId: string;
                state: string;
                title?: string;
                input?: unknown;
                output?: unknown;
                errorText?: string;
              };
              return (
                <ToolCallCard
                  key={toolPart.toolCallId ?? index}
                  toolName={toolPart.toolName}
                  state={toolPart.state}
                  input={"input" in toolPart ? toolPart.input : undefined}
                  output={"output" in toolPart ? toolPart.output : undefined}
                  errorText={"errorText" in toolPart ? toolPart.errorText : undefined}
                  title={toolPart.title}
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

const UserBubble = ({ content }: { content: string }) => (
  <div className="flex justify-end">
    <div className="max-w-[80%] rounded-xl rounded-br-md border border-primary/30 bg-primary/10 px-4 py-2 text-foreground">
      <p className="whitespace-pre-wrap break-words text-sm">{content}</p>
    </div>
  </div>
);

const AssistantMessage = ({ content }: { content: string }) => (
  <div className="flex">
    <div className="w-full max-w-full text-foreground prose prose-sm dark:prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children }) {
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !match && !className;
            const codeString = String(children).replace(/\n$/, "");

            if (isInline) {
              return (
                <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono text-foreground">
                  {children}
                </code>
              );
            }

            return <CodeBlock language={match?.[1]}>{codeString}</CodeBlock>;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline hover:text-accent/80"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  </div>
);

const CodeBlock = ({ children, language }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [children]);

  return (
    <div className="relative my-2 overflow-hidden rounded-md border bg-muted">
      <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-muted-foreground">
        <span>{language || "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 transition-colors hover:text-foreground"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              복사됨
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              복사
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-sm">
        <code>{children}</code>
      </pre>
    </div>
  );
};

interface CodeBlockProps {
  children: string;
  language?: string;
}
