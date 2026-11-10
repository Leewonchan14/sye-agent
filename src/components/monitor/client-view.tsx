"use client";

import {
  ArrowUp,
  CircleCheck,
  Copy,
  Inbox,
  Newspaper,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import useLocalStorageState from "use-local-storage-state";

import { ArticleSections } from "@/components/monitor/article-sections";
import { HermesProgress } from "@/components/monitor/hermes-progress";
import { MediaStats } from "@/components/monitor/media-stats";
import { ReportPanel } from "@/components/monitor/report-panel";
import { ReportSteps } from "@/components/monitor/report-steps";
import { RulesPanel } from "@/components/monitor/rules-panel";
import { RunHistory } from "@/components/monitor/run-history";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { kst } from "@/lib/kst";
import { formatUsage } from "@/lib/monitor/progress-stages";
import { useMonitorClient, useMonitorMutations } from "@/lib/monitor/queries";
import { DAILY_COLLECT_REQUEST, nextCollectLabel } from "@/lib/monitor/schedule";
import type { MonitorCategory } from "@/lib/monitor/types";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "articles", label: "기사 선별" },
  { id: "report", label: "리포트 미리보기" },
  { id: "stats", label: "매체·기자 통계" },
  { id: "rules", label: "고객사 규칙" },
] as const;
type Tab = (typeof TABS)[number]["id"];
/** 그날 수집과 상관없는 탭 — 수집 기록·진행 단계를 숨긴다. */
const STANDALONE_TABS: Tab[] = ["stats", "rules"];

const windowLabel = (since: string, until: string) =>
  `${kst(since).format("MM.DD HH:mm")} → ${kst(until).format("MM.DD HH:mm")}`;

/** 앱이 잰 수집 소요 시간 */
const formatMeasured = (sec: number) => {
  if (sec < 60) return "1분 미만 소요";
  const minutes = Math.round(sec / 60);
  return minutes < 60
    ? `약 ${minutes}분 소요`
    : `약 ${Math.floor(minutes / 60)}시간 ${minutes % 60}분 소요`;
};

const LoadingDots = () => (
  <span className="inline-flex gap-[3px]" aria-hidden>
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="size-[5px] animate-pulse rounded-full bg-primary"
        style={{ animationDelay: `${i * 200}ms` }}
      />
    ))}
  </span>
);

export const ClientView = ({ clientId }: { clientId: number }) => {
  const [runId, setRunId] = useState<number | undefined>();
  const [tab, setTab] = useState<Tab>("articles");
  const [request, setRequest] = useState("");
  const [askCategory, setAskCategory] = useState<MonitorCategory | null>(null);
  const { data, isLoading, isPlaceholderData, error } = useMonitorClient(clientId, runId);
  const mutations = useMonitorMutations(clientId);
  const [copiedRuns, setCopiedRuns] = useLocalStorageState<number[]>(
    "monitor.copiedRuns",
    {
      defaultValue: [],
    }
  );

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

  const { client, run, items, runs, collectedToday } = data;
  const leadsIncluded = items.filter(
    (i) => i.category && i.included && (i.isLead || !i.dupGroup)
  ).length;

  const submitAsk = (text: string, category: MonitorCategory | null) => {
    if (!run || !text.trim()) return;
    mutations.askMore.mutate(
      { runId: run.id, category: category?.key, request: text.trim() },
      {
        onSuccess: () => {
          setRequest("");
          setAskCategory(null);
        },
      }
    );
  };

  const onAskMore = (category: MonitorCategory) => {
    setAskCategory(category);
    setRequest(`${category.name} 기사를 더 찾아줘`);
    document.getElementById("monitor-ask")?.focus();
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-[12px] font-medium tracking-[0.12em] text-primary uppercase">
            데일리 모니터링{run && ` · ${kst(run.until).format("YYYY.MM.DD ddd")}`}
          </p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight text-balance text-ink">
            {client.name}{" "}
            {run && !kst(run.until).isSame(kst(), "day")
              ? `${kst(run.until).format("M월 D일")} 기사`
              : "오늘의 기사"}
          </h1>
        </div>
        {run && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="lg" onClick={() => setTab("report")}>
              <Copy /> 리포트 만들기
            </Button>
          </div>
        )}
      </header>

      {!run ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-hairline px-6 py-14 text-center">
          <Newspaper className="size-6 text-primary" />
          <h2 className="text-lg font-medium text-ink">아직 수집 결과가 없어요</h2>
          <p className="max-w-md text-sm text-muted">
            {client.autoCollect
              ? `${nextCollectLabel(client, collectedToday)}에 하치와레가 수집을 시작해요. 끝나면 여기에 기사가 쌓여요.`
              : "매일 자동 수집이 꺼져 있어요. 고객사 규칙에서 켜면 다음 수집 시각부터 모아요."}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              disabled={mutations.collectNow.isPending}
              onClick={() => mutations.collectNow.mutate(client.id)}
            >
              <Sparkles /> 지금 한 번 수집
            </Button>
            <Button variant="outline" onClick={() => setTab("rules")}>
              규칙 먼저 정리하기
            </Button>
          </div>
          {tab === "rules" && (
            <div className="mt-6 w-full text-left">
              <RulesPanel
                key={client.id}
                client={client}
                mutations={mutations}
                collectedToday={collectedToday}
              />
            </div>
          )}
        </div>
      ) : (
        <div
          className={cn(
            "flex flex-col gap-5 transition-opacity",
            isPlaceholderData && "pointer-events-none opacity-60"
          )}
        >
          {!STANDALONE_TABS.includes(tab) && (
            <RunHistory
              runs={runs}
              activeId={runId ?? run.id}
              activeCount={isPlaceholderData ? undefined : leadsIncluded}
              onSelect={setRunId}
            />
          )}
          {!STANDALONE_TABS.includes(tab) && (
            <ReportSteps
              pending={Boolean(run.pendingSince)}
              failed={Boolean(run.lastError) && !items.length}
              tab={tab}
              copied={copiedRuns.includes(run.id)}
              reported={Boolean(run.reportedAt)}
              onGo={setTab}
            />
          )}
          <div
            role="status"
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-hairline bg-canvas-soft px-4 py-3 text-[13px] text-body"
          >
            {run.pendingSince ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-primary">
                <Spinner className="size-3.5" />
                수집 중
              </span>
            ) : run.lastError && !items.length ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-error">
                <TriangleAlert className="size-4" />
                수집 실패
              </span>
            ) : run.reportedAt ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-success">
                <CircleCheck className="size-4" />
                {kst(run.reportedAt).format("HH:mm")} 보고 완료
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                <Inbox className="size-4 text-primary" />
                수집 완료 · 보고 전
              </span>
            )}
            <span className="text-muted">{windowLabel(run.since, run.until)}</span>
            {run.createdAt && (
              <span className="text-muted">
                {kst(run.createdAt).format("MM.DD HH:mm")} 수집 시작
              </span>
            )}
            {run.stats.sources?.map((s) => (
              <span key={s.name}>
                {s.name}{" "}
                <b className="font-mono font-medium text-ink tabular-nums">
                  {s.count.toLocaleString()}
                </b>
              </span>
            ))}
            {run.stats.measuredSec !== undefined && (
              <span className="text-muted">{formatMeasured(run.stats.measuredSec)}</span>
            )}
            {run.stats.usage && (
              <span className="text-muted" title="캐시를 뺀 입력·출력 토큰">
                {formatUsage(run.stats.usage)}
              </span>
            )}
            {run.stats.blocked?.length ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="rounded-full bg-error/10 px-2 py-0.5 text-[11px] font-medium text-error">
                  차단 {run.stats.blocked.length}
                </span>
                {run.stats.blocked.join(" · ")}
              </span>
            ) : null}
          </div>

          {run.pendingSince && (
            <HermesProgress
              key={run.pendingSince}
              kind="run"
              id={run.id}
              since={run.pendingSince}
              title={
                run.pendingRequest === DAILY_COLLECT_REQUEST
                  ? "하치와레가 기사를 모으고 있어요"
                  : "하치와레가 기사를 더 찾고 있어요"
              }
            />
          )}

          <div
            className="flex [scrollbar-width:none] gap-1 overflow-x-auto overflow-y-hidden border-b border-hairline"
            role="tablist"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "-mb-px inline-flex h-10 items-center gap-1.5 border-b-2 border-transparent px-3.5 text-sm whitespace-nowrap text-muted hover:text-ink",
                  tab === t.id && "border-primary font-medium text-ink"
                )}
              >
                {t.label}
                {t.id === "articles" && (
                  <span className="rounded-full bg-canvas-card px-1.5 font-mono text-[11px] text-muted">
                    {leadsIncluded}
                  </span>
                )}
                {t.id === "rules" && (
                  <span className="rounded-full bg-canvas-card px-1.5 font-mono text-[11px] text-muted">
                    {client.rules.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {tab === "articles" && (
            <>
              <ArticleSections
                client={client}
                run={run}
                items={items}
                mutations={mutations}
                onAskMore={onAskMore}
              />

              <div className="sticky bottom-0 -mx-4 border-t border-hairline bg-canvas px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] md:-mx-8 md:px-8">
                <div className="mb-2 flex min-h-5 items-center gap-2 text-[13px] text-muted">
                  {run.pendingSince ? (
                    <>
                      <LoadingDots />
                      하치와레가 찾고 있어요 · {run.pendingRequest}
                    </>
                  ) : run.lastError ? (
                    <span className="inline-flex items-center gap-1.5 text-error">
                      <TriangleAlert className="size-3.5" /> {run.lastError}
                    </span>
                  ) : (
                    <span>요청하면 찾은 기사가 표에 바로 추가돼요</span>
                  )}
                </div>
                <form
                  className="flex items-center gap-2 rounded-xl border border-hairline bg-surface py-1.5 pr-1.5 pl-3.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitAsk(request, askCategory);
                  }}
                >
                  {askCategory && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-medium text-primary">
                      {askCategory.name}
                    </span>
                  )}
                  <input
                    id="monitor-ask"
                    value={request}
                    onChange={(e) => setRequest(e.target.value)}
                    placeholder="예: 업계 이슈를 여행 트렌드 위주로 더 찾아줘"
                    aria-label="하치와레에게 요청하기"
                    className="h-8 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-soft"
                    disabled={Boolean(run.pendingSince)}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    aria-label="보내기"
                    disabled={
                      !request.trim() ||
                      Boolean(run.pendingSince) ||
                      mutations.askMore.isPending
                    }
                  >
                    <ArrowUp />
                  </Button>
                </form>
              </div>
            </>
          )}
          {tab === "report" && (
            <ReportPanel
              client={client}
              run={run}
              items={items}
              mutations={mutations}
              mailReady={data.mailReady}
              onCopied={() => setCopiedRuns((list) => [run.id, ...list].slice(0, 30))}
            />
          )}
          {tab === "stats" && <MediaStats key={client.id} client={client} />}
          {tab === "rules" && (
            <RulesPanel
              key={client.id}
              client={client}
              mutations={mutations}
              collectedToday={collectedToday}
            />
          )}
        </div>
      )}
    </div>
  );
};
