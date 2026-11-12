import type { UIMessageChunk } from "ai";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ───────────────────────── 계정 (Better Auth) ───────────────────────── */
// 필드 이름은 Better Auth 기본 스키마(camelCase 키)와 같아야 한다.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => ({ userIdx: index("session_user_idx").on(t.userId) })
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({ userIdx: index("account_user_idx").on(t.userId) })
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({ identifierIdx: index("verification_identifier_idx").on(t.identifier) })
);

/** 로그인·회원가입 요청 제한 카운터 (서버리스라 메모리 대신 DB에 둔다). */
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/* ───────────────────────── 채팅 ───────────────────────── */

export const sessionState = pgTable(
  "session_state",
  {
    sessionId: text("session_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title"),
    messages: jsonb("messages").notNull(),
    messagesText: text("messages_text"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userUpdatedIdx: index("session_state_user_updated_idx").on(
      table.userId,
      table.updatedAt
    ),
    titleTrgmIdx: index("session_state_title_trgm_idx").using(
      "gin",
      sql`${table.title} gin_trgm_ops`
    ),
    messagesTextTrgmIdx: index("session_state_messages_text_trgm_idx").using(
      "gin",
      sql`${table.messagesText} gin_trgm_ops`
    ),
  })
);

export const instructions = pgTable(
  "instructions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    content: text("content").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userActiveIdx: index("instructions_user_active_idx").on(table.userId, table.isActive),
  })
);

export const suggestions = pgTable(
  "suggestions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    prompt: text("prompt").notNull(),
    sortOrder: integer("sort_order"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userSortIdx: index("suggestions_user_sort_idx").on(table.userId, table.sortOrder),
  })
);

/**
 * 진행 중인(또는 막 끝난) 채팅 턴 하나의 상태.
 *
 * Vercel 함수는 300초에서 죽고, 그때 Hermes로 가는 SSE도 끊긴다. 그래서 턴은 Hermes의
 * 디태치 런(`/v1/runs`)으로 돌리고, 앱은 `chat_turn_frames`에 UI 스트림 청크를 적어 두었다가
 * 브라우저가 끊긴 지점(offset)부터 재생해 이어 붙인다.
 */
export const chatTurns = pgTable(
  "chat_turns",
  {
    sessionId: text("session_id").primaryKey(),
    hermesRunId: text("hermes_run_id").notNull(),
    // running | completed | failed | cancelled
    status: text("status").notNull().default("running"),
    /** 로그에 기록된 UI 청크 개수 (다음 offset). */
    nextOffset: integer("next_offset").notNull().default(0),
    /** 마지막으로 소비한 Hermes run 이벤트 seq. */
    hermesSeq: integer("hermes_seq").notNull().default(-1),
    /** 이 턴을 시작시킨 사용자 메시지 — 브라우저가 사라진 턴을 복구할 때 되살린다. */
    userText: text("user_text"),
    /**
     * 지금 이 턴 로그를 쓰는 릴레이의 id.
     * 재개 요청이 동시에 여러 개 붙어도 **한 릴레이만** 프레임을 기록하게 하는 리스다.
     */
    writerId: text("writer_id"),
    /** 실패 시 사용자에게 보여줄 오류 메시지. */
    error: text("error"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    updatedIdx: index("chat_turns_updated_idx").on(table.updatedAt),
  })
);

/** 한 턴의 UI 스트림 청크 로그 — offset 순서대로 재생하면 같은 화면이 복원된다. */
export const chatTurnFrames = pgTable(
  "chat_turn_frames",
  {
    sessionId: text("session_id").notNull(),
    offset: integer("offset").notNull(),
    chunk: jsonb("chunk").$type<UIMessageChunk>().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.sessionId, table.offset] }),
  })
);

/* ───────────────────────── 언론 모니터링 대시보드 ───────────────────────── */

/**
 * 모니터링 고객사(예: 어느 브랜드). 카테고리·규칙·리포트 서식을 고객사마다 들고 있고,
 * Hermes 모니터링 스킬은 수집 전에 이 행을 읽어 규칙을 적용한다.
 */
export const monitorClients = pgTable(
  "monitor_clients",
  {
    id: serial("id").primaryKey(),
    /** 이 고객사를 만든 사용자. 고객사·규칙·일정은 사용자마다 따로 둔다. */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Hermes가 고객사를 찾는 키 — 전체에서 유일하다. */
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    /** [{ key, name, goal, subs? }] — 리포트 섹션 순서 그대로 */
    categories: jsonb("categories").notNull().default([]),
    /** [{ id, title, quote, kind, value }] — 채팅의 "앞으로는~" 지시를 구조화한 규칙 */
    rules: jsonb("rules").notNull().default([]),
    /** 리포트 제목 서식. `{date}` 자리에 YYYY.MM.DD가 들어간다. */
    reportTitle: text("report_title").notNull().default(""),
    greeting: text("greeting").notNull().default(""),
    closing: text("closing").notNull().default(""),
    /** 매일 정해진 시각에 AI가 자동으로 수집할지 */
    autoCollect: boolean("auto_collect").notNull().default(true),
    /** 수집 시작 시각(HH:mm, KST). 비우면 모니터링 기간이 끝나는 시각 */
    collectTime: text("collect_time"),
    /** 평일에만 수집한다. 월요일에는 지난 금요일부터 모은다. */
    weekdaysOnly: boolean("weekdays_only").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    slugUniq: uniqueIndex("monitor_clients_slug_uniq").on(t.slug),
    userIdx: index("monitor_clients_user_idx").on(t.userId, t.sortOrder),
  })
);

/** 한 번의 수집(보통 하루치). 리포트를 복사하면 reportedAt이 찍혀 다음 수집의 중복 기준이 된다. */
export const monitorRuns = pgTable(
  "monitor_runs",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => monitorClients.id, { onDelete: "cascade" }),
    since: timestamp("since", { withTimezone: true }).notNull(),
    until: timestamp("until", { withTimezone: true }).notNull(),
    /** { sources: [{ name, count }], blocked: string[], durationSec, measuredSec, note } */
    stats: jsonb("stats").notNull().default({}),
    reportText: text("report_text"),
    reportedAt: timestamp("reported_at", { withTimezone: true }),
    /** "더 찾기"로 돌고 있는 Hermes 런 — 결과가 들어오면 비운다. */
    pendingHermesRunId: text("pending_hermes_run_id"),
    pendingRequest: text("pending_request"),
    pendingSince: timestamp("pending_since", { withTimezone: true }),
    /** "더 찾기" 콜백용 일회성 토큰의 SHA-256 — Hermes 쪽에 고정 키를 두지 않아도 결과를 받을 수 있다. */
    callbackTokenHash: text("callback_token_hash"),
    callbackTokenExpiresAt: timestamp("callback_token_expires_at", {
      withTimezone: true,
    }),
    lastError: text("last_error"),
    /** 매일 자동 수집의 날짜(YYYY-MM-DD, KST). 같은 날 두 번 시작하지 않게 막는다. 수동 수집은 null. */
    collectKey: text("collect_key"),
    /** 자동 수집 진행 — running → (실패 시 retried) → done. 재시도를 한 번만 하게 막는다. */
    autoState: text("auto_state"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    clientIdx: index("monitor_runs_client_idx").on(t.clientId, t.until),
    collectKeyUniq: uniqueIndex("monitor_runs_collect_key_uniq").on(
      t.clientId,
      t.collectKey
    ),
  })
);

/** 기사 원본 — URL 하나당 한 행. 여러 런에 걸쳐 재사용된다. */
export const monitorArticles = pgTable(
  "monitor_articles",
  {
    id: serial("id").primaryKey(),
    url: text("url").notNull(),
    naverUrl: text("naver_url"),
    media: text("media").notNull(),
    title: text("title").notNull(),
    reporter: text("reporter"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({ urlUniq: uniqueIndex("monitor_articles_url_uniq").on(t.url) })
);

/** 런 안에서의 기사 판정(AI)과 선별(사람). category가 null이면 제외된 후보다. */
export const monitorItems = pgTable(
  "monitor_items",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => monitorRuns.id, { onDelete: "cascade" }),
    articleId: integer("article_id")
      .notNull()
      .references(() => monitorArticles.id, { onDelete: "cascade" }),
    category: text("category"),
    subcategory: text("subcategory"),
    score: integer("score").notNull().default(0),
    reason: text("reason").notNull().default(""),
    excludedReason: text("excluded_reason"),
    excludedRule: text("excluded_rule"),
    included: boolean("included").notNull().default(true),
    /** 같은 보도자료 묶음 키. 대표 기사만 isLead=true */
    dupGroup: text("dup_group"),
    isLead: boolean("is_lead").notNull().default(true),
    /** dup | blocked | reported | new */
    flags: jsonb("flags").$type<string[]>().notNull().default([]),
    /** 고객사 입장에서 본 논조 — positive | neutral | negative. 모르면 null */
    sentiment: text("sentiment"),
    /** 고객사에 미칠 영향 — high | normal | low. 모르면 null */
    importance: text("importance"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    runIdx: index("monitor_items_run_idx").on(t.runId),
    runArticleUniq: uniqueIndex("monitor_items_run_article_uniq").on(
      t.runId,
      t.articleId
    ),
  })
);

/** 위기·이슈 트래커(예: 제품 논란). 브랜드 언급을 감시하고 보고 시점마다 스냅샷을 쌓는다. */
export const monitorIssues = pgTable("monitor_issues", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  clientId: integer("client_id").references(() => monitorClients.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
  brandTerms: jsonb("brand_terms").$type<string[]>().notNull().default([]),
  /** [{ at, text, key }] 주요 흐름 */
  events: jsonb("events").notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  pendingHermesRunId: text("pending_hermes_run_id"),
  pendingSince: timestamp("pending_since", { withTimezone: true }),
  callbackTokenHash: text("callback_token_hash"),
  callbackTokenExpiresAt: timestamp("callback_token_expires_at", { withTimezone: true }),
  lastError: text("last_error"),
  /** 자동 집계를 시작하는 시각(HH:mm, KST) */
  collectStart: text("collect_start").notNull().default("09:00"),
  /** 자동 집계 간격(분). 시작 시각부터 그날 끝까지 이 간격으로 돈다. */
  collectGapMinutes: integer("collect_gap_minutes").notNull().default(360),
  /** 마지막으로 시작한 자동 집계 시각 키(YYYY-MM-DD-HH:mm, KST). 같은 시각에 두 번 돌지 않게 막는다. */
  lastAutoSlot: text("last_auto_slot"),
  /** 자동 집계 진행 — running → (실패 시 retried) → done */
  autoState: text("auto_state"),
  /** 보고 초안을 받는 사람(예: 홍길동 매니저님). 비우면 "담당 매니저님" */
  reportRecipient: text("report_recipient").notNull().default(""),
  /** 보고 초안 서식. 비우면 AI가 기본 형식으로 쓴다. */
  reportTemplate: text("report_template").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const monitorIssueSnapshots = pgTable(
  "monitor_issue_snapshots",
  {
    id: serial("id").primaryKey(),
    issueId: integer("issue_id")
      .notNull()
      .references(() => monitorIssues.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true }).notNull(),
    /** 차트 라벨 (예: "11/6 15시") */
    label: text("label").notNull(),
    /** 직전 스냅샷 이후 추가된 기사 수 */
    added: integer("added").notNull(),
    mediaCount: integer("media_count"),
    brandMentions: integer("brand_mentions").notNull().default(0),
    /** { media, time, title, url } */
    lastArticle: jsonb("last_article"),
    reportText: text("report_text"),
    /** 정기 보고(15시 등)인지, 중간 확인인지 */
    isReport: boolean("is_report").notNull().default(true),
    /** 이 집계에 쓴 AI 작업량 { tokens, tools } */
    usage: jsonb("usage"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({ issueIdx: index("monitor_issue_snapshots_issue_idx").on(t.issueId, t.at) })
);

/** 이슈 집계 한 번에 센 기사 목록 */
export const monitorIssueArticles = pgTable(
  "monitor_issue_articles",
  {
    id: serial("id").primaryKey(),
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => monitorIssueSnapshots.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** 매체 이름. 모르면 비워 두고 화면에서 주소로 대신한다. */
    media: text("media").notNull().default(""),
    title: text("title").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** 감시어가 제목·본문에 나온 기사 */
    brandMention: boolean("brand_mention").notNull().default(false),
    /** 고객사 입장에서 본 논조 — positive | neutral | negative. 모르면 null */
    sentiment: text("sentiment"),
  },
  (t) => ({
    snapshotIdx: index("monitor_issue_articles_snapshot_idx").on(
      t.snapshotId,
      t.publishedAt
    ),
  })
);
