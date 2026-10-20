"use client";

import type { UIMessage } from "ai";
import { isDynamicToolUIPart, isToolUIPart } from "ai";
import { memo, useMemo } from "react";

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
import { extractMessageText, isEchoedThinking } from "@/lib/utils";

interface MessageItemProps {
  message: UIMessage;
  isLastMessage?: boolean;
  isStreaming?: boolean;
}

export const MessageItem = memo(
  ({ message, isLastMessage = false, isStreaming = false }: MessageItemProps) => {
    const isUser = message.role === "user";

    /**
     * thinking 에코 판정은 reasoning 텍스트(수십 KB)마다 정규식을 돌린다 —
     * 렌더마다 반복하면 큰 세션에서 메인 스레드가 수 초 막힌다. 메시지가 바뀔 때만 계산한다.
     */
    const answerText = useMemo(() => extractMessageText(message), [message]);
    const echoedThinking = useMemo(
      () =>
        (message.parts ?? []).map((part) =>
          part.type === "reasoning" ? isEchoedThinking(part.text, answerText) : false
        ),
      [message, answerText]
    );

    if (!message.parts || message.parts.length === 0) return null;

    // thinking은 step(assistant 메시지)마다 별도 블록으로, 진행 순서 자리에 렌더링한다.
    const lastPart = message.parts.at(-1);

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
          <Avatar size="default" className="hidden md:inline-flex">
            <AvatarImage src="/munjackgui.png" alt="하치와레" />
          </Avatar>
          <div className="min-w-0 flex-1">
            {/* Text & reasoning: overflow-visible so table popups/tooltips aren't clipped */}
            <MessageContent className="w-full overflow-visible">
              {/* 파트 순서 = 실제 진행 순서: thinking → 나레이션 → 도구 카드 → … → 최종 답변 */}
              {message.parts.map((part, idx) => {
                if (part.type === "reasoning") {
                  if (echoedThinking[idx]) return null;
                  return (
                    <Reasoning
                      key={`${message.id}-${idx}`}
                      isStreaming={isLastMessage && isStreaming && part === lastPart}
                    >
                      <ReasoningTrigger />
                      <ReasoningContent>{part.text}</ReasoningContent>
                    </Reasoning>
                  );
                }
                if (part.type === "text" && part.text) {
                  return (
                    <MessageResponse key={`${message.id}-${idx}`}>
                      {part.text}
                    </MessageResponse>
                  );
                }
                if (isToolUIPart(part)) {
                  return (
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
                  );
                }
                return null; // step-start 등
              })}
            </MessageContent>
          </div>
        </div>
      </Message>
    );
  }
);

MessageItem.displayName = "MessageItem";
