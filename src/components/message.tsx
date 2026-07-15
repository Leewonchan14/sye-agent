"use client";

import { Check, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useCallback, useState } from "react";

import type { UIMessage } from "@ai-sdk/react";

interface MessageItemProps {
  message: UIMessage;
}

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
    <div className="relative my-2 overflow-hidden rounded-lg border bg-muted">
      <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-muted-foreground">
        <span>{language || "code"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-foreground transition-colors"
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
      <pre className="overflow-x-auto p-3 text-sm font-mono">
        <code>{children}</code>
      </pre>
    </div>
  );
};

const InlineCode = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono text-foreground">
    {children}
  </code>
);

export const MessageItem = ({ message }: MessageItemProps) => {
  const isUser = message.role === "user";

  const textParts = message.parts?.filter(
    (p): p is { type: "text"; text: string; state?: "streaming" | "done" } =>
      p.type === "text"
  );
  const content = textParts?.map((p) => p.text).join("") ?? "";

  if (!content) return null;

  return isUser ? (
    <UserBubble content={content} />
  ) : (
    <AssistantMessage content={content} />
  );
};

const UserBubble = ({ content }: { content: string }) => (
  <div className="flex justify-end">
    <div className="max-w-[80%] rounded-2xl rounded-br-sm border border-primary/30 bg-primary/10 px-4 py-2 text-foreground">
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
              return <InlineCode>{children}</InlineCode>;
            }

            return <CodeBlock language={match?.[1]}>{codeString}</CodeBlock>;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 underline hover:text-blue-600"
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
