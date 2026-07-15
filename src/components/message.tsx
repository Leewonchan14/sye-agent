"use client";

import type { UIMessage } from "ai";
import { isDynamicToolUIPart, isToolUIPart } from "ai";

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
            const toolParts = message.parts.filter(isToolUIPart);

            if (toolParts.length === 0) return null;

            return (
              <div className="mt-4 space-y-1">
                {toolParts.map((part) => (
                  <Tool key={part.toolCallId} defaultOpen={false}>
                    {isDynamicToolUIPart(part) ? (
                      <ToolHeader
                        type="dynamic-tool"
                        state={part.state}
                        toolName={part.toolName}
                      />
                    ) : (
                      <ToolHeader type={part.type} state={part.state} />
                    )}
                    <ToolContent>
                      {part.input != null && <ToolInput input={part.input} />}
                      {(part.output != null || part.errorText != null) && (
                        <ToolOutput output={part.output} errorText={part.errorText} />
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
