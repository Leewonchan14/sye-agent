"use client";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";

import { Spinner } from "@/components/ui/spinner";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";

import { CodeBlock } from "./code-block";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, children, ...props }: ToolProps) => (
  <Collapsible
    className={cn(
      "group not-prose mb-4 max-h-[60vh] w-full overflow-y-auto rounded-lg border border-border bg-secondary",
      className
    )}
    {...props}
  >
    {children}
  </Collapsible>
);

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type ToolHeaderProps = {
  title?: string;
  className?: string;
} & (
  | { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
  | {
      type: DynamicToolUIPart["type"];
      state: DynamicToolUIPart["state"];
      toolName: string;
    }
);

const statusColors: Record<ToolPart["state"], string> = {
  "approval-requested": "bg-warning/10 text-warning",
  "approval-responded": "bg-success/10 text-success",
  "input-available": "bg-muted text-muted-foreground",
  "input-streaming": "bg-muted text-muted-foreground",
  "output-available": "bg-success/10 text-success",
  "output-denied": "bg-destructive/10 text-destructive",
  "output-error": "bg-destructive/10 text-destructive",
};

const statusLabels: Record<ToolPart["state"], string> = {
  "approval-requested": "기다리는 중",
  "approval-responded": "승인됨",
  "input-available": "실행 중",
  "input-streaming": "준비 중",
  "output-available": "완료",
  "output-denied": "거부됨",
  "output-error": "오류",
};

const statusIcons: Record<ToolPart["state"], ReactNode> = {
  "approval-requested": <ClockIcon className="size-3" />,
  "approval-responded": <CheckCircleIcon className="size-3" />,
  "input-available": <Spinner />,
  "input-streaming": <Spinner />,
  "output-available": <CheckCircleIcon className="size-3" />,
  "output-denied": <XCircleIcon className="size-3" />,
  "output-error": <XCircleIcon className="size-3" />,
};

const toolNameKoreanMap: Record<string, string> = {
  /* SDK types */
  invoke: "시키기",
  result: "결과",
  /* Hermes 도구 */
  terminal: "터미널",
  browser_exec: "브라우저 실행",
  skill_view: "스킬 보기",
  skills_list: "스킬 목록",
  web_search: "웹에서 찾기",
  web_extract: "웹 내용 읽기",
  /* dynamic tools from agent.ts */
  search_naver_local: "네이버 동네 찾기",
  search_naver_blog: "네이버 블로그 찾기",
  search_naver_cafe: "네이버 카페 찾기",
  search_naver_news: "네이버 뉴스 보기",
  search_naver_image: "네이버 이미지 찾기",
  search_naver_shopping: "네이버 쇼핑 검색",
  search_naver_place: "네이버 플레이스 검색",
  web_search_exa: "웹에서 찾기",
  web_fetch_exa: "웹 내용 읽기",
  /* memory search */
  memory_keyword_search: "카톡 키워드 검색",
  memory_vector_search: "카톡 의미 검색",
  /* brand monitoring tools */
  brand_monitor: "데이터 수집 및 분석",
  /* instruction management */
  instruction_add: "지시 사항 추가",
  instruction_edit: "지시 사항 수정",
  instruction_delete: "지시 사항 삭제",
  instruction_list: "지시 사항 목록",
  /* utility */
  get_current_time: "현재 시각",
};

const formatToolName = (name: string): string => {
  const korean = toolNameKoreanMap[name];
  if (korean) return korean;
  /* fallback: split underscores, preserve as-is but add cute ending */
  return name.replace(/_/g, " ");
};

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  toolName,
  ...props
}: ToolHeaderProps) => {
  const derivedName =
    type === "dynamic-tool"
      ? formatToolName(toolName)
      : formatToolName(type.split("-").slice(1).join("-"));

  return (
    <CollapsibleTrigger
      className={cn(
        "sticky top-0 z-10 flex w-full items-center justify-between gap-4 rounded-t-lg bg-secondary p-3",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-2">
        <WrenchIcon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          {title ?? derivedName}
        </span>
        <Badge className={cn("gap-1 rounded-full text-xs", statusColors[state])}>
          {statusIcons[state]}
          {statusLabels[state]}
        </Badge>
      </div>
      <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "space-y-4 p-4 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2",
      className
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("space-y-2 overflow-hidden", className)} {...props}>
    <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
      입력
    </h4>
    <div className="overflow-hidden rounded-md bg-accent">
      <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
    </div>
  </div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"];
  errorText: ToolPart["errorText"];
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }

  let Output = <div>{output as ReactNode}</div>;

  if (typeof output === "object" && !isValidElement(output)) {
    Output = <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />;
  } else if (typeof output === "string") {
    Output = <CodeBlock code={output} language="json" />;
  }

  return (
    <div className={cn("space-y-2", className)} {...props}>
      <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {errorText ? "오류" : "결과"}
      </h4>
      <div
        className={cn(
          "overflow-x-auto rounded-md text-xs [&_table]:w-full",
          errorText ? "bg-destructive/10 text-destructive" : "bg-accent text-foreground"
        )}
      >
        {errorText && <div>{errorText}</div>}
        {Output}
      </div>
    </div>
  );
};
