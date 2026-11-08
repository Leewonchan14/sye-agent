"use client";

import {
  BellRing,
  CircleCheck,
  Copy,
  FileText,
  Siren,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { HermesProgress } from "@/components/monitor/hermes-progress";
import {
  IssueReportEditor,
  IssueScheduleEditor,
} from "@/components/monitor/schedule-editors";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { kst } from "@/lib/kst";
import { formatUsage } from "@/lib/monitor/progress-stages";
import { useIssueMutations, useMonitorIssue } from "@/lib/monitor/queries";
import type { MonitorIssueSnapshotView } from "@/lib/monitor/types";
import { cn } from "@/lib/utils";

/** 보고 시점별 추가 건수(막대) + 누적(점선). 눈금은 데이터 최대값에 맞춰 반올림한다. */
const SnapshotChart = ({ snapshots }: { snapshots: MonitorIssueSnapshotView[] }) => {
  const W = 640;
  const H = 240;
  const L = 44;
  const R = 56;
  const T = 24;
  const B = 36;
  const maxAdded = Math.max(...snapshots.map((s) => s.added), 1);
  const step = Math.pow(10, Math.floor(Math.log10(maxAdded)));
  const top = Math.ceil(maxAdded / step) * step;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => Math.round(top * r));
  const bw = (W - L - R) / snapshots.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);

  const cumulative = snapshots.map((_, i) =>
    snapshots.slice(0, i + 1).reduce((sum, s) => sum + s.added, 0)
  );
  const running = cumulative.at(-1) ?? 0;
  const cTop = Math.max(running, 1);
  const yc = (v: number) => T + (H - T - B) * (1 - v / cTop);
  const cx = (i: number) => L + bw * i + bw / 2;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="보고 시점별 추가 기사 수와 누적 기사 수"
      className="block h-auto w-full min-w-[480px]"
    >
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={L}
            x2={W - R}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--color-hairline)"
            strokeWidth={1}
          />
          <text
            x={L - 8}
            y={y(t) + 4}
            textAnchor="end"
            fontSize={11}
            fill="var(--color-muted-soft)"
            className="font-mono"
          >
            {t}
          </text>
        </g>
      ))}
      {snapshots.map((s, i) => {
        const w = bw * 0.56;
        const x = cx(i) - w / 2;
        const last = i === snapshots.length - 1;
        return (
          <g key={s.id}>
            <rect
              x={x}
              y={y(s.added)}
              width={w}
              height={Math.max(0, y(0) - y(s.added))}
              rx={3}
              fill={
                last
                  ? "var(--color-primary)"
                  : "color-mix(in oklab, var(--color-primary) 35%, transparent)"
              }
            />
            <text
              x={cx(i)}
              y={y(s.added) - 6}
              textAnchor="middle"
              fontSize={12}
              fill="var(--color-ink)"
              className="font-mono"
            >
              {s.added}
            </text>
            <text
              x={cx(i)}
              y={H - B + 18}
              textAnchor="middle"
              fontSize={11.5}
              fill="var(--color-body)"
            >
              {s.label}
            </text>
          </g>
        );
      })}
      <polyline
        points={cumulative.map((v, i) => `${cx(i)},${yc(v)}`).join(" ")}
        fill="none"
        stroke="var(--color-body)"
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
      {cumulative.map((v, i) => (
        <circle
          key={i}
          cx={cx(i)}
          cy={yc(v)}
          r={i === cumulative.length - 1 ? 4 : 2.5}
          fill="var(--color-body)"
        />
      ))}
      <text
        x={cx(cumulative.length - 1) + 8}
        y={yc(running) + 4}
        fontSize={11.5}
        fill="var(--color-body)"
        className="font-mono"
      >
        누적 {running}
      </text>
    </svg>
  );
};

export const IssueView = ({ issueId }: { issueId: number }) => {
  const { data, isLoading, error } = useMonitorIssue(issueId);
  const { recount, updateIssue } = useIssueMutations(issueId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (error || !data) {
    return (
      <p className="py-10 text-center text-sm text-error">
        {error?.message ?? "불러오지 못했어요."}
      </p>
    );
  }

  const { issue, snapshots } = data;
  const reports = snapshots.filter((s) => s.isReport);
  const latest = snapshots.at(-1);
  const latestReport = reports.at(-1);
  const total = reports.reduce((sum, s) => sum + s.added, 0);
  const mentions = reports.reduce((sum, s) => sum + s.brandMentions, 0);
  const pending = Boolean(issue.pendingSince);

  const copyDraft = async () => {
    if (!latestReport?.reportText) return;
    try {
      await navigator.clipboard.writeText(latestReport.reportText);
      toast.success("보고 초안을 복사했어요.");
    } catch {
      toast.error("복사하지 못했어요. 텍스트를 직접 선택해 주세요.");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-[12px] font-medium tracking-[0.12em] text-primary uppercase">
            이슈 트래커{issue.clientName && ` · ${issue.clientName}`}
          </p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight text-balance text-ink">
            {issue.title} 보도 추이
          </h1>
        </div>
        <div className="flex flex-col gap-2 md:items-end">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="lg"
              disabled={pending}
              onClick={() => recount.mutate(false)}
            >
              <Sparkles /> 건수만 확인
            </Button>
            <Button size="lg" disabled={pending} onClick={() => recount.mutate(true)}>
              <FileText /> 보고 초안 만들기
            </Button>
          </div>
          <div className="text-xs text-muted md:text-right">
            <p>
              <b className="font-medium text-body">건수만 확인</b>: 하치와레가 직전 보고
              이후 새 기사 수를 세서 아래에 +N건으로 알려 줘요. 몇 분 걸려요.
            </p>
            <p>
              <b className="font-medium text-body">보고 초안 만들기</b>: 같은 건수를
              그래프에 쌓고 보고 초안까지 써요.
            </p>
          </div>
        </div>
      </header>

      <div
        role="status"
        className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-hairline bg-canvas-soft px-4 py-3 text-[13px] text-body"
      >
        {pending ? (
          <span className="inline-flex items-center gap-2 font-medium text-primary">
            <Spinner className="size-3.5" /> 하치와레가 집계하고 있어요
          </span>
        ) : issue.lastError ? (
          <span className="inline-flex items-center gap-1.5 text-error">
            <TriangleAlert className="size-3.5" /> {issue.lastError}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 font-medium text-ink">
            <Siren className="size-4 text-primary" />{" "}
            {issue.isActive ? "감시 중" : "감시 종료"}
          </span>
        )}
        {latest && (
          <span>
            마지막 집계{" "}
            <b className="font-mono font-medium text-ink">
              {kst(latest.at).format("MM.DD HH:mm")}
            </b>
          </span>
        )}
        {latest?.lastArticle?.media && (
          <span>
            마지막 기사 <b className="font-medium text-ink">{latest.lastArticle.media}</b>{" "}
            {latest.lastArticle.time}
          </span>
        )}
        {latest?.usage && (
          <span className="text-muted" title="캐시를 뺀 입력·출력 토큰">
            {formatUsage(latest.usage)}
          </span>
        )}
        {latest && !latest.isReport && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-medium text-primary">
            직전 보고 이후 +{latest.added}건
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => updateIssue.mutate({ isActive: !issue.isActive })}
          className="text-[12px] text-muted underline-offset-4 hover:underline"
        >
          {issue.isActive ? "감시 끝내기" : "다시 감시하기"}
        </button>
      </div>

      {issue.pendingSince && (
        <HermesProgress
          key={issue.pendingSince}
          kind="issue"
          id={issue.id}
          since={issue.pendingSince}
          title="하치와레가 보도량을 집계하고 있어요"
        />
      )}

      {issue.isActive && (
        <IssueScheduleEditor
          key={`${issue.collectStart}-${issue.collectGapMinutes}`}
          schedule={issue}
          saving={updateIssue.isPending}
          onSave={(schedule) =>
            updateIssue.mutate(schedule, {
              onSuccess: () => toast.success("자동 집계 일정을 저장했어요."),
            })
          }
        />
      )}

      <IssueReportEditor
        key={`${issue.reportRecipient}-${issue.reportTemplate}`}
        recipient={issue.reportRecipient}
        template={issue.reportTemplate}
        saving={updateIssue.isPending}
        onSave={(report) =>
          updateIssue.mutate(report, {
            onSuccess: () => toast.success("보고 서식을 저장했어요."),
          })
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-hairline bg-surface p-5">
          <h2 className="text-[15px] font-medium text-ink">보고 시점별 추가 기사</h2>
          <p className="text-[13px] text-muted">
            막대는 직전 보고 이후 추가된 건수, 점선은 누적이에요.
          </p>
          {reports.length ? (
            <div className="overflow-x-auto">
              <SnapshotChart snapshots={reports} />
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-hairline px-4 py-10 text-center text-sm text-muted">
              보고 초안 만들기를 한 번 돌리면 여기에 막대가 생겨요.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-medium text-ink">
            <BellRing className="size-4 text-primary" /> 브랜드 언급 감시
          </h2>
          <span
            className={cn(
              "inline-flex w-fit items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[12px] font-medium text-success",
              mentions > 0 && "bg-error/10 text-error"
            )}
          >
            {mentions > 0 ? (
              <TriangleAlert className="size-3" />
            ) : (
              <CircleCheck className="size-3" />
            )}
            {mentions > 0 ? "언급 발생" : "이상 없음"}
          </span>
          <p className="text-4xl font-medium tracking-tight text-ink tabular-nums">
            {mentions}
            <span className="ml-1.5 text-sm font-normal text-muted">
              건 / 누적 {total}건 중
            </span>
          </p>
          <ul className="divide-y divide-hairline/60 text-sm">
            {issue.brandTerms.map((t) => (
              <li key={t} className="py-2 text-body">
                {t}
              </li>
            ))}
          </ul>
          {issue.keywords.length > 0 && (
            <p className="text-[12px] text-muted">검색어 · {issue.keywords.join(", ")}</p>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface p-5">
          <h2 className="text-[15px] font-medium text-ink">주요 흐름</h2>
          {issue.events.length ? (
            <ol className="flex flex-col">
              {issue.events.map((e, i) => (
                <li
                  key={`${e.at}-${i}`}
                  className="relative grid grid-cols-[96px_12px_minmax(0,1fr)] gap-3 pb-3.5 last:pb-0"
                >
                  <span className="pt-0.5 font-mono text-[12px] text-muted">{e.at}</span>
                  <span
                    className={cn(
                      "relative z-10 mt-1.5 size-2.5 rounded-full border-2 border-primary bg-canvas",
                      e.key && "bg-primary"
                    )}
                  />
                  {i < issue.events.length - 1 && (
                    <span className="absolute top-4 bottom-0 left-[113px] w-px bg-hairline" />
                  )}
                  <span
                    className={cn("text-sm text-body", e.key && "font-medium text-ink")}
                  >
                    {e.text}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">
              집계하면서 하치와레가 중요한 흐름을 여기에 남겨요.
            </p>
          )}
        </section>

        <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-hairline bg-surface p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-medium text-ink">
              보고 초안
              {latestReport && (
                <span className="ml-2 text-[12px] font-normal text-muted">
                  {kst(latestReport.at).format("MM.DD HH:mm")} 기준
                </span>
              )}
            </h2>
            <Button
              variant="outline"
              size="sm"
              disabled={!latestReport?.reportText}
              onClick={copyDraft}
            >
              <Copy /> 복사
            </Button>
          </div>
          {latestReport?.reportText ? (
            <pre className="max-h-96 overflow-y-auto rounded-lg bg-canvas-soft p-4 font-sans text-[13px] leading-6 whitespace-pre-wrap text-ink">
              {latestReport.reportText}
            </pre>
          ) : (
            <p className="text-sm text-muted">보고 초안 만들기를 돌리면 초안이 생겨요.</p>
          )}
        </section>
      </div>
    </div>
  );
};
