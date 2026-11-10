"use client";

import { ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  IMPORTANCE_LABEL,
  IMPORTANCES,
  SENTIMENT_LABEL,
  SENTIMENTS,
  type MonitorImportance,
  type MonitorSentiment,
} from "@/lib/monitor/types";
import { cn } from "@/lib/utils";

export const SENTIMENT_TONE: Record<MonitorSentiment, string> = {
  positive: "bg-success/10 text-success",
  neutral: "bg-canvas-card text-muted",
  negative: "bg-error/10 text-error",
};

const pillClass =
  "inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium whitespace-nowrap";

/** 논조 표시만 하는 작은 배지. 모르면 그리지 않는다. */
export const SentimentPill = ({
  sentiment,
  hideNeutral = false,
}: {
  sentiment: MonitorSentiment | null;
  hideNeutral?: boolean;
}) => {
  if (!sentiment || (hideNeutral && sentiment === "neutral")) return null;
  return (
    <span className={cn(pillClass, SENTIMENT_TONE[sentiment])}>
      {SENTIMENT_LABEL[sentiment]}
    </span>
  );
};

export const ImportancePill = ({
  importance,
}: {
  importance: MonitorImportance | null;
}) =>
  importance === "high" ? (
    <span className={cn(pillClass, "bg-warning/15 text-warning")}>
      {IMPORTANCE_LABEL.high}
    </span>
  ) : null;

const UNKNOWN = "unknown";

/**
 * 하치와레가 매긴 논조·중요도를 보여 주고, 눌러서 고칠 수 있게 한다.
 * 둘 다 비어 있으면 흐린 "논조" 버튼만 보인다.
 */
export const ToneMenu = ({
  sentiment,
  importance,
  onChange,
}: {
  sentiment: MonitorSentiment | null;
  importance: MonitorImportance | null;
  onChange: (patch: {
    sentiment?: MonitorSentiment | null;
    importance?: MonitorImportance | null;
  }) => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      aria-label="논조·중요도 고치기"
      className="inline-flex items-center gap-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {sentiment ? (
        <span className={cn(pillClass, SENTIMENT_TONE[sentiment])}>
          {SENTIMENT_LABEL[sentiment]}
        </span>
      ) : (
        <span
          className={cn(pillClass, "bg-canvas-card text-muted-soft hover:text-muted")}
        >
          논조
        </span>
      )}
      <ImportancePill importance={importance} />
      <ChevronDown className="size-3 text-muted-soft" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-40">
      <DropdownMenuGroup>
        <DropdownMenuLabel>논조</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={sentiment ?? UNKNOWN}
          onValueChange={(value) =>
            onChange({
              sentiment: value === UNKNOWN ? null : (value as MonitorSentiment),
            })
          }
        >
          {SENTIMENTS.map((s) => (
            <DropdownMenuRadioItem key={s} value={s} closeOnClick>
              {SENTIMENT_LABEL[s]}
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuRadioItem value={UNKNOWN} closeOnClick>
            모름
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>중요도</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={importance ?? UNKNOWN}
          onValueChange={(value) =>
            onChange({
              importance: value === UNKNOWN ? null : (value as MonitorImportance),
            })
          }
        >
          {IMPORTANCES.map((s) => (
            <DropdownMenuRadioItem key={s} value={s} closeOnClick>
              {IMPORTANCE_LABEL[s]}
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuRadioItem value={UNKNOWN} closeOnClick>
            모름
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
);
