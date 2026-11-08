"use client";

import { useEffect, useState } from "react";

import { Spinner } from "@/components/ui/spinner";
import { kst } from "@/lib/kst";
import { PROGRESS_STAGES } from "@/lib/monitor/progress-stages";
import { useMonitorProgress } from "@/lib/monitor/queries";
import { cn } from "@/lib/utils";

/** 이만큼 활동이 없으면 멈췄을 수 있다고 알려 준다. */
const QUIET_AFTER_MS = 5 * 60 * 1000;

const formatElapsed = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours) return `${hours}시간 ${minutes}분`;
  return minutes ? `${minutes}분 ${seconds}초` : `${seconds}초`;
};

/** 하치와레가 언제 시작했고 어디까지 왔는지. pending이 바뀌면 key로 새로 시작한다. */
export const HermesProgress = ({
  kind,
  id,
  since,
  title,
}: {
  kind: "run" | "issue";
  id: number;
  since: string;
  title: string;
}) => {
  const { data } = useMonitorProgress(kind, id);
  const progress = data?.progress ?? null;
  const [now, setNow] = useState(() => Date.now());
  // 단계는 뒤로 가지 않게 지금까지 본 가장 먼 단계를 쓴다.
  const [reached, setReached] = useState(0);
  if (progress && progress.stage > reached) setReached(progress.stage);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const lastAt = progress?.lastActivityAt
    ? new Date(progress.lastActivityAt).valueOf()
    : null;
  const quiet = lastAt !== null && now - lastAt > QUIET_AFTER_MS;

  return (
    <section
      aria-label="하치와레 진행 상황"
      className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-surface px-4 py-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-ink">
          <Spinner className="size-3.5 text-primary" /> {title}
        </p>
        <p className="text-[13px] text-muted tabular-nums">
          {kst(since).format("HH:mm")} 시작 ·{" "}
          <span className="text-ink">
            {formatElapsed(now - new Date(since).valueOf())}
          </span>{" "}
          경과
        </p>
      </div>
      <ol className="grid grid-cols-4 gap-1.5">
        {PROGRESS_STAGES.map((stage, i) => (
          <li key={stage} aria-current={i === reached ? "step" : undefined}>
            <span
              className={cn(
                "block h-1.5 rounded-full bg-canvas-strong",
                i <= reached && progress && "bg-primary",
                i === reached && progress && "animate-pulse"
              )}
            />
            <span
              className={cn(
                "mt-1 block text-[11px] text-muted-soft",
                i === reached && progress && "font-medium text-ink"
              )}
            >
              {stage}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-[13px] text-body">
        {progress ? (
          <>
            지금: <span className="text-ink">{progress.activity}</span>
            <span className="text-muted tabular-nums">
              {" "}
              · 작업 {progress.steps}번째
              {lastAt !== null && ` · ${formatElapsed(now - lastAt)} 전 활동`}
            </span>
          </>
        ) : (
          <span className="text-muted">진행 상황을 불러오는 중이에요.</span>
        )}
      </p>
      {quiet && (
        <p className="text-xs text-warning">
          한동안 움직임이 없어요. 긴 작업 중이거나 멈췄을 수 있어요.
        </p>
      )}
    </section>
  );
};
