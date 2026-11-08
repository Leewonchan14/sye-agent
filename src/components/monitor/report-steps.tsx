"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

type Destination = "articles" | "report";

/** 하루 일의 순서 — 지금 단계를 강조하고, 누르면 그 화면으로 간다. */
export const ReportSteps = ({
  pending,
  failed,
  tab,
  copied,
  reported,
  onGo,
}: {
  pending: boolean;
  failed: boolean;
  tab: string;
  copied: boolean;
  reported: boolean;
  onGo: (destination: Destination) => void;
}) => {
  const current =
    pending || failed ? 0 : reported ? 4 : copied ? 3 : tab === "report" ? 2 : 1;

  const steps: { label: string; go: Destination }[] = [
    { label: pending ? "수집 중" : failed ? "수집 실패" : "수집 완료", go: "articles" },
    { label: "기사 고르기", go: "articles" },
    { label: "리포트 복사", go: "report" },
    { label: "보고 완료", go: "report" },
  ];
  const hint = pending
    ? "하치와레가 기사를 모으고 있어요. 끝나면 여기에 쌓여요."
    : failed
      ? "수집이 실패했어요. 아래 입력창으로 다시 요청할 수 있어요."
      : reported
        ? "오늘 보고를 마쳤어요."
        : copied
          ? "고객사에 보냈다면 리포트 미리보기에서 '보고 완료로 표시'를 눌러 주세요."
          : tab === "report"
            ? "내용을 확인하고 '리포트 복사'를 눌러 고객사에 보내 주세요."
            : "보낼 기사를 체크하고, 다 고르면 리포트 복사로 넘어가세요.";

  return (
    <nav aria-label="보고 순서" className="flex flex-col gap-1.5">
      <ol className="grid grid-cols-4 gap-1.5">
        {steps.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={step.label}>
              <button
                type="button"
                aria-current={active ? "step" : undefined}
                onClick={() => onGo(step.go)}
                className={cn(
                  "flex h-full w-full flex-col items-center gap-1 rounded-lg border border-hairline bg-surface px-1 py-2 text-[12px] text-muted transition-colors outline-none hover:bg-canvas-soft focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex-row sm:justify-center sm:gap-1.5 sm:text-[13px]",
                  done && "text-success",
                  active &&
                    "border-primary bg-primary/10 font-medium text-ink hover:bg-primary/10",
                  active && failed && "border-error bg-error/10"
                )}
              >
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-full bg-canvas-strong text-[10px] tabular-nums",
                    done && "bg-success/15",
                    active && "bg-primary text-surface"
                  )}
                >
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                <span className="text-center break-keep">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="text-[13px] text-body" aria-live="polite">
        {hint}
      </p>
    </nav>
  );
};
