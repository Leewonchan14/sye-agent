import { z } from "zod";

/**
 * 모니터링 대시보드에서 클라이언트·서버·Hermes가 함께 쓰는 타입과 검증 스키마.
 * DB 모듈을 import하지 않으므로 클라이언트 컴포넌트에서도 안전하게 쓸 수 있다.
 */

export const monitorCategorySchema = z.object({
  key: z.string().min(1).max(40),
  name: z.string().min(1).max(60),
  /** 최소 건수. null이면 "전수 집계" 섹션(자사 보도 등) */
  goal: z.number().int().min(0).max(100).nullable(),
  /** 리포트에 담을 최대 건수(점수 순). 비우면 제한 없음 */
  maxItems: z.number().int().min(1).max(100).nullable().optional(),
  subs: z.array(z.string().min(1).max(40)).max(12).optional(),
});
export type MonitorCategory = z.infer<typeof monitorCategorySchema>;

export const monitorRuleSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().min(1).max(80),
  /** 이 규칙이 나온 채팅 원문 */
  quote: z.string().max(400).default(""),
  /**
   * toggle 켜고 끄기 · number 숫자 · tags 목록 · text 문장
   * period 수집 시간대("전일 09:00 ~ 당일 09:00") · date 날짜("2026-11-07")
   */
  kind: z.enum(["toggle", "number", "tags", "text", "period", "date"]),
  value: z.union([
    z.boolean(),
    z.number(),
    z.array(z.string().max(80)).max(60),
    z.string().max(400),
  ]),
});
export type MonitorRule = z.infer<typeof monitorRuleSchema>;
export type MonitorRuleKind = MonitorRule["kind"];

/** 고객사 입장에서 본 기사 논조 */
export const SENTIMENTS = ["positive", "neutral", "negative"] as const;
export type MonitorSentiment = (typeof SENTIMENTS)[number];
export const sentimentSchema = z.enum(SENTIMENTS);

/** 고객사에 미칠 영향 */
export const IMPORTANCES = ["high", "normal", "low"] as const;
export type MonitorImportance = (typeof IMPORTANCES)[number];
export const importanceSchema = z.enum(IMPORTANCES);

export const SENTIMENT_LABEL: Record<MonitorSentiment, string> = {
  positive: "긍정",
  neutral: "중립",
  negative: "부정",
};

export const IMPORTANCE_LABEL: Record<MonitorImportance, string> = {
  high: "중요",
  normal: "보통",
  low: "낮음",
};

/** DB의 text 값을 알려진 값으로 좁힌다. 모르는 값은 null. */
export const asSentiment = (value: string | null | undefined): MonitorSentiment | null =>
  SENTIMENTS.find((s) => s === value) ?? null;
export const asImportance = (
  value: string | null | undefined
): MonitorImportance | null => IMPORTANCES.find((s) => s === value) ?? null;

/** 에이전트 작업량 — tokens는 캐시를 뺀 입력 + 출력 */
export interface MonitorUsage {
  tokens: number;
  tools: number;
}

export interface MonitorRunStats {
  sources?: { name: string; count: number }[];
  blocked?: string[];
  /** 에이전트가 적어 보낸 값 — 정확하지 않아 화면에 쓰지 않는다. */
  durationSec?: number;
  /** 앱이 잰 수집 소요 시간(시작 ~ 결과 수신) */
  measuredSec?: number;
  usage?: MonitorUsage;
  note?: string;
}

export interface MonitorClientSummary {
  id: number;
  slug: string;
  name: string;
  latestRun: {
    id: number;
    until: string;
    includedCount: number;
    reportedAt: string | null;
    pending: boolean;
    failed: boolean;
  } | null;
  autoCollect: boolean;
  /** 다음 자동 수집 시각. 꺼져 있으면 null */
  nextCollectAt: string | null;
}

export interface MonitorIssueSummary {
  id: number;
  title: string;
  clientName: string | null;
  isActive: boolean;
  totalAdded: number;
  brandMentions: number;
  pending: boolean;
  /** 다음 자동 집계 시각. 감시를 끝냈으면 null */
  nextCollectAt: string | null;
}

export interface MonitorOverview {
  clients: MonitorClientSummary[];
  issues: MonitorIssueSummary[];
}

export interface MonitorClientView {
  id: number;
  slug: string;
  name: string;
  categories: MonitorCategory[];
  rules: MonitorRule[];
  reportTitle: string;
  greeting: string;
  closing: string;
  autoCollect: boolean;
  /** 수집 시작 시각(HH:mm). null이면 모니터링 기간이 끝나는 시각 */
  collectTime: string | null;
  weekdaysOnly: boolean;
}

export interface MonitorItemView {
  id: number;
  articleId: number;
  category: string | null;
  subcategory: string | null;
  score: number;
  reason: string;
  excludedReason: string | null;
  excludedRule: string | null;
  included: boolean;
  dupGroup: string | null;
  isLead: boolean;
  flags: string[];
  sentiment: MonitorSentiment | null;
  importance: MonitorImportance | null;
  url: string;
  naverUrl: string | null;
  media: string;
  title: string;
  reporter: string | null;
  publishedAt: string | null;
  summary: string | null;
}

export interface MonitorRunView {
  id: number;
  since: string;
  until: string;
  stats: MonitorRunStats;
  reportText: string | null;
  reportedAt: string | null;
  pendingRequest: string | null;
  pendingSince: string | null;
  lastError: string | null;
  createdAt: string | null;
}

export interface MonitorRunSummary {
  id: number;
  since: string;
  until: string;
  reportedAt: string | null;
  /** 리포트에 포함된 대표 기사 수 */
  includedCount: number;
  pending: boolean;
  /** 기사 없이 실패로 끝났는지 */
  failed: boolean;
}

export interface MonitorClientPayload {
  client: MonitorClientView;
  run: MonitorRunView | null;
  items: MonitorItemView[];
  /** 최근 런 목록 (최신순) */
  runs: MonitorRunSummary[];
  /** 오늘 자동 수집을 이미 시작했는지 */
  collectedToday: boolean;
}

export interface MonitorIssueEvent {
  at: string;
  text: string;
  key?: boolean;
}

export interface MonitorIssueSnapshotView {
  id: number;
  at: string;
  label: string;
  added: number;
  mediaCount: number | null;
  brandMentions: number;
  lastArticle: { media?: string; time?: string; title?: string; url?: string } | null;
  reportText: string | null;
  isReport: boolean;
  usage: MonitorUsage | null;
  /** 저장된 기사 목록 건수. 0이면 목록 저장 전에 돈 집계다. */
  articleCount: number;
}

export interface MonitorIssueArticleView {
  id: number;
  url: string;
  media: string;
  title: string;
  publishedAt: string | null;
  brandMention: boolean;
  sentiment: MonitorSentiment | null;
}

export interface MonitorIssuePayload {
  issue: {
    id: number;
    title: string;
    clientId: number | null;
    clientName: string | null;
    keywords: string[];
    brandTerms: string[];
    events: MonitorIssueEvent[];
    isActive: boolean;
    collectStart: string;
    collectGapMinutes: number;
    reportRecipient: string;
    reportTemplate: string;
    pendingSince: string | null;
    lastError: string | null;
  };
  snapshots: MonitorIssueSnapshotView[];
}

/* ───────────── Hermes → 앱 수집 결과 (POST /api/monitor/agent/runs) ───────────── */

export const agentItemSchema = z.object({
  url: z.string().url().max(2000),
  naverUrl: z.string().url().max(2000).nullish(),
  media: z.string().min(1).max(80),
  title: z.string().min(1).max(400),
  reporter: z.string().max(80).nullish(),
  /** byline.py의 status. 기자를 못 찾았을 때 이유를 구분한다. */
  reporterStatus: z
    .enum(["found", "fetch_failed", "not_on_page", "unverified"])
    .nullish(),
  /** ISO 8601 (오프셋 포함 권장, 예: 2026-11-05T16:23:00+09:00) */
  publishedAt: z.string().max(40).nullish(),
  summary: z.string().max(2000).nullish(),
  /** 카테고리 key. 제외한 후보는 null + excludedReason */
  category: z.string().max(40).nullish(),
  subcategory: z.string().max(40).nullish(),
  score: z.number().int().min(0).max(100).default(50),
  reason: z.string().max(400).default(""),
  excludedReason: z.string().max(200).nullish(),
  excludedRule: z.string().max(80).nullish(),
  dupGroup: z.string().max(80).nullish(),
  isLead: z.boolean().default(true),
  blocked: z.boolean().default(false),
  /** 고객사 입장에서 본 논조 */
  sentiment: sentimentSchema.nullish(),
  /** 고객사에 미칠 영향 */
  importance: importanceSchema.nullish(),
});
export type AgentItem = z.infer<typeof agentItemSchema>;

/** 기자를 못 찾은 이유. 접속 실패와 표기 없음은 뜻이 달라서 구분해 보여 준다. */
export const REPORTER_GAPS = {
  fetch_failed: {
    flag: "reporter-fetch-failed",
    label: "원문 접속 실패",
    report: "확인 불가(원문 접속 실패)",
  },
  not_on_page: {
    flag: "reporter-not-on-page",
    label: "기자 표기 없음",
    report: "확인 불가(페이지에 기자 표기 없음)",
  },
  unverified: {
    flag: "reporter-unverified",
    label: "원문 미검증",
    report: "미검증",
  },
} as const;

export const getReporterGap = (flags: string[]) =>
  Object.values(REPORTER_GAPS).find((gap) => flags.includes(gap.flag));

export const agentRunSchema = z
  .object({
    /** 새 런을 만들 때 */
    client: z.string().min(1).max(40).optional(),
    since: z.string().max(40).optional(),
    until: z.string().max(40).optional(),
    /** "더 찾기" 결과를 기존 런에 붙일 때 */
    runId: z.number().int().positive().optional(),
    stats: z
      .object({
        sources: z.array(z.object({ name: z.string(), count: z.number() })).optional(),
        blocked: z.array(z.string()).optional(),
        durationSec: z.number().optional(),
        note: z.string().max(400).optional(),
      })
      .optional(),
    items: z.array(agentItemSchema).max(500),
    /**
     * 결과를 여러 번 나눠 보낼 때 마지막이 아닌 묶음은 false.
     * 생략하면 마지막 묶음으로 보고 대기 상태를 푼다(화면 갱신이 이때 일어난다).
     */
    final: z.boolean().optional(),
  })
  .refine((v) => v.runId || (v.client && v.since && v.until), {
    message: "runId 또는 client·since·until 중 하나는 있어야 해요.",
  });
export type AgentRunInput = z.infer<typeof agentRunSchema>;

export const MAX_ISSUE_ARTICLES = 2000;

export const agentSnapshotSchema = z.object({
  /** 집계 시각. 비우면 서버가 받은 시각. 대시보드 버튼으로 시작한 집계는 항상 서버 시각을 쓴다. */
  at: z.string().max(40).optional(),
  label: z.string().min(1).max(40),
  added: z.number().int().min(0),
  mediaCount: z.number().int().min(0).nullish(),
  brandMentions: z.number().int().min(0).default(0),
  lastArticle: z
    .object({
      media: z.string().optional(),
      time: z.string().optional(),
      title: z.string().optional(),
      url: z.string().optional(),
    })
    .nullish(),
  reportText: z.string().max(8000).nullish(),
  isReport: z.boolean().default(true),
  /** 이번 구간에 센 기사 전부 — 화면의 기사 목록이 된다 */
  articles: z
    .array(
      z.object({
        url: z
          .string()
          .url()
          .max(2000)
          .refine((v) => /^https?:\/\//i.test(v), "http 주소만 받아요."),
        media: z.string().max(80).nullish(),
        title: z.string().min(1).max(400),
        /** KST 'YYYY-MM-DD HH:mm' */
        publishedAt: z
          .string()
          .regex(
            /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
            "YYYY-MM-DD HH:mm 형식으로 보내 주세요."
          )
          .nullish(),
        brandMention: z.boolean().default(false),
        sentiment: sentimentSchema.nullish(),
      })
    )
    .max(MAX_ISSUE_ARTICLES)
    .default([]),
  /** 새로 알게 된 주요 흐름 — 기존 events 뒤에 붙는다 */
  events: z
    .array(
      z.object({
        at: z.string().max(40),
        text: z.string().max(300),
        key: z.boolean().optional(),
      })
    )
    .max(20)
    .optional(),
});
export type AgentSnapshotInput = z.infer<typeof agentSnapshotSchema>;

/* ───────────── 매체·기자 통계 (GET /api/monitor/clients/{id}/stats) ───────────── */

export const STATS_DAYS = [7, 30, 90] as const;
export type StatsDays = (typeof STATS_DAYS)[number];

/** included: 리포트에 넣은 기사 · picked: AI가 카테고리로 고른 후보 전체 */
export const STATS_SCOPES = ["included", "picked"] as const;
export type StatsScope = (typeof STATS_SCOPES)[number];

export interface MonitorStatsArticle {
  url: string;
  title: string;
  media: string;
  reporter: string | null;
  publishedAt: string | null;
  category: string | null;
  sentiment: MonitorSentiment | null;
}

export type SentimentCounts = Record<MonitorSentiment | "unknown", number>;

export interface MonitorMediaStat {
  media: string;
  count: number;
  sentiment: SentimentCounts;
  /** 이 매체에서 보도한 기자 수 */
  reporters: number;
  lastAt: string | null;
  categories: { key: string; count: number }[];
}

export interface MonitorReporterStat {
  reporter: string;
  media: string;
  count: number;
  sentiment: SentimentCounts;
  lastAt: string | null;
  categories: { key: string; count: number }[];
  /** 최신순 기사 (최대 5건) */
  articles: MonitorStatsArticle[];
}

export interface MonitorStatsPayload {
  days: StatsDays;
  scope: StatsScope;
  category: string | null;
  from: string;
  to: string;
  totals: {
    articles: number;
    media: number;
    reporters: number;
    /** 기자를 확인하지 못한 기사 */
    noReporter: number;
    sentiment: SentimentCounts;
  };
  media: MonitorMediaStat[];
  reporters: MonitorReporterStat[];
}
