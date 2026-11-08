"use client";

import { ChevronLeft, ChevronRight, CircleCheck } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { kst } from "@/lib/kst";
import type { MonitorRunSummary } from "@/lib/monitor/types";
import { cn } from "@/lib/utils";

const statusLabel = (run: MonitorRunSummary) =>
  run.pending ? "수집 중" : run.reportedAt ? "보고 완료" : "선별 중";

/**
 * 지난 수집 결과를 날짜 순서대로 늘어놓고 눌러서 바로 보는 줄.
 * 왼쪽이 과거, 오른쪽이 최신이고 고른 날짜는 항상 화면 안에 들어온다.
 */
export const RunHistory = ({
  runs,
  activeId,
  activeCount,
  onSelect,
}: {
  /** 최신순 */
  runs: MonitorRunSummary[];
  activeId: number;
  /** 고른 수집의 포함 건수 — 체크를 바꾸면 바로 반영되도록 화면의 값을 쓴다. 불러오는 중이면 비운다. */
  activeCount?: number;
  onSelect: (id: number) => void;
}) => {
  const railRef = useRef<HTMLDivElement>(null);
  const timeline = [...runs].reverse();
  const index = timeline.findIndex((r) => r.id === activeId);

  useEffect(() => {
    const rail = railRef.current;
    const card = rail?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!rail || !card) return;
    // rail이 relative라 offsetLeft는 rail 기준이다.
    const left = card.offsetLeft;
    const right = left + card.offsetWidth;
    if (left < rail.scrollLeft) rail.scrollTo({ left: left - 4 });
    else if (right > rail.scrollLeft + rail.clientWidth) {
      rail.scrollTo({ left: right - rail.clientWidth + 4 });
    }
  }, [activeId]);

  const arrows = timeline.length > 1;

  return (
    <nav aria-label="수집 기록" className="flex min-w-0 items-center gap-1.5">
      {arrows && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="이전 수집"
          className="hidden text-muted sm:inline-flex"
          disabled={index <= 0}
          onClick={() => onSelect(timeline[index - 1].id)}
        >
          <ChevronLeft />
        </Button>
      )}
      <div
        ref={railRef}
        className="relative -m-1 flex min-w-0 flex-1 [scrollbar-width:none] gap-1.5 overflow-x-auto p-1"
      >
        {timeline.map((r) => {
          const active = r.id === activeId;
          const count = active ? (activeCount ?? r.includedCount) : r.includedCount;
          const date = kst(r.until);
          const period = `${kst(r.since).format("M.D HH:mm")} ~ ${date.format("M.D HH:mm")}`;
          return (
            <button
              key={r.id}
              type="button"
              aria-current={active ? "true" : undefined}
              aria-label={`${period}, ${count}건, ${statusLabel(r)}`}
              title={period}
              onClick={() => onSelect(r.id)}
              className={cn(
                "flex w-[124px] shrink-0 flex-col gap-0.5 rounded-xl border border-hairline bg-surface px-3 py-2 text-left transition-colors outline-none hover:bg-canvas-soft focus-visible:ring-3 focus-visible:ring-ring/50",
                active && "border-primary bg-primary/10 hover:bg-primary/10"
              )}
            >
              <span className="text-sm font-medium text-ink tabular-nums">
                {date.format("M월 D일 (dd)")}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted tabular-nums">
                {count}건 ·
                {r.reportedAt && !r.pending && (
                  <CircleCheck className="size-3 text-success" />
                )}
                <span className={cn(r.reportedAt && !r.pending && "text-success")}>
                  {statusLabel(r)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {arrows && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="다음 수집"
          className="hidden text-muted sm:inline-flex"
          disabled={index < 0 || index >= timeline.length - 1}
          onClick={() => onSelect(timeline[index + 1].id)}
        >
          <ChevronRight />
        </Button>
      )}
    </nav>
  );
};
