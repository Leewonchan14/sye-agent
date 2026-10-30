"use client";

/**
 * 한 턴의 **생각 + 도구 호출을 하나로 묶는** 요약 블록.
 *
 * 최종 답변만 바깥에 남기고, 그 앞의 모든 파트(생각·중간 나레이션·도구)를 여기로 접는다.
 * 턴이 도는 중에는 펼쳐서 진행을 보여주고, 끝나면 접힌다.
 *
 * 표현 원칙:
 * - 답변 텍스트와 구분되는 "조용한 작업 로그" — 생각은 inset 블록, 도구는 평평한 행.
 * - 생각은 아이콘만 muted, 본문은 13px text-foreground/75 italic 한 줄.
 * - 도구 이름은 연속될 때 한 번만 쓰고 이후 행은 같은 폭만큼 들여쓴다.
 * - Badge 는 실패/진행 같은 예외 상태에만. 아이콘은 lucide 만 사용한다.
 */

import type { UIMessage } from "ai";
import { isDynamicToolUIPart, isToolUIPart } from "ai";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  XIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import type { ToolPart } from "@/components/ai-elements/tool";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const toolNameOf = (part: ToolPart): string =>
  isDynamicToolUIPart(part) ? part.toolName : part.type.replace(/^tool-/, "");

/** input 에서 사람이 읽을 한 줄을 뽑는다 — 첫 문자열 값(보통 command/query/url). */
const inputText = (input: unknown): string => {
  if (input == null) return "";
  if (typeof input === "string") return input;
  if (typeof input !== "object") return String(input);
  const values = Object.values(input as Record<string, unknown>);
  const firstString = values.find((value) => typeof value === "string" && value.trim());
  const text = typeof firstString === "string" ? firstString : JSON.stringify(input);
  return text.replace(/\s+/g, " ").trim();
};

const isPending = (part: ToolPart) =>
  part.state === "input-streaming" || part.state === "input-available";

const isFailed = (part: ToolPart) =>
  part.state === "output-error" || part.state === "output-denied";

const firstLine = (text: string, max = 90) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max)}…` : line;
};

type AnyPart = UIMessage["parts"][number];
type ActivityRun = {
  kind: "reasoning" | "tool" | "text";
  start: number;
  parts: AnyPart[];
};

/** 연속된 같은 종류의 파트를 한 덩어리로 묶는다 — 원래 순서는 그대로 유지된다. */
const splitRuns = (parts: AnyPart[]): ActivityRun[] => {
  const runs: ActivityRun[] = [];

  parts.forEach((part, index) => {
    const kind =
      part.type === "reasoning"
        ? "reasoning"
        : part.type === "text"
          ? "text"
          : isToolUIPart(part)
            ? "tool"
            : null;
    if (!kind) return;

    const current = runs.at(-1);
    if (current && current.kind === kind && kind !== "text") {
      current.parts.push(part);
    } else {
      runs.push({ kind, start: index, parts: [part] });
    }
  });

  return runs;
};

const SectionLabel = ({ children }: { children: ReactNode }) => (
  <div className="px-2 pt-1.5 pb-1 text-[11px] font-medium text-muted-foreground">
    {children}
  </div>
);

/** 접힌 생각 한 줄 — 클릭하면 전체 추론이 열린다. */
const ReasoningRow = ({ text }: { text: string }) => {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "xs" }),
          "h-7 w-full justify-start gap-2 rounded-md px-2 py-0 font-normal hover:bg-accent/30 aria-expanded:bg-transparent"
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left text-[13px] leading-5 text-foreground/75 italic">
          {firstLine(text, 96)}
        </span>
        <ChevronRightIcon
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-90"
          )}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="pr-2 pb-1 pl-2 text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/75">
          {text}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
};

/** 긴 텍스트는 잘라서 보여주고, 남은 길이를 알려준다. */
const truncate = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max)}\n… (${text.length - max}자 생략)` : text;

/** 문자열 안에 JSON 이 통째로 들어 있는 경우(도구 래퍼)를 재귀적으로 풀어준다. */
const reviveJsonStrings = (value: unknown, depth = 0): unknown => {
  if (depth > 5) return value;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text.startsWith("{") && !text.startsWith("[")) return value;
    try {
      return reviveJsonStrings(JSON.parse(text), depth + 1);
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return value.map((item) => reviveJsonStrings(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        reviveJsonStrings(item, depth + 1),
      ])
    );
  }
  return value;
};

/** `{ output: "<json>", durationSec }` 처럼 감싸기만 하는 래퍼는 벗겨서 데이터만 보여준다. */
const WRAPPER_KEYS = ["output", "result", "content", "data", "text"] as const;

const unwrapSingleKey = (value: unknown): unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const entries = Object.entries(record);
  const key = WRAPPER_KEYS.find((candidate) => candidate in record);
  if (!key) return value;

  const inner = record[key];
  if (inner === null || typeof inner !== "object") return value;

  const allMeta = entries
    .filter(([entryKey]) => entryKey !== key)
    .every(([, meta]) => meta === null || typeof meta !== "object");

  return allMeta ? inner : value;
};

/** 도구 output(문자열/객체/JSON 문자열)을 사람이 읽을 텍스트로. */
const outputText = (output: unknown): string => {
  if (output == null) return "";
  const revived = unwrapSingleKey(reviveJsonStrings(output));
  if (typeof revived === "string") return revived;
  try {
    return JSON.stringify(revived, null, 2);
  } catch {
    return String(output);
  }
};

/** 도구 한 건 = 1줄. 클릭하면 시킨 일(input)과 결과(output)가 펼쳐진다. */
const ToolRow = ({ part, showName }: { part: ToolPart; showName: boolean }) => {
  const [open, setOpen] = useState(false);
  const pending = isPending(part);
  const failed = isFailed(part);
  const summary = inputText(part.input);
  const detail = truncate(inputText(part.input), 4000);
  const result = truncate(outputText(part.output ?? part.errorText), 4000);
  const hasDetail = Boolean(detail || result);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        disabled={!hasDetail}
        className={cn(
          buttonVariants({ variant: "ghost", size: "xs" }),
          "h-8 w-full justify-start gap-2 rounded-md px-2 py-0 font-normal hover:bg-accent/30 aria-expanded:bg-transparent"
        )}
      >
        <span className="flex size-3.5 shrink-0 items-center justify-center" aria-hidden>
          {pending ? (
            <Spinner className="size-3.5 text-primary" />
          ) : failed ? (
            <XIcon className="size-3.5 text-destructive dark:text-red-300" />
          ) : (
            <CheckIcon className="size-3.5 text-[#7db8a0] dark:text-[#9ed8c1]" />
          )}
        </span>

        <span
          className={cn(
            "max-w-[45%] shrink-0 truncate",
            showName
              ? "text-[13px] font-medium text-foreground/85"
              : "text-[12px] font-normal text-muted-foreground/55"
          )}
          title={showName ? undefined : "앞 줄과 같은 도구"}
        >
          {toolNameOf(part)}
        </span>

        <span className="min-w-0 flex-1 truncate text-left font-mono text-xs text-muted-foreground">
          {summary || "—"}
        </span>

        {failed ? (
          <Badge
            variant="destructive"
            className="h-[18px] shrink-0 px-1.5 text-[11px] font-medium dark:text-red-300"
          >
            실패
          </Badge>
        ) : pending ? (
          <Badge
            variant="secondary"
            className="h-[18px] shrink-0 px-1.5 text-[11px] font-normal text-muted-foreground"
          >
            실행 중
          </Badge>
        ) : null}

        <ChevronRightIcon
          className={cn(
            "size-3 shrink-0 text-muted-foreground/60 transition-transform duration-200",
            open && "rotate-90",
            !hasDetail && "opacity-0"
          )}
          aria-hidden
        />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mx-2 mb-2 space-y-2.5 rounded-lg border border-border bg-secondary/60 p-2.5">
          {detail ? (
            <div>
              <div className="mb-0.5 text-[10.5px] font-medium tracking-wide text-muted-foreground/70">
                시킨 일
              </div>
              <pre className="max-h-40 overflow-auto font-mono text-[11.5px] leading-relaxed break-words whitespace-pre-wrap text-foreground/75">
                {detail}
              </pre>
            </div>
          ) : null}
          {result ? (
            <div>
              <div className="mb-0.5 text-[10.5px] font-medium tracking-wide text-muted-foreground/70">
                결과
              </div>
              <pre className="max-h-52 overflow-auto font-mono text-[11.5px] leading-relaxed break-words whitespace-pre-wrap text-foreground/75">
                {result}
              </pre>
            </div>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export interface TurnActivityProps {
  parts: AnyPart[];
  /** 이 턴이 아직 스트리밍 중인지 — 진행 중엔 펼쳐 둔다. */
  isStreaming?: boolean;
  className?: string;
}

export const TurnActivity = ({
  parts,
  isStreaming = false,
  className,
}: TurnActivityProps) => {
  const [open, setOpen] = useState<boolean | undefined>(undefined);
  const resolvedOpen = open ?? isStreaming;

  const { reasoningCount, toolCount, pending, failed, runs } = useMemo(() => {
    const tools = parts.filter(isToolUIPart) as ToolPart[];
    return {
      reasoningCount: parts.filter((part) => part.type === "reasoning").length,
      toolCount: tools.length,
      pending: tools.filter(isPending).length,
      failed: tools.filter(isFailed).length,
      runs: splitRuns(parts),
    };
  }, [parts]);

  if (parts.length === 0) return null;

  const label =
    [
      reasoningCount > 0 ? `생각 ${reasoningCount}회` : null,
      toolCount > 0 ? `도구 ${toolCount}개` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "작업 기록";

  const running = isStreaming || pending > 0;

  return (
    <Collapsible
      open={resolvedOpen}
      onOpenChange={(next) => setOpen(next)}
      className={cn(
        "not-prose mb-3 w-full rounded-xl border border-border/60 bg-secondary/40 text-[13px]",
        className
      )}
    >
      <CollapsibleTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "h-9 w-full justify-start gap-2 rounded-xl px-3 py-0 font-normal hover:bg-accent/40 aria-expanded:bg-transparent"
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left text-[13px] font-medium text-foreground/80">
          {label}
        </span>

        {running ? (
          <Badge
            variant="secondary"
            className="h-[18px] shrink-0 gap-1 px-1.5 text-[11px] font-normal text-muted-foreground"
          >
            <Spinner className="size-2.5 text-primary" />
            진행 중
          </Badge>
        ) : failed > 0 ? (
          <Badge
            variant="destructive"
            className="h-[18px] shrink-0 px-1.5 text-[11px] font-medium dark:text-red-300"
          >
            실패 {failed}
          </Badge>
        ) : null}

        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            resolvedOpen && "rotate-180"
          )}
          aria-hidden
        />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <Separator className="bg-border/60" />
        <div className="px-1.5 pt-1.5 pb-2">
          {runs.map((run, runIndex) => {
            const key = `${run.kind}-${run.start}`;

            if (run.kind === "reasoning") {
              return (
                <section key={key}>
                  <SectionLabel>생각</SectionLabel>
                  <div className="rounded-lg bg-background/50 px-1 py-1">
                    {run.parts.map((part, index) =>
                      part.type === "reasoning" ? (
                        <ReasoningRow key={`r-${run.start + index}`} text={part.text} />
                      ) : null
                    )}
                  </div>
                </section>
              );
            }

            if (run.kind === "text") {
              return run.parts.map((part, index) =>
                part.type === "text" ? (
                  <p
                    key={`t-${run.start + index}`}
                    className="px-2 py-1 text-xs leading-relaxed text-muted-foreground"
                  >
                    {firstLine(part.text, 140)}
                  </p>
                ) : null
              );
            }

            const toolParts = run.parts as ToolPart[];

            return (
              <section key={key}>
                {runIndex > 0 ? (
                  <>
                    <Separator className="mt-1.5 bg-border/60" />
                    <SectionLabel>도구</SectionLabel>
                  </>
                ) : null}
                {toolParts.map((toolPart, index) => (
                  <ToolRow
                    key={toolPart.toolCallId ?? `tool-${run.start + index}`}
                    part={toolPart}
                    showName={
                      index === 0 ||
                      toolNameOf(toolParts[index - 1]) !== toolNameOf(toolPart)
                    }
                  />
                ))}
              </section>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
