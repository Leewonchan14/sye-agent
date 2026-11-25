"use client";

import type { UIMessage } from "ai";
import { memo, useMemo } from "react";

import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { TurnActivity } from "@/components/ai-elements/tool-group";
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

    /**
     * 한 턴의 **생각 + 도구 호출 전부**를 하나로 묶는다.
     * 마지막 텍스트 파트를 "답변"으로 보고, 그 앞의 모든 작업(생각·나레이션·도구)은
     * <TurnActivity> 안으로 접는다. 턴이 도는 중에는 펼쳐서 진행을 보여준다.
     */
    const renderedParts = useMemo(() => {
      const parts = message.parts ?? [];

      let answerIndex = -1;
      parts.forEach((part, idx) => {
        if (part.type === "text" && part.text?.trim()) answerIndex = idx;
      });
      const workEnd = answerIndex === -1 ? parts.length : answerIndex;

      const work = parts
        .map((part, idx) => ({ part, idx }))
        .slice(0, workEnd)
        .filter(({ part, idx }) => !(part.type === "reasoning" && echoedThinking[idx]))
        .map(({ part }) => part);

      return [
        work.length > 0 ? (
          <TurnActivity
            key={`${message.id}-activity`}
            parts={work}
            isStreaming={isLastMessage && isStreaming}
          />
        ) : null,
        ...parts
          .slice(workEnd)
          .map((part, idx) =>
            part.type === "text" ? (
              <MessageResponse key={`${message.id}-answer-${idx}`}>
                {part.text}
              </MessageResponse>
            ) : null
          ),
      ];
    }, [message, echoedThinking, isLastMessage, isStreaming]);

    if (!message.parts || message.parts.length === 0) return null;

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
              {renderedParts}
            </MessageContent>
          </div>
        </div>
      </Message>
    );
  }
);

MessageItem.displayName = "MessageItem";
