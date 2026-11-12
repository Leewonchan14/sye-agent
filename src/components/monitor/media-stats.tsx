"use client";

import { ChevronRight, ExternalLink, Newspaper, UserRound } from "lucide-react";
import { useState } from "react";
import { InView } from "react-intersection-observer";
import useLocalStorageState from "use-local-storage-state";

import { SentimentPill } from "@/components/monitor/tone-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { kst } from "@/lib/kst";
import { useMonitorStats } from "@/lib/monitor/queries";
import {
  SENTIMENT_LABEL,
  STATS_DAYS,
  type MonitorClientView,
  type MonitorMediaStat,
  type MonitorReporterStat,
  type SentimentCounts,
  type StatsDays,
  type StatsScope,
} from "@/lib/monitor/types";
import { cn } from "@/lib/utils";

const SCOPES: { id: StatsScope; label: string; hint: string }[] = [
  {
    id: "included",
    label: "리포트에 넣은 기사",
    hint: "체크해서 리포트에 넣은 기사만 세요.",
  },
  {
    id: "picked",
    label: "AI가 고른 후보 전체",
    hint: "체크를 뺀 기사까지 카테고리로 분류된 후보를 모두 세요.",
  },
];

const ALL = "__all__";
const PAGE = 10;

/** 논조 막대의 순서와 색 — 부정을 맨 앞에 둬 바로 눈에 띄게 한다. */
const SENTIMENT_BAR: { key: keyof SentimentCounts; label: string; tone: string }[] = [
  { key: "negative", label: SENTIMENT_LABEL.negative, tone: "bg-destructive" },
  { key: "neutral", label: SENTIMENT_LABEL.neutral, tone: "bg-muted-foreground" },
  { key: "positive", label: SENTIMENT_LABEL.positive, tone: "bg-success" },
  { key: "unknown", label: "미분류", tone: "bg-muted" },
];

const lastLabel = (iso: string | null) => (iso ? kst(iso).format("M.D") : "—");

const Chip = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    role="radio"
    aria-checked={active}
    onClick={onClick}
    className={cn(
      "rounded-full px-3 py-1.5 text-[12px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
      active && "bg-card text-foreground ring-1 ring-border"
    )}
  >
    {children}
  </button>
);

const Tile = ({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number;
  note?: string;
  tone?: string;
}) => (
  <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-card px-4 py-3">
    <span className="text-[12px] text-muted-foreground">{label}</span>
    <span
      className={cn("font-mono text-2xl font-medium text-foreground tabular-nums", tone)}
    >
      {value.toLocaleString()}
    </span>
    {note && <span className="text-[12px] text-muted-foreground">{note}</span>}
  </div>
);

const SentimentBar = ({ counts }: { counts: SentimentCounts }) => {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return null;
  const parts = SENTIMENT_BAR.filter((p) => counts[p.key] > 0);
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex h-2.5 gap-[2px] overflow-hidden rounded-full"
        role="img"
        aria-label={parts.map((p) => `${p.label} ${counts[p.key]}건`).join(", ")}
      >
        {parts.map((p) => (
          <span
            key={p.key}
            className={cn("h-full first:rounded-l-full last:rounded-r-full", p.tone)}
            style={{ width: `${(counts[p.key] / total) * 100}%` }}
            title={`${p.label} ${counts[p.key]}건 (${Math.round((counts[p.key] / total) * 100)}%)`}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        {SENTIMENT_BAR.map((p) => (
          <li key={p.key} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", p.tone)} aria-hidden />
            {p.label}
            <b className="font-mono font-medium text-foreground tabular-nums">
              {counts[p.key]}
            </b>
          </li>
        ))}
      </ul>
    </div>
  );
};

const CountBar = ({
  count,
  max,
  negative,
}: {
  count: number;
  max: number;
  negative: number;
}) => (
  <span className="flex min-w-0 flex-1 items-center gap-2">
    <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-primary"
        style={{ width: `${(count / max) * 100}%` }}
      />
    </span>
    <span className="w-8 text-right font-mono text-[13px] text-foreground tabular-nums">
      {count}
    </span>
    <span
      className={cn(
        "w-10 text-right font-mono text-[12px] text-muted-foreground tabular-nums",
        negative > 0 && "text-destructive"
      )}
      title="부정 기사"
    >
      {negative > 0 ? `부정 ${negative}` : ""}
    </span>
  </span>
);

/**
 * 목록 끝에 닿으면 다음 PAGE개를 더 그린다. 데이터는 이미 다 받아 두었으니 화면에 그리는 개수만 늘린다.
 * key로 shown을 줘서 한 페이지를 더 그린 뒤에도 sentinel이 여전히 보이면(화면이 길 때) 다시 불리게 한다.
 */
const LoadMoreSentinel = ({
  shown,
  total,
  onMore,
}: {
  shown: number;
  total: number;
  onMore: () => void;
}) =>
  shown < total ? (
    <InView
      key={shown}
      rootMargin="200px"
      onChange={(inView) => inView && onMore()}
      className="flex justify-center py-2"
      aria-hidden
    >
      <Spinner className="size-4 text-muted-foreground" />
    </InView>
  ) : null;

const MediaTable = ({
  media,
  categoryName,
}: {
  media: MonitorMediaStat[];
  categoryName: (key: string) => string;
}) => {
  const [limit, setLimit] = useState(PAGE);
  const max = media[0]?.count ?? 1;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="stats-media">
      <h3
        id="stats-media"
        className="flex items-center gap-1.5 text-sm font-medium text-foreground"
      >
        <Newspaper className="size-4 text-primary" /> 매체별 노출
        <span className="font-mono text-[12px] font-normal text-muted-foreground">
          {media.length}곳
        </span>
      </h3>
      <ol className="overflow-hidden rounded-xl border border-border bg-card">
        {media.slice(0, limit).map((m, i) => (
          <li
            key={m.media}
            className="grid grid-cols-[20px_minmax(0,7.5rem)_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5 border-t border-border/60 px-4 py-2.5 first:border-t-0"
            title={m.categories
              .map((c) => `${categoryName(c.key)} ${c.count}`)
              .join(" · ")}
          >
            <span className="font-mono text-[12px] text-muted-foreground tabular-nums">
              {i + 1}
            </span>
            <span className="truncate text-[14px] font-medium text-foreground">
              {m.media}
            </span>
            <CountBar count={m.count} max={max} negative={m.sentiment.negative} />
            <span className="col-start-2 col-end-4 text-[12px] text-muted-foreground">
              기자 {m.reporters}명 · 최근 {lastLabel(m.lastAt)}
            </span>
          </li>
        ))}
      </ol>
      <LoadMoreSentinel
        shown={limit}
        total={media.length}
        onMore={() => setLimit((l) => l + PAGE)}
      />
    </section>
  );
};

const ReporterRow = ({
  reporter,
  rank,
  max,
  categoryName,
}: {
  reporter: MonitorReporterStat;
  rank: number;
  max: number;
  categoryName: (key: string) => string;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-t border-border/60 first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid w-full grid-cols-[20px_minmax(0,7.5rem)_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5 px-4 py-2.5 text-left hover:bg-muted"
      >
        <span className="font-mono text-[12px] text-muted-foreground tabular-nums">
          {rank}
        </span>
        <span className="flex min-w-0 items-center gap-1 text-[14px] font-medium text-foreground">
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-primary transition-transform",
              open && "rotate-90"
            )}
          />
          <span className="truncate">{reporter.reporter}</span>
        </span>
        <CountBar
          count={reporter.count}
          max={max}
          negative={reporter.sentiment.negative}
        />
        <span className="col-start-2 col-end-4 truncate text-[12px] text-muted-foreground">
          {reporter.media} ·{" "}
          {reporter.categories.map((c) => categoryName(c.key)).join(", ")} · 최근{" "}
          {lastLabel(reporter.lastAt)}
        </span>
      </button>
      {open && (
        <ul className="grid gap-1.5 bg-muted px-4 py-3 pl-11">
          {reporter.articles.map((a) => (
            <li key={a.url} className="flex min-w-0 items-baseline gap-2 text-[13px]">
              <span className="shrink-0 font-mono text-[12px] text-muted-foreground tabular-nums">
                {a.publishedAt ? kst(a.publishedAt).format("MM.DD") : "—"}
              </span>
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate text-foreground hover:underline"
                title={a.title}
              >
                {a.title}
              </a>
              <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
              <SentimentPill sentiment={a.sentiment} hideNeutral />
            </li>
          ))}
          {reporter.count > reporter.articles.length && (
            <li className="text-[12px] text-muted-foreground">
              외 {reporter.count - reporter.articles.length}건
            </li>
          )}
        </ul>
      )}
    </li>
  );
};

const ReporterTable = ({
  reporters,
  noReporter,
  categoryName,
}: {
  reporters: MonitorReporterStat[];
  noReporter: number;
  categoryName: (key: string) => string;
}) => {
  const [limit, setLimit] = useState(PAGE);
  const max = reporters[0]?.count ?? 1;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="stats-reporters">
      <h3
        id="stats-reporters"
        className="flex items-center gap-1.5 text-sm font-medium text-foreground"
      >
        <UserRound className="size-4 text-primary" /> 기자별 보도
        <span className="font-mono text-[12px] font-normal text-muted-foreground">
          {reporters.length}명
        </span>
      </h3>
      {reporters.length ? (
        <ol className="overflow-hidden rounded-xl border border-border bg-card">
          {reporters.slice(0, limit).map((r, i) => (
            <ReporterRow
              key={`${r.reporter}-${r.media}`}
              reporter={r}
              rank={i + 1}
              max={max}
              categoryName={categoryName}
            />
          ))}
        </ol>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          기자를 확인한 기사가 없어요.
        </p>
      )}
      <LoadMoreSentinel
        shown={limit}
        total={reporters.length}
        onMore={() => setLimit((l) => l + PAGE)}
      />
      {noReporter > 0 && (
        <p className="text-[12px] text-muted-foreground">
          기자를 확인하지 못한 기사 {noReporter}건은 빠져 있어요.
        </p>
      )}
    </section>
  );
};

/** 고객사 기사가 어느 매체·기자에게서 나오는지 — 기자 리스트와 보도자료 배포 대상을 고를 때 쓴다. */
export const MediaStats = ({ client }: { client: MonitorClientView }) => {
  const [days, setDays] = useLocalStorageState<StatsDays>("monitor.stats.days", {
    defaultValue: 30,
  });
  const [scope, setScope] = useLocalStorageState<StatsScope>("monitor.stats.scope", {
    defaultValue: "included",
  });
  const [category, setCategory] = useState<string | null>(null);
  const validCategory = client.categories.some((c) => c.key === category)
    ? category
    : null;
  const { data, isLoading, isPlaceholderData, error } = useMonitorStats(client.id, {
    days,
    scope,
    category: validCategory,
  });

  const categoryName = (key: string) =>
    client.categories.find((c) => c.key === key)?.name ?? key;
  const categoryItems = [
    { value: ALL, label: "전체 카테고리" },
    ...client.categories.map((c) => ({ value: c.key, label: c.name })),
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="inline-flex rounded-full bg-muted p-1"
          role="radiogroup"
          aria-label="기간"
        >
          {STATS_DAYS.map((d) => (
            <Chip key={d} active={days === d} onClick={() => setDays(d)}>
              최근 {d}일
            </Chip>
          ))}
        </div>
        <div
          className="inline-flex rounded-full bg-muted p-1"
          role="radiogroup"
          aria-label="집계 범위"
        >
          {SCOPES.map((s) => (
            <Chip key={s.id} active={scope === s.id} onClick={() => setScope(s.id)}>
              {s.label}
            </Chip>
          ))}
        </div>
        <Select
          items={categoryItems}
          value={validCategory ?? ALL}
          onValueChange={(value) => setCategory(value === ALL ? null : String(value))}
        >
          <SelectTrigger size="sm" className="min-w-36 text-[12px]" aria-label="카테고리">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categoryItems.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isPlaceholderData && <Spinner className="size-4" />}
      </div>
      <p className="-mt-3 text-[12px] text-muted-foreground">
        {SCOPES.find((s) => s.id === scope)?.hint} 같은 기사가 여러 날 나와도 한 번만
        세요.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : error || !data ? (
        <p className="py-10 text-center text-sm text-destructive">
          {error?.message ?? "통계를 불러오지 못했어요."}
        </p>
      ) : !data.totals.articles ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-14 text-center text-sm text-muted-foreground">
          최근 {data.days}일 동안 집계할 기사가 없어요.
          {scope === "included" && " 'AI가 고른 후보 전체'로 바꿔 보세요."}
        </p>
      ) : (
        <div
          className={cn(
            "flex flex-col gap-6 transition-opacity",
            isPlaceholderData && "opacity-60"
          )}
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile
              label="기사"
              value={data.totals.articles}
              note={`${kst(data.from).format("M.D")} ~ ${kst(data.to).format("M.D")}`}
            />
            <Tile label="매체" value={data.totals.media} />
            <Tile label="기자" value={data.totals.reporters} />
            <Tile
              label="부정 기사"
              value={data.totals.sentiment.negative}
              note={`전체의 ${Math.round((data.totals.sentiment.negative / data.totals.articles) * 100)}%`}
              tone={data.totals.sentiment.negative > 0 ? "text-destructive" : undefined}
            />
          </div>
          <SentimentBar counts={data.totals.sentiment} />
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <MediaTable
              key={`m-${days}-${scope}-${validCategory}`}
              media={data.media}
              categoryName={categoryName}
            />
            <ReporterTable
              key={`r-${days}-${scope}-${validCategory}`}
              reporters={data.reporters}
              noReporter={data.totals.noReporter}
              categoryName={categoryName}
            />
          </div>
        </div>
      )}
    </div>
  );
};
