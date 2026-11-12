"use client";

import { ExternalLink, Newspaper, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { SentimentPill } from "@/components/monitor/tone-badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { kst } from "@/lib/kst";
import { useIssueArticles } from "@/lib/monitor/queries";
import type {
  MonitorIssueArticleView,
  MonitorIssueSnapshotView,
} from "@/lib/monitor/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 30;

/** 에이전트가 보낸 주소라 화면에 링크로 걸기 전에 http만 통과시킨다. */
const isWebUrl = (url: string | undefined): url is string =>
  Boolean(url && /^https?:\/\//i.test(url));

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^(www|m)\./, "");
  } catch {
    return url;
  }
};

/** 목록을 저장하기 전에 돈 집계는 같은 구간의 네이버 뉴스 검색으로 대신 보여 준다. 날짜 단위까지만 좁혀진다. */
const naverNewsUrl = (keyword: string, since: string | null, until: string) => {
  const params = new URLSearchParams({ where: "news", query: keyword, sort: "1" });
  if (since) {
    const [from, to] = [kst(since), kst(until)];
    params.set("ds", from.format("YYYY.MM.DD"));
    params.set("de", to.format("YYYY.MM.DD"));
    params.set("nso", `so:dd,p:from${from.format("YYYYMMDD")}to${to.format("YYYYMMDD")}`);
  }
  return `https://search.naver.com/search.naver?${params}`;
};

const ArticleRow = ({ article }: { article: MonitorIssueArticleView }) => (
  <li>
    <a
      href={article.url}
      target="_blank"
      rel="noreferrer"
      className="group flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-muted"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm break-words text-foreground group-hover:underline">
          {article.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{article.media || hostOf(article.url)}</span>
          {article.publishedAt && (
            <span className="font-mono tabular-nums">
              {kst(article.publishedAt).format("MM.DD HH:mm")}
            </span>
          )}
          {article.brandMention && (
            <span className="rounded-full bg-destructive/10 px-1.5 py-px font-medium text-destructive">
              브랜드 언급
            </span>
          )}
          <SentimentPill sentiment={article.sentiment} hideNeutral />
        </span>
      </span>
      <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
    </a>
  </li>
);

type ArticleFilter = "all" | "brand" | "negative";

const ARTICLE_FILTERS: {
  id: ArticleFilter;
  label: string;
  match: (a: MonitorIssueArticleView) => boolean;
}[] = [
  { id: "all", label: "전체", match: () => true },
  { id: "brand", label: "브랜드 언급", match: (a) => a.brandMention },
  { id: "negative", label: "부정", match: (a) => a.sentiment === "negative" },
];

const ArticleList = ({ articles }: { articles: MonitorIssueArticleView[] }) => {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [filter, setFilter] = useState<ArticleFilter>("all");
  const filters = ARTICLE_FILTERS.map((f) => ({
    ...f,
    count: articles.filter(f.match).length,
  })).filter((f) => f.id === "all" || f.count > 0);
  const active = filters.find((f) => f.id === filter) ?? filters[0];
  const shown = articles.filter(active.match);
  const rest = shown.length - visible;

  return (
    <div className="flex flex-col gap-1">
      {filters.length > 1 && (
        <div className="flex flex-wrap gap-1.5 pb-1">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={active.id === f.id}
              onClick={() => {
                setFilter(f.id);
                setVisible(PAGE_SIZE);
              }}
              className={cn(
                "rounded-full border border-border px-2.5 py-1 text-[12px] text-foreground",
                active.id === f.id && "border-primary bg-primary/10 text-primary"
              )}
            >
              {f.label} {f.count}
            </button>
          ))}
        </div>
      )}
      <ul className="-mx-2 divide-y divide-border/60">
        {shown.slice(0, visible).map((a) => (
          <ArticleRow key={a.id} article={a} />
        ))}
      </ul>
      {rest > 0 && (
        <Button
          variant="outline"
          className="mt-2 self-center"
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
        >
          더 보기 ({rest}건 남음)
        </Button>
      )}
    </div>
  );
};

/** 기사 목록이 저장되기 전에 돈 집계 */
const NoSavedList = ({
  snapshot,
  previousAt,
  keywords,
}: {
  snapshot: MonitorIssueSnapshotView;
  previousAt: string | null;
  keywords: string[];
}) => {
  const last = snapshot.lastArticle;
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-muted p-4 text-[13px] text-foreground">
      <p>
        이 집계는 기사 목록을 저장하기 전에 돌아서 {snapshot.added}건의 건수만 남아
        있어요. 같은 기간을 네이버 뉴스에서 볼 수 있어요.
      </p>
      <div className="flex flex-wrap gap-2">
        {keywords.slice(0, 3).map((keyword) => (
          <Button
            key={keyword}
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <a
                href={naverNewsUrl(keyword, previousAt, snapshot.at)}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            {keyword} <ExternalLink />
          </Button>
        ))}
      </div>
      {last?.title && (
        <p className="min-w-0 border-t border-border/60 pt-3 break-words">
          <span className="text-muted-foreground">마지막 기사 · </span>
          {isWebUrl(last.url) ? (
            <a
              href={last.url}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              {last.title}
            </a>
          ) : (
            <span className="text-foreground">{last.title}</span>
          )}
          {last.media && <span className="text-muted-foreground"> · {last.media}</span>}
        </p>
      )}
    </div>
  );
};

const SnapshotArticles = ({
  issueId,
  snapshot,
  previousAt,
  keywords,
}: {
  issueId: number;
  snapshot: MonitorIssueSnapshotView;
  previousAt: string | null;
  keywords: string[];
}) => {
  const saved = snapshot.articleCount > 0;
  const { data, isLoading, error } = useIssueArticles(issueId, snapshot.id, saved);

  if (!saved) {
    return snapshot.added > 0 ? (
      <NoSavedList snapshot={snapshot} previousAt={previousAt} keywords={keywords} />
    ) : (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        이 구간에는 새로 나온 기사가 없었어요.
      </p>
    );
  }
  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }
  if (error || !data) {
    return (
      <p className="inline-flex items-center gap-1.5 py-4 text-sm text-destructive">
        <TriangleAlert className="size-3.5" />
        {error?.message ?? "기사 목록을 불러오지 못했어요."}
      </p>
    );
  }
  return (
    <>
      {data.articles.length !== snapshot.added && (
        <p className="text-xs text-muted-foreground">
          집계 {snapshot.added}건 중 목록이 저장된 {data.articles.length}건을 보여 줘요.
        </p>
      )}
      <ArticleList articles={data.articles} />
    </>
  );
};

/** 집계 시점을 고르면 그때 센 기사를 보여 준다. 왼쪽이 과거, 오른쪽이 최신이다. */
export const IssueArticles = ({
  issueId,
  keywords,
  snapshots,
}: {
  issueId: number;
  keywords: string[];
  snapshots: MonitorIssueSnapshotView[];
}) => {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const index = snapshots.findIndex((s) => s.id === selectedId);
  // 직접 고르지 않았으면 새 집계가 끝날 때 최신으로 따라간다.
  const activeIndex = index >= 0 ? index : snapshots.length - 1;
  const active = snapshots[activeIndex];
  const activeId = active?.id;

  useEffect(() => {
    const rail = railRef.current;
    const chip = rail?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!rail || !chip) return;
    const left = chip.offsetLeft;
    const right = left + chip.offsetWidth;
    if (left < rail.scrollLeft) rail.scrollTo({ left: left - 4 });
    else if (right > rail.scrollLeft + rail.clientWidth) {
      rail.scrollTo({ left: right - rail.clientWidth + 4 });
    }
  }, [activeId]);

  return (
    <section
      id="issue-articles"
      className="flex min-w-0 scroll-mt-4 flex-col gap-3 rounded-xl border border-border bg-card p-5"
    >
      <div>
        <h2 className="flex items-center gap-2 text-[15px] font-medium text-foreground">
          <Newspaper className="size-4 text-primary" /> 집계된 기사
        </h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          집계 시점을 고르면 그때 늘어난 기사를 볼 수 있어요.
        </p>
      </div>
      {active ? (
        <>
          <div
            ref={railRef}
            className="relative -mx-1 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-1 py-0.5"
          >
            {snapshots.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-current={s.id === active.id ? "true" : undefined}
                onClick={() => setSelectedId(s.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[13px] text-foreground",
                  s.id === active.id && "border-primary bg-primary/10 text-primary"
                )}
              >
                {s.label}
                <span className="font-mono text-xs tabular-nums">+{s.added}</span>
              </button>
            ))}
          </div>
          <SnapshotArticles
            key={active.id}
            issueId={issueId}
            snapshot={active}
            previousAt={activeIndex > 0 ? snapshots[activeIndex - 1].at : null}
            keywords={keywords}
          />
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          집계를 한 번 돌리면 여기에 기사가 보여요.
        </p>
      )}
    </section>
  );
};
