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
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  Rectangle,
  XAxis,
  YAxis,
  type BarShapeProps,
} from "recharts";
import { toast } from "sonner";

import { HermesProgress } from "@/components/monitor/hermes-progress";
import { IssueArticles } from "@/components/monitor/issue-articles";
import {
  IssueReportEditor,
  IssueScheduleEditor,
} from "@/components/monitor/schedule-editors";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Spinner } from "@/components/ui/spinner";
import { kst } from "@/lib/kst";
import { formatUsage } from "@/lib/monitor/progress-stages";
import { useIssueMutations, useMonitorIssue } from "@/lib/monitor/queries";
import type { MonitorIssueSnapshotView } from "@/lib/monitor/types";
import { cn } from "@/lib/utils";

const snapshotChartConfig = {
  added: { label: "추가", color: "var(--primary)" },
  cumulative: { label: "누적", color: "var(--foreground)" },
} satisfies ChartConfig;

/** 보고 시점별 추가 건수(막대) + 누적(점선). 누적은 오른쪽 숨은 축을 따로 쓴다. */
const SnapshotChart = ({ snapshots }: { snapshots: MonitorIssueSnapshotView[] }) => {
  const data = snapshots.map((snapshot, index) => ({
    label: snapshot.label,
    added: snapshot.added,
    cumulative: snapshots.slice(0, index + 1).reduce((sum, s) => sum + s.added, 0),
  }));
  const lastIndex = data.length - 1;

  return (
    <ChartContainer
      config={snapshotChartConfig}
      role="img"
      aria-label="보고 시점별 추가 기사 수와 누적 기사 수"
      className="aspect-auto h-[240px] w-full min-w-[480px]"
    >
      <ComposedChart data={data} margin={{ top: 24, right: 56, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={12}
          fontSize={11.5}
        />
        <YAxis
          yAxisId="added"
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          width={44}
          fontSize={11}
          className="font-mono"
        />
        <YAxis yAxisId="cumulative" orientation="right" hide domain={[0, "dataMax"]} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar
          yAxisId="added"
          dataKey="added"
          radius={3}
          maxBarSize={48}
          isAnimationActive={false}
          shape={(props: BarShapeProps) => (
            <Rectangle
              {...props}
              // 마지막 보고만 진하게, 이전 보고는 옅게 보여 준다.
              fill={
                props.index === lastIndex
                  ? "var(--color-added)"
                  : "color-mix(in oklab, var(--color-added) 35%, transparent)"
              }
            />
          )}
        >
          <LabelList
            dataKey="added"
            position="top"
            fontSize={12}
            fill="var(--foreground)"
            className="font-mono"
          />
        </Bar>
        <Line
          yAxisId="cumulative"
          dataKey="cumulative"
          type="linear"
          stroke="var(--color-cumulative)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          isAnimationActive={false}
          dot={({ cx, cy, index }) => (
            <circle
              key={index}
              cx={cx}
              cy={cy}
              r={index === lastIndex ? 4 : 2.5}
              fill="var(--color-cumulative)"
            />
          )}
        >
          <LabelList
            dataKey="cumulative"
            content={({ x, y, index, value }) =>
              index === lastIndex ? (
                <text
                  x={Number(x) + 8}
                  y={Number(y) + 4}
                  fontSize={11.5}
                  fill="var(--color-cumulative)"
                  className="font-mono"
                >
                  누적 {value}
                </text>
              ) : null
            }
          />
        </Line>
      </ComposedChart>
    </ChartContainer>
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
      <p className="py-10 text-center text-sm text-destructive">
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
          <h1 className="mt-1 text-2xl font-medium tracking-tight text-balance text-foreground">
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
              <Sparkles /> 늘어난 기사 수 확인
            </Button>
            <Button size="lg" disabled={pending} onClick={() => recount.mutate(true)}>
              <FileText /> 보고 초안 만들기
            </Button>
          </div>
          <div className="text-xs text-muted-foreground md:text-right">
            <p>
              <b className="font-medium text-foreground">늘어난 기사 수 확인</b>:
              에이전트가 직전 보고 이후 새 기사 수를 세서 아래에 +N건으로 알려 줘요. 몇 분
              걸려요.
            </p>
            <p>
              <b className="font-medium text-foreground">보고 초안 만들기</b>: 같은 건수를
              그래프에 쌓고 보고 초안까지 써요.
            </p>
          </div>
        </div>
      </header>

      <div
        role="status"
        className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-muted px-4 py-3 text-[13px] text-foreground"
      >
        {pending ? (
          <span className="inline-flex items-center gap-2 font-medium text-primary">
            <Spinner className="size-3.5" /> 에이전트가 집계하고 있어요
          </span>
        ) : issue.lastError ? (
          <span className="inline-flex items-center gap-1.5 text-destructive">
            <TriangleAlert className="size-3.5" /> {issue.lastError}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <Siren className="size-4 text-primary" />{" "}
            {issue.isActive ? "감시 중" : "감시 종료"}
          </span>
        )}
        {latest && (
          <span>
            마지막 집계{" "}
            <b className="font-mono font-medium text-foreground">
              {kst(latest.at).format("MM.DD HH:mm")}
            </b>
          </span>
        )}
        {latest?.lastArticle?.media && (
          <span>
            마지막 기사{" "}
            <b className="font-medium text-foreground">{latest.lastArticle.media}</b>{" "}
            {latest.lastArticle.time}
          </span>
        )}
        {latest?.usage && (
          <span className="text-muted-foreground" title="캐시를 뺀 입력·출력 토큰">
            {formatUsage(latest.usage)}
          </span>
        )}
        {latest && !latest.isReport && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-medium text-primary">
            직전 보고 이후 +{latest.added}건
          </span>
        )}
        {latest && (
          <button
            type="button"
            onClick={() =>
              document
                .getElementById("issue-articles")
                ?.scrollIntoView({ behavior: "smooth" })
            }
            className="text-[13px] font-medium text-primary underline-offset-4 hover:underline"
          >
            기사 보기
          </button>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => updateIssue.mutate({ isActive: !issue.isActive })}
          className="text-[12px] text-muted-foreground underline-offset-4 hover:underline"
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
          title="에이전트가 보도량을 집계하고 있어요"
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
        <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <h2 className="text-[15px] font-medium text-foreground">
            보고 시점별 추가 기사
          </h2>
          <p className="text-[13px] text-muted-foreground">
            막대는 직전 보고 이후 추가된 건수, 점선은 누적이에요.
          </p>
          {reports.length ? (
            <div className="overflow-x-auto">
              <SnapshotChart snapshots={reports} />
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              보고 초안 만들기를 한 번 돌리면 여기에 막대가 생겨요.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-medium text-foreground">
            <BellRing className="size-4 text-primary" /> 브랜드 언급 감시
          </h2>
          <span
            className={cn(
              "inline-flex w-fit items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[12px] font-medium text-success",
              mentions > 0 && "bg-destructive/10 text-destructive"
            )}
          >
            {mentions > 0 ? (
              <TriangleAlert className="size-3" />
            ) : (
              <CircleCheck className="size-3" />
            )}
            {mentions > 0 ? "언급 발생" : "이상 없음"}
          </span>
          <p className="text-4xl font-medium tracking-tight text-foreground tabular-nums">
            {mentions}
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">
              건 / 누적 {total}건 중
            </span>
          </p>
          <ul className="divide-y divide-border/60 text-sm">
            {issue.brandTerms.map((t) => (
              <li key={t} className="py-2 text-foreground">
                {t}
              </li>
            ))}
          </ul>
          {issue.keywords.length > 0 && (
            <p className="text-[12px] text-muted-foreground">
              검색어 · {issue.keywords.join(", ")}
            </p>
          )}
        </section>
      </div>

      <IssueArticles
        issueId={issue.id}
        keywords={issue.keywords.length ? issue.keywords : [issue.title]}
        snapshots={snapshots}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <h2 className="text-[15px] font-medium text-foreground">주요 흐름</h2>
          {issue.events.length ? (
            <ol className="flex flex-col">
              {issue.events.map((e, i) => (
                <li
                  key={`${e.at}-${i}`}
                  className="relative grid grid-cols-[96px_12px_minmax(0,1fr)] gap-3 pb-3.5 last:pb-0"
                >
                  <span className="pt-0.5 font-mono text-[12px] text-muted-foreground">
                    {e.at}
                  </span>
                  <span
                    className={cn(
                      "relative z-10 mt-1.5 size-2.5 rounded-full border-2 border-primary bg-background",
                      e.key && "bg-primary"
                    )}
                  />
                  {i < issue.events.length - 1 && (
                    <span className="absolute top-4 bottom-0 left-[113px] w-px bg-border" />
                  )}
                  <span
                    className={cn(
                      "text-sm text-foreground",
                      e.key && "font-medium text-foreground"
                    )}
                  >
                    {e.text}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">
              집계하면서 에이전트가 중요한 흐름을 여기에 남겨요.
            </p>
          )}
        </section>

        <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-medium text-foreground">
              보고 초안
              {latestReport && (
                <span className="ml-2 text-[12px] font-normal text-muted-foreground">
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
            <pre className="max-h-96 overflow-y-auto rounded-lg bg-muted p-4 font-sans text-[13px] leading-6 whitespace-pre-wrap text-foreground">
              {latestReport.reportText}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              보고 초안 만들기를 돌리면 초안이 생겨요.
            </p>
          )}
        </section>
      </div>
    </div>
  );
};
