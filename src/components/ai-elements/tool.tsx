"use client";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { CheckCircleIcon, ChevronDownIcon, ClockIcon, XCircleIcon } from "lucide-react";

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
  "approval-requested": "bg-[#b85d65]/10 text-[#b85d65]",
  "approval-responded": "bg-[#7db8a0]/10 text-[#7db8a0]",
  "input-available": "bg-[#d96c75]/10 text-[#d96c75]",
  "input-streaming": "bg-[#d96c75]/10 text-[#d96c75]",
  "output-available": "bg-[#7db8a0]/10 text-[#7db8a0]",
  "output-denied": "bg-[#b85d65]/10 text-[#b85d65]",
  "output-error": "bg-[#c64545]/10 text-[#c64545]",
};

const statusLabels: Record<ToolPart["state"], string> = {
  "approval-requested": "기다리는 중",
  "approval-responded": "왔어…!",
  "input-available": "하는 중…!",
  "input-streaming": "준비 중…!",
  "output-available": "다 했어…!",
  "output-denied": "안 된대…",
  "output-error": "앗…!",
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
  /* brand monitoring tools */
  brand_monitor: "데이터 수집 및 분석",
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
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>
            <img
              src="/munjackgui-thinking.png"
              alt=""
              className="size-7 rounded-full object-cover"
            />
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8} align="start">
            <img
              src="/munjackgui-thinking.png"
              alt=""
              className="w-36 rounded-md bg-background object-cover"
            />
          </TooltipContent>
        </Tooltip>
        <span className="text-sm font-medium text-foreground">
          {title ?? derivedName}…!
        </span>
        <Badge className={cn("gap-1 rounded-full text-xs", statusColors[state])}>
          {statusIcons[state]}
          {statusLabels[state]}
        </Badge>
      </div>
      <ChevronDownIcon className="size-4 text-[#b85d65] transition-transform group-data-[state=open]:rotate-180" />
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
      시킨 일이야…!
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
        {errorText ? "에구…!" : "결과야…!"}
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
