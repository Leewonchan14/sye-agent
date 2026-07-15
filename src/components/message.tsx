"use client";

import type { DynamicToolUIPart, ToolUIPart, UIMessage } from "ai";

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
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { createMessageHelper } from "@/lib/utils";

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

  const reasoningText = createMessageHelper(message).extractReasoning() ?? "";
  const hasReasoning = reasoningText.length > 0;

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
        <Avatar size="default">
          <AvatarImage src="/munjackgui.png" alt="치이카와" />
        </Avatar>
        <div className="min-w-0 flex-1">
          {/* Text & reasoning: overflow-visible so table popups/tooltips aren't clipped */}
          <MessageContent className="w-full overflow-visible">
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
              return null;
            })}
          </MessageContent>

          {/* Tool cards outside MessageContent for full width (not constrained by w-fit) */}
          {(() => {
            const toolItems = message.parts
              .map((part, idx) => ({
                key: idx,
                props: extractToolPartProps(part),
              }))
              .filter(
                (item): item is { key: number; props: ToolPartProps } =>
                  item.props != null
              );

            if (toolItems.length === 0) return null;

            return (
              <div className="mt-4 space-y-1">
                {toolItems.map(({ key, props }) => (
                  <Tool key={props.toolCallId ?? key} defaultOpen={false}>
                    {(() => {
                      const isDynamic = props.type === "dynamic-tool";
                      // Build header JSX directly, avoiding union type narrowing issues
                      return isDynamic ? (
                        <ToolHeader
                          type="dynamic-tool"
                          state={props.state as DynamicToolUIPart["state"]}
                          toolName={props.toolName ?? ""}
                        />
                      ) : (
                        <ToolHeader
                          type={props.type as `tool-${string}`}
                          state={props.state as ToolUIPart["state"]}
                        />
                      );
                    })()}
                    <ToolContent>
                      {props.input != null && <ToolInput input={props.input} />}
                      {(props.output != null || props.errorText != null) && (
                        <ToolOutput output={props.output} errorText={props.errorText} />
                      )}
                    </ToolContent>
                  </Tool>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    </Message>
  );
};

/* ── Tool part extraction ── */

interface ToolPartProps {
  type: `tool-${string}` | "dynamic-tool";
  state: string;
  toolCallId: string;
  toolName?: string;
  input: unknown;
  output: unknown;
  errorText?: string;
}

const extractToolPartProps = (part: Record<string, unknown>): ToolPartProps | null => {
  if (
    typeof part.type !== "string" ||
    typeof part.state !== "string" ||
    typeof part.toolCallId !== "string"
  ) {
    return null;
  }
  // Accept both static tool-xxx and dynamic-tool from SDK
  if (part.type !== "dynamic-tool" && !part.type.startsWith("tool-")) {
    return null;
  }
  const type = part.type as `tool-${string}` | "dynamic-tool";
  return {
    type,
    state: part.state,
    toolCallId: part.toolCallId,
    toolName: "toolName" in part ? (part.toolName as string) : undefined,
    input: "input" in part ? part.input : undefined,
    output: "output" in part ? part.output : undefined,
    errorText:
      "errorText" in part && typeof part.errorText === "string"
        ? part.errorText
        : undefined,
  };
};
