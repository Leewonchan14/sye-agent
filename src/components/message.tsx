"use client";

import { Check, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useCallback, useState } from "react";

import type { UIMessage } from "@ai-sdk/react";

import { ToolCallCard } from "@/components/tool-call-card";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent } from "@/components/ui/message";

export const MessageItem = ({ message }: { message: UIMessage }) => {
  const isUser = message.role === "user";

  if (!message.parts || message.parts.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 py-2">
      {message.parts.map((part, index) => {
        switch (part.type) {
          case "text": {
            if (!part.text) return null;
            return (
              <Message key={index} align={isUser ? "end" : "start"}>
                <MessageContent>
                  <Bubble
                    variant={isUser ? "default" : "outline"}
                    align={isUser ? "end" : "start"}
                  >
                    <BubbleContent>
                      {isUser ? (
                        <p className="whitespace-pre-wrap break-words text-sm">
                          {part.text}
                        </p>
                      ) : (
                        <MarkdownRenderer content={part.text} />
                      )}
                    </BubbleContent>
                  </Bubble>
                </MessageContent>
              </Message>
            );
          }
          case "reasoning": {
            if (!part.text) return null;
            return (
              <details key={index} className="rounded-md border bg-muted/30">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
                  Reasoning
                </summary>
                <div className="px-3 py-2 text-xs text-muted-foreground">{part.text}</div>
              </details>
            );
          }
          default: {
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

// === Markdown renderer for assistant messages ===

const MarkdownRenderer = ({ content }: { content: string }) => (
  <div className="prose prose-sm max-w-none text-foreground [&_a]:text-accent [&_a]:underline [&_a]:hover:text-accent/80 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm [&_pre]:my-0 [&_pre]:rounded-md [&_pre]:border [&_pre]:bg-muted [&_pre]:p-3">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children }) {
          const match = /language-(\w+)/.exec(className || "");
          const isInline = !match && !className;
          const codeString = String(children).replace(/\n$/, "");

          if (isInline) {
            return <code>{children}</code>;
          }

          return <CodeBlock language={match?.[1]}>{codeString}</CodeBlock>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
);

// === Code block with copy ===

interface CodeBlockProps {
  children: string;
  language?: string;
}

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
              <Check className="h-3 w-3" /> 복사됨
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> 복사
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
