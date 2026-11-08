"use client";

import { kst } from "@/lib/kst";
import type {
  MonitorClientSummary,
  MonitorIssueSummary,
  MonitorOverview,
} from "@/lib/monitor/types";
import { cn } from "@/lib/utils";

type Tone = "todo" | "done" | "busy" | "bad" | "idle";

const TONE_TEXT: Record<Tone, string> = {
  todo: "font-medium text-primary",
  done: "text-success",
  busy: "text-primary",
  bad: "text-error",
  idle: "text-muted",
};

const nextLabel = (iso: string) => {
  const at = kst(iso);
  return at.isSame(kst(), "day")
    ? `오늘 ${at.format("HH:mm")}`
    : at.format("M.D (dd) HH:mm");
};

const clientStatus = (client: MonitorClientSummary): { text: string; tone: Tone } => {
  const run = client.latestRun;
  if (run?.pending) return { text: "수집 중", tone: "busy" };
  if (run && kst(run.until).isSame(kst(), "day")) {
    if (run.failed) return { text: "수집 실패", tone: "bad" };
    return run.reportedAt
      ? { text: "오늘 보고 완료", tone: "done" }
      : { text: `보고 전 · ${run.includedCount}건`, tone: "todo" };
  }
  return client.nextCollectAt
    ? { text: `다음 수집 ${nextLabel(client.nextCollectAt)}`, tone: "idle" }
    : { text: "자동 수집 꺼짐", tone: "idle" };
};

const issueStatus = (issue: MonitorIssueSummary): { text: string; tone: Tone } =>
  issue.pending
    ? { text: "집계 중", tone: "busy" }
    : {
        text: issue.nextCollectAt
          ? `다음 집계 ${nextLabel(issue.nextCollectAt)}`
          : "감시 종료",
        tone: issue.brandMentions > 0 ? "bad" : "idle",
      };

/** 첫 화면 요약 — 고객사와 이슈를 하나씩 열지 않아도 오늘 할 일이 보인다. */
export const TodayBoard = ({
  overview,
  isSelected,
  onSelectClient,
  onSelectIssue,
}: {
  overview: MonitorOverview;
  isSelected: (kind: "client" | "issue", id: number) => boolean;
  onSelectClient: (id: number) => void;
  onSelectIssue: (id: number) => void;
}) => {
  const issues = overview.issues.filter((i) => i.isActive);
  const statuses = overview.clients.map(clientStatus);
  const todo = statuses.filter((s) => s.tone === "todo").length;
  if (!overview.clients.length && !issues.length) return null;

  const card = (active: boolean, needsAction: boolean) =>
    cn(
      "flex w-[172px] shrink-0 flex-col gap-0.5 rounded-xl border border-hairline bg-surface px-3 py-2.5 text-left transition-colors outline-none hover:bg-canvas-soft focus-visible:ring-3 focus-visible:ring-ring/50",
      needsAction && "border-primary/50",
      active && "bg-canvas-card"
    );

  return (
    <section aria-label="오늘 요약" className="flex flex-col gap-2">
      <h2 className="text-[13px] font-medium text-body">
        오늘 할 일
        <span className="ml-1.5 font-normal text-muted">
          {todo ? `보고 전 ${todo}곳` : "보고할 곳 없음"}
        </span>
      </h2>
      <div className="-m-1 flex [scrollbar-width:none] gap-2 overflow-x-auto p-1">
        {overview.clients.map((client, i) => (
          <button
            key={`c-${client.id}`}
            type="button"
            className={card(isSelected("client", client.id), statuses[i].tone === "todo")}
            onClick={() => onSelectClient(client.id)}
          >
            <span className="truncate text-sm font-medium text-ink">{client.name}</span>
            <span
              className={cn("truncate text-xs tabular-nums", TONE_TEXT[statuses[i].tone])}
            >
              {statuses[i].text}
            </span>
          </button>
        ))}
        {issues.map((issue) => {
          const status = issueStatus(issue);
          return (
            <button
              key={`i-${issue.id}`}
              type="button"
              className={card(isSelected("issue", issue.id), false)}
              onClick={() => onSelectIssue(issue.id)}
            >
              <span className="truncate text-sm font-medium text-ink">{issue.title}</span>
              <span
                className={cn("truncate text-xs tabular-nums", TONE_TEXT[status.tone])}
              >
                {status.text}
              </span>
              <span className="truncate text-xs text-muted tabular-nums">
                누적 {issue.totalAdded.toLocaleString()}건 · 언급 {issue.brandMentions}건
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
