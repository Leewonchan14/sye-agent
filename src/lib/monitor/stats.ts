import type {
  MonitorMediaStat,
  MonitorReporterStat,
  MonitorStatsArticle,
  MonitorStatsPayload,
  SentimentCounts,
} from "@/lib/monitor/types";

/** 기사 한 건 — 같은 기사가 여러 수집에 나와도 한 번만 센다. */
export interface StatsRow extends MonitorStatsArticle {
  articleId: number;
}

const emptySentiment = (): SentimentCounts => ({
  positive: 0,
  neutral: 0,
  negative: 0,
  unknown: 0,
});

/**
 * 기자 표기를 이름 하나로 맞춘다. "홍길동 기자", "홍길동 기자 (hong@x.com)",
 * "홍길동·김철수 기자"처럼 들어오면 첫 이름만 남긴다. 이름으로 볼 수 없으면 null.
 */
export const normalizeReporter = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const name = value
    .replace(/\S+@\S+/g, " ")
    .replace(/[()[\]<>]/g, " ")
    .split(/[·,/|]| 및 /)[0]
    .replace(
      /\s*(선임|수석|객원|인턴)?\s*(기자|특파원|에디터|칼럼니스트|PD)(\s.*)?$/u,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
  if (!name || name.length > 20) return null;
  return name;
};

const newest = (a: string | null, b: string | null) => {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
};

const byPublishedDesc = (a: MonitorStatsArticle, b: MonitorStatsArticle) =>
  (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");

const countCategories = (rows: StatsRow[]) => {
  const counts = new Map<string, number>();
  rows.forEach((r) => {
    if (r.category) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  });
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
};

const sentimentOf = (rows: StatsRow[]) => {
  const counts = emptySentiment();
  rows.forEach((r) => {
    counts[r.sentiment ?? "unknown"] += 1;
  });
  return counts;
};

const groupBy = <K>(rows: StatsRow[], key: (row: StatsRow) => K | null) => {
  const groups = new Map<K, StatsRow[]>();
  rows.forEach((row) => {
    const k = key(row);
    if (k === null) return;
    const list = groups.get(k);
    if (list) list.push(row);
    else groups.set(k, [row]);
  });
  return groups;
};

/** 많이 보도한 순, 같으면 최근에 보도한 순 */
const byCountThenRecent = <T extends { count: number; lastAt: string | null }>(
  a: T,
  b: T
) => b.count - a.count || (b.lastAt ?? "").localeCompare(a.lastAt ?? "");

export const aggregateStats = (
  input: Omit<MonitorStatsPayload, "totals" | "media" | "reporters">,
  rows: StatsRow[]
): MonitorStatsPayload => {
  // 같은 기사가 여러 수집에 들어 있으면 한 번만 센다.
  const unique = [...new Map(rows.map((r) => [r.articleId, r])).values()].map((r) => ({
    ...r,
    reporter: normalizeReporter(r.reporter),
  }));

  const media: MonitorMediaStat[] = [...groupBy(unique, (r) => r.media).entries()]
    .map(([name, list]) => ({
      media: name,
      count: list.length,
      sentiment: sentimentOf(list),
      reporters: new Set(list.map((r) => r.reporter).filter(Boolean)).size,
      lastAt: list.reduce<string | null>((acc, r) => newest(acc, r.publishedAt), null),
      categories: countCategories(list),
    }))
    .sort(byCountThenRecent);

  // 동명이인을 섞지 않도록 기자는 매체와 함께 묶는다.
  const reporters: MonitorReporterStat[] = [
    ...groupBy(unique, (r) => (r.reporter ? `${r.reporter}\u0000${r.media}` : null)),
  ]
    .map(([, list]) => ({
      reporter: list[0].reporter!,
      media: list[0].media,
      count: list.length,
      sentiment: sentimentOf(list),
      lastAt: list.reduce<string | null>((acc, r) => newest(acc, r.publishedAt), null),
      categories: countCategories(list),
      articles: [...list]
        .sort(byPublishedDesc)
        .slice(0, 5)
        .map((r) => ({
          url: r.url,
          title: r.title,
          media: r.media,
          reporter: r.reporter,
          publishedAt: r.publishedAt,
          category: r.category,
          sentiment: r.sentiment,
        })),
    }))
    .sort(byCountThenRecent);

  return {
    ...input,
    totals: {
      articles: unique.length,
      media: media.length,
      reporters: reporters.length,
      noReporter: unique.filter((r) => !r.reporter).length,
      sentiment: sentimentOf(unique),
    },
    media,
    reporters,
  };
};
