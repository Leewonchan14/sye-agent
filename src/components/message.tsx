"use client";

import type { ToolUIPart, UIMessage } from "ai";

import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";

interface MessageItemProps {
  message: UIMessage;
  isLastMessage?: boolean;
  isStreaming?: boolean;
}

export const MessageItem = ({
  message,
  isLastMessage = false,
  isStreaming = false,
}: MessageItemProps) => {
  const isUser = message.role === "user";

  if (!message.parts || message.parts.length === 0) return null;

  // Consolidate all reasoning parts into one block
  const reasoningParts = message.parts.filter((part) => part.type === "reasoning");
  const reasoningText = reasoningParts
    .map((p) => (p.type === "reasoning" ? p.text : ""))
    .join("\n\n");
  const hasReasoning = reasoningParts.length > 0;

  const lastPart = message.parts.at(-1);
  const isReasoningStreaming =
    isLastMessage && isStreaming && lastPart?.type === "reasoning";

  // User messages: simple bubble
  if (isUser) {
    return (
      <Message from="user">
        <MessageContent>
          {message.parts.map((part, idx) => {
            if (part.type === "text" && part.text) {
              return (
                <MessageResponse key={`${message.id}-${idx}`}>
                  {part.text}
                </MessageResponse>
              );
            }
            return null;
          })}
        </MessageContent>
      </Message>
    );
  }

  // Assistant messages: avatar + content (reasoning, text, tool calls)
  return (
    <Message from="assistant">
      <div className="flex items-start gap-3">
        <img
          src="/munjackgui.webp"
          alt="치이카와"
          className="size-8 shrink-0 rounded-full object-cover"
          style={{ backgroundColor: "var(--color-canvas-soft)" }}
        />
        <div className="min-w-0 flex-1">
          <MessageContent>
            {hasReasoning && (
              <Reasoning isStreaming={isReasoningStreaming}>
                <ReasoningTrigger />
                <ReasoningContent>{reasoningText}</ReasoningContent>
              </Reasoning>
            )}
            {message.parts.map((part, idx) => {
              if (part.type === "text" && part.text) {
                return (
                  <MessageResponse key={`${message.id}-${idx}`}>
                    {part.text}
                  </MessageResponse>
                );
              }
              if (part.type === "reasoning") return null; // consolidated above
              if (part.type === "step-start") return null;

              // Tool parts: validated at runtime
              const toolProps = extractToolPartProps(part);
              if (toolProps) {
                return (
                  <Tool key={toolProps.toolCallId ?? idx} defaultOpen={false}>
                    <ToolHeader
                      type={toolProps.type}
                      state={toolProps.state as ToolUIPart["state"]}
                    />
                    <ToolContent>
                      {toolProps.input != null && <ToolInput input={toolProps.input} />}
                      {(toolProps.output != null || toolProps.errorText != null) && (
                        <ToolOutput
                          output={toolProps.output}
                          errorText={toolProps.errorText}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                );
              }
              return null;
            })}
          </MessageContent>
        </div>
      </div>
    </Message>
  );
};

/* ── Tool part extraction ── */

interface ToolPartProps {
  type: `tool-${string}`;
  state: string;
  toolCallId: string;
  input: unknown;
  output: unknown;
  errorText?: string;
}

const extractToolPartProps = (part: Record<string, unknown>): ToolPartProps | null => {
  if (
    typeof part.type !== "string" ||
    !part.type.startsWith("tool-") ||
    typeof part.state !== "string" ||
    typeof part.toolCallId !== "string"
  ) {
    return null;
  }
  // Runtime check guarantees type starts with "tool-"
  const type = part.type as `tool-${string}`;
  return {
    type,
    state: part.state,
    toolCallId: part.toolCallId,
    input: "input" in part ? part.input : undefined,
    output: "output" in part ? part.output : undefined,
    errorText:
      "errorText" in part && typeof part.errorText === "string"
        ? part.errorText
        : undefined,
  };
};
