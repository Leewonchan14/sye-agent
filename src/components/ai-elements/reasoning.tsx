"use client";

import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import sample from "lodash/sample";
import { ChevronDownIcon } from "lucide-react";
import { Streamdown } from "streamdown";
import { useStickToBottom } from "use-stick-to-bottom";

import type { ComponentProps, ReactNode } from "react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import { Shimmer } from "./shimmer";

interface ReasoningContextValue {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  duration: number | undefined;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

export const useReasoning = () => {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error("Reasoning components must be used within Reasoning");
  }
  return context;
};

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
};

const AUTO_CLOSE_DELAY = 1000;
const MS_IN_S = 1000;

export const Reasoning = memo(
  ({
    className,
    isStreaming = false,
    open,
    defaultOpen,
    onOpenChange,
    duration: durationProp,
    children,
    ...props
  }: ReasoningProps) => {
    const resolvedDefaultOpen = defaultOpen ?? isStreaming;
    // Track if defaultOpen was explicitly set to false (to prevent auto-open)
    const isExplicitlyClosed = defaultOpen === false;

    const [isOpen, setIsOpen] = useControllableState<boolean>({
      defaultProp: resolvedDefaultOpen,
      onChange: onOpenChange,
      prop: open,
    });
    const [duration, setDuration] = useControllableState<number | undefined>({
      defaultProp: undefined,
      prop: durationProp,
    });

    const hasEverStreamedRef = useRef(isStreaming);
    const [hasAutoClosed, setHasAutoClosed] = useState(false);
    const startTimeRef = useRef<number | null>(null);

    // Track when streaming starts and compute duration
    useEffect(() => {
      if (isStreaming) {
        hasEverStreamedRef.current = true;
        if (startTimeRef.current === null) {
          startTimeRef.current = Date.now();
        }
      } else if (startTimeRef.current !== null) {
        setDuration(Math.ceil((Date.now() - startTimeRef.current) / MS_IN_S));
        startTimeRef.current = null;
      }
    }, [isStreaming, setDuration]);

    // Auto-open when streaming starts (unless explicitly closed)
    useEffect(() => {
      if (isStreaming && !isOpen && !isExplicitlyClosed) {
        setIsOpen(true);
      }
    }, [isStreaming, isOpen, setIsOpen, isExplicitlyClosed]);

    // Auto-close when streaming ends (once only, and only if it ever streamed)
    useEffect(() => {
      if (hasEverStreamedRef.current && !isStreaming && isOpen && !hasAutoClosed) {
        const timer = setTimeout(() => {
          setIsOpen(false);
          setHasAutoClosed(true);
        }, AUTO_CLOSE_DELAY);

        return () => clearTimeout(timer);
      }
    }, [isStreaming, isOpen, setIsOpen, hasAutoClosed]);

    const handleOpenChange = useCallback(
      (newOpen: boolean) => {
        setIsOpen(newOpen);
      },
      [setIsOpen]
    );

    const contextValue = useMemo(
      () => ({ duration, isOpen, isStreaming, setIsOpen }),
      [duration, isOpen, isStreaming, setIsOpen]
    );

    return (
      <ReasoningContext.Provider value={contextValue}>
        <Collapsible
          className={cn("not-prose mb-4 italic opacity-80", className)}
          onOpenChange={handleOpenChange}
          open={isOpen}
          {...props}
        >
          {children}
        </Collapsible>
      </ReasoningContext.Provider>
    );
  }
);

export type ReasoningTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
};

const thinkingPhrases = [
  "생각 중이야... 조금만 기다려줘...!",
  "음... 생각 중...!",
  "곰곰이 생각해볼게...!",
  "기억을 더듬는 중... 잠시만...!",
  "머리를 굴려볼게... 조금만...!",
  "아... 그거 말이지...!",
  "응... 생각나려나...?",
];

const donePhrases = [
  "음... 곰곰이 생각해봤어...!",
  "생각났다...!!",
  "아... 그런 거였구나...!",
  "응... 아마 그럴 거야...!",
  "흐음... 그런 느낌인 건가...!",
  "아하... 알 것 같아...!",
  "다시 생각해봤는데... 맞는 것 같아...!",
];

const defaultGetThinkingMessage = (isStreaming: boolean, duration?: number) => {
  if (!isStreaming) {
    return <span>{sample(donePhrases) ?? ""}</span>;
  }

  return <Shimmer duration={1}>{sample(thinkingPhrases) ?? ""}</Shimmer>;
};

export const ReasoningTrigger = memo(
  ({
    className,
    children,
    getThinkingMessage = defaultGetThinkingMessage,
    ...props
  }: ReasoningTriggerProps) => {
    const { isStreaming, isOpen, duration } = useReasoning();

    const thinkingMessage = useMemo(
      () => getThinkingMessage(isStreaming, duration),
      [isStreaming, duration, getThinkingMessage]
    );

    return (
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2 text-sm text-muted-foreground/80 italic transition-colors hover:text-foreground/90",
          className
        )}
        {...props}
      >
        {thinkingMessage}
        <ChevronDownIcon
          className={cn(
            "size-4 transition-transform",
            isOpen ? "rotate-180" : "rotate-0"
          )}
        />
      </CollapsibleTrigger>
    );
  }
);

export type ReasoningContentProps = ComponentProps<typeof CollapsibleContent> & {
  children: string;
};

const streamdownPlugins = { cjk, code, math, mermaid };

/**
 * 긴 thinking이 화면을 다 차지하지 않도록 본문 높이를 제한하고 내부에서 스크롤한다.
 * 스크롤 추적은 대화 영역과 같은 엔진(use-stick-to-bottom)을 재사용한다:
 * 새 내용을 따라 내려가다가, 사용자가 위로 스크롤하면 멈춘다.
 */
const REASONING_MAX_HEIGHT = "max-h-[60vh]";

export const ReasoningContent = memo(
  ({ className, children, ...props }: ReasoningContentProps) => {
    const { isStreaming } = useReasoning();
    // 대화 영역과 같은 엔진을 쓴다: 사용자가 위로 올리면 `escapedFromLock`이 켜진다.
    // `initial: false` — 라이브러리가 자동으로 바닥까지 내려가지 않게 하고, 따라가기는 우리가 한다.
    const { scrollRef, contentRef, escapedFromLock } = useStickToBottom({
      initial: false,
    });

    /** 열릴 때의 시작 위치를 한 번만 맞췄는지 — 이후엔 사용자의 스크롤을 존중한다. */
    const didInitRef = useRef(false);

    // 새 내용이 커밋된 직후(페인트 전) 바닥으로 붙인다. 라이브러리의 스프링 애니메이션은
    // 프레임이 끊기면 뒤처지므로, 따라가기만 직접 대입한다.
    // 사용자가 위로 올려 lock을 벗어나면(`escapedFromLock`) 따라가지 않는다.
    useLayoutEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      if (isStreaming) {
        didInitRef.current = true;
        if (!escapedFromLock) el.scrollTop = el.scrollHeight;
        return;
      }
      // 끝난 thinking은 처음부터 읽도록 맨 위에서 한 번만 시작한다.
      if (!didInitRef.current) {
        didInitRef.current = true;
        el.scrollTop = 0;
      }
    }, [children, escapedFromLock, isStreaming, scrollRef]);

    // Streamdown은 마크다운을 비동기로 파싱해 커밋 뒤에도 높이가 더 자란다.
    useEffect(() => {
      const el = scrollRef.current;
      const content = contentRef.current;
      if (!el || !content) return;

      const observer = new ResizeObserver(() => {
        if (isStreaming && !escapedFromLock) el.scrollTop = el.scrollHeight;
      });
      observer.observe(content);
      return () => observer.disconnect();
    }, [contentRef, escapedFromLock, isStreaming, scrollRef]);

    return (
      <CollapsibleContent
        className={cn(
          "mt-4 text-sm",
          "text-muted-foreground outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2",
          "opacity-70 [&_li]:italic [&_p]:italic",
          className
        )}
        {...props}
      >
        <div
          ref={scrollRef}
          className={cn(
            REASONING_MAX_HEIGHT,
            "scrollbar-thin overflow-y-auto outline-none"
          )}
        >
          <div ref={contentRef}>
            <Streamdown plugins={streamdownPlugins}>{children}</Streamdown>
          </div>
        </div>
      </CollapsibleContent>
    );
  }
);

Reasoning.displayName = "Reasoning";
ReasoningTrigger.displayName = "ReasoningTrigger";
ReasoningContent.displayName = "ReasoningContent";
