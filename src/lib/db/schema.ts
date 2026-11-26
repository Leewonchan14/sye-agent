import type { DiaryComment, DiaryPhoto } from "@/lib/calendar/types";
import type { UIMessageChunk } from "ai";
import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

export const sessionState = pgTable(
  "session_state",
  {
    sessionId: text("session_id").primaryKey(),
    title: text("title"),
    messages: jsonb("messages").notNull(),
    messagesText: text("messages_text"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
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
    label: text("label").notNull(),
    content: text("content").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    activeIdx: index("instructions_active_idx").on(table.isActive),
  })
);

export const suggestions = pgTable(
  "suggestions",
  {
    id: serial("id").primaryKey(),
    label: text("label").notNull(),
    prompt: text("prompt").notNull(),
    sortOrder: integer("sort_order"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    sortOrderIdx: index("suggestions_sort_order_idx").on(table.sortOrder),
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

export const kakaoChat = pgTable(
  "kakao_chat",
  {
    id: serial("id").primaryKey(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    user: text("user").notNull(),
    message: text("message").notNull(),
    embedding: vector("embedding", { dimensions: 384 }),
  },
  (table) => ({
    dateIdx: index("kakao_chat_date_idx").on(table.date),
    embeddingIdx: index("kakao_chat_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
    dedupIdx: uniqueIndex("kakao_chat_dedup_idx").on(
      table.date,
      table.user,
      table.message
    ),
  })
);

export const ledgerCategories = pgTable(
  "ledger_categories",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("expense"), // expense | income
    emoji: text("emoji").notNull().default("🧾"),
    icon: text("icon").notNull().default("tag"),
    color: text("color").notNull().default("neutral"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    kindIdx: index("ledger_categories_kind_idx").on(t.kind, t.sortOrder),
    nameUniq: uniqueIndex("ledger_categories_kind_name_uniq").on(t.kind, t.name),
  })
);

export const ledgerAssets = pgTable(
  "ledger_assets",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("card"), // cash | bank | card
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({ nameUniq: uniqueIndex("ledger_assets_name_uniq").on(t.name) })
);

/** 여행. 분류(무엇에 썼나)와 별개로 어느 여행의 지출인지 묶는다. */
export const ledgerTrips = pgTable(
  "ledger_trips",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    startDate: text("start_date").notNull(), // YYYY-MM-DD (KST)
    endDate: text("end_date").notNull(), // YYYY-MM-DD (KST)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({ nameUniq: uniqueIndex("ledger_trips_name_uniq").on(t.name) })
);

/** 매달 같은 날 자동으로 내역을 만드는 규칙. lastDate까지 생성을 마쳤다는 뜻이다. */
export const ledgerRecurring = pgTable("ledger_recurring", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull().default("expense"), // expense | income
  amount: integer("amount").notNull(),
  categoryId: integer("category_id").references(() => ledgerCategories.id, {
    onDelete: "set null",
  }),
  memo: text("memo").notNull().default(""),
  dayOfMonth: integer("day_of_month").notNull(),
  startDate: text("start_date").notNull(), // YYYY-MM-DD (KST)
  endDate: text("end_date"),
  lastDate: text("last_date"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: serial("id").primaryKey(),
    entryDate: text("entry_date").notNull(), // YYYY-MM-DD (KST)
    entryTime: text("entry_time"), // HH:mm (KST), 모르면 null
    // 실제로 간 날 YYYY-MM-DD (KST). 비어 있으면 결제일(entry_date)과 같은 날
    visitDate: text("visit_date").notNull().default(""),
    kind: text("kind").notNull().default("expense"), // expense | income
    amount: integer("amount").notNull(),
    categoryId: integer("category_id").references(() => ledgerCategories.id, {
      onDelete: "set null",
    }),
    assetId: integer("asset_id").references(() => ledgerAssets.id, {
      onDelete: "set null",
    }),
    tripId: integer("trip_id").references(() => ledgerTrips.id, {
      onDelete: "set null",
    }),
    recurringId: integer("recurring_id").references(() => ledgerRecurring.id, {
      onDelete: "set null",
    }),
    memo: text("memo").notNull().default(""),
    note: text("note").notNull().default(""), // 자세히 남기고 싶은 메모
    mapUrl: text("map_url").notNull().default(""), // 장소 지도 링크 (네이버·카카오·구글 지도 등)
    mapPlaceName: text("map_place_name").notNull().default(""), // 네이버 지도 링크에서 읽은 장소 이름
    // 네이버 지도 링크에서 읽은 장소 사진 주소들 (앞의 것이 대표 사진)
    mapImageUrls: jsonb("map_image_urls").$type<string[]>().notNull().default([]),
    // 네이버 지도 링크에서 읽은 장소 id·좌표·주소·업종. 데이트 지도(/map)에 핀으로 찍는다.
    mapPlaceId: text("map_place_id").notNull().default(""),
    mapLat: doublePrecision("map_lat"),
    mapLng: doublePrecision("map_lng"),
    mapAddress: text("map_address").notNull().default(""),
    mapCategory: text("map_category").notNull().default(""),
    tags: text("tags").notNull().default(""),
    member: text("member").notNull().default("wonchan"), // wonchan | yeeun
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }), // null이면 살아 있는 기록
  },
  (t) => ({
    dateIdx: index("ledger_entries_date_idx").on(t.entryDate),
    memberIdx: index("ledger_entries_member_idx").on(t.member),
    tripIdx: index("ledger_entries_trip_idx").on(t.tripId),
    // 반복 규칙은 같은 날짜에 한 번만 내역을 만든다.
    recurringDateUniq: uniqueIndex("ledger_entries_recurring_date_uniq").on(
      t.recurringId,
      t.entryDate
    ),
  })
);

/** 로그인 시도 기록. 비밀번호가 틀린 시도만 남고, 성공하면 지운다. */
export const authLoginAttempts = pgTable(
  "auth_login_attempts",
  {
    id: serial("id").primaryKey(),
    ip: text("ip").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index("auth_login_attempts_created_idx").on(t.createdAt),
  })
);

/** 모임통장 한 개의 잔액 기준점. id=1 한 줄만 쓴다. */
export const ledgerAccount = pgTable("ledger_account", {
  id: integer("id").primaryKey().default(1),
  openingBalance: integer("opening_balance").notNull().default(0),
  checkedBalance: integer("checked_balance"),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

/** 내역 변경 이력. 원본이 지워져도 남도록 FK를 걸지 않는다. */
export const ledgerEntryHistory = pgTable(
  "ledger_entry_history",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id").notNull(),
    action: text("action").notNull(), // create | update | delete | restore
    source: text("source").notNull().default("web"), // web | agent
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index("ledger_entry_history_created_idx").on(t.createdAt),
  })
);

export const ledgerMonths = pgTable("ledger_months", {
  month: text("month").primaryKey(), // YYYY-MM
  totalBudget: integer("total_budget"),
  note: text("note").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const ledgerBudgets = pgTable(
  "ledger_budgets",
  {
    month: text("month").notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => ledgerCategories.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.month, t.categoryId] }) })
);

/**
 * 주간·월간 리캡의 하치와레 코멘트. expense는 코멘트를 쓸 때의 지출 합계다.
 * weekStart는 리캡 키다: 주간은 월요일(YYYY-MM-DD), 월간은 달(YYYY-MM).
 */
export const ledgerWeeklyComments = pgTable("ledger_weekly_comments", {
  weekStart: text("week_start").primaryKey(), // 주간 YYYY-MM-DD(월요일) 또는 월간 YYYY-MM
  expense: integer("expense").notNull(),
  comment: text("comment"),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────────────────── 언론 모니터링 대시보드 ───────────────────────── */

/**
 * 모니터링 고객사(예: 홍콩관광청). 카테고리·규칙·리포트 서식을 고객사마다 들고 있고,
 * Hermes 모니터링 스킬은 수집 전에 이 행을 읽어 규칙을 적용한다.
 */
export const monitorClients = pgTable(
  "monitor_clients",
  {
    id: serial("id").primaryKey(),
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
    /** 매일 정해진 시각에 하치와레가 자동으로 수집할지 */
    autoCollect: boolean("auto_collect").notNull().default(true),
    /** 수집 시작 시각(HH:mm, KST). 비우면 모니터링 기간이 끝나는 시각 */
    collectTime: text("collect_time"),
    /** 평일에만 수집한다. 월요일에는 지난 금요일부터 모은다. */
    weekdaysOnly: boolean("weekdays_only").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({ slugUniq: uniqueIndex("monitor_clients_slug_uniq").on(t.slug) })
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
    /** 자동 수집 진행 — running → (실패 시 retried) → done. 재시도와 알림을 한 번만 하게 막는다. */
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

/** 위기·이슈 트래커(예: 모델 논란). 브랜드 언급을 감시하고 보고 시점마다 스냅샷을 쌓는다. */
export const monitorIssues = pgTable("monitor_issues", {
  id: serial("id").primaryKey(),
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
  /** 보고 초안을 받는 사람(예: 김슬기 매니저님). 비우면 "담당 매니저님" */
  reportRecipient: text("report_recipient").notNull().default(""),
  /** 보고 초안 서식. 비우면 하치와레가 기본 형식으로 쓴다. */
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
    /** 이 집계에 쓴 하치와레 작업량 { tokens, tools } */
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

/* ───────────────────────── 데이트 추천 (하치와레 매일 조사) ───────────────────────── */

/** 조사 조건 — 한 행(id = 1)만 쓴다. */
export const dateSpotSettings = pgTable("date_spot_settings", {
  id: integer("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  /** 매일 조사를 시작하는 시각 (HH:mm, KST) */
  collectTime: text("collect_time").notNull().default("09:00"),
  /** 하루에 받을 추천 수 (장소와 즐길 거리를 섞어서) */
  count: integer("count").notNull().default(5),
  areas: text("areas")
    .array()
    .notNull()
    .default(sql`ARRAY['서울']::text[]`),
  themes: text("themes")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  /** 하치와레에게 따로 전할 말 (예: "웨이팅 긴 곳은 빼 줘") */
  memo: text("memo").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

/** 하루치 조사. 매일 자동 조사와 "더 찾아 줘"가 같은 날짜 행에 장소를 쌓는다. */
export const dateSpotDigests = pgTable("date_spot_digests", {
  id: serial("id").primaryKey(),
  /** YYYY-MM-DD (KST) */
  dayKey: text("day_key").notNull().unique(),
  /** 하치와레 한마디 */
  note: text("note"),
  pendingHermesRunId: text("pending_hermes_run_id"),
  pendingSince: timestamp("pending_since", { withTimezone: true }),
  callbackTokenHash: text("callback_token_hash"),
  callbackTokenExpiresAt: timestamp("callback_token_expires_at", { withTimezone: true }),
  lastError: text("last_error"),
  /** 자동 조사 진행 — running → (실패 시 retried) → done */
  autoState: text("auto_state"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const dateSpots = pgTable(
  "date_spots",
  {
    id: serial("id").primaryKey(),
    digestId: integer("digest_id")
      .notNull()
      .references(() => dateSpotDigests.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    area: text("area").notNull().default(""),
    category: text("category").notNull().default(""),
    summary: text("summary").notNull().default(""),
    reason: text("reason").notNull().default(""),
    /** place(가 볼 장소) | content(팝업·게임·공연처럼 둘이 즐길 거리) */
    kind: text("kind").notNull().default("place"),
    /**
     * 근거가 된 인스타그램 게시물. 같은 게시물은 두 번 추천하지 않는다.
     * 장소는 꼭 있고, 즐길거리는 인스타 대신 sourceUrl만 있을 수 있다.
     */
    instagramUrl: text("instagram_url").unique(),
    /** 즐길거리의 공식·소개 페이지(스팀, 공식 공지, 예매처 등). 같은 주소는 두 번 추천하지 않는다. */
    sourceUrl: text("source_url").unique(),
    /** 즐길 수 있는 기간·시점 (예: "11.14~12.7", "상시") */
    period: text("period"),
    instagramAuthor: text("instagram_author"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    address: text("address"),
    priceHint: text("price_hint"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /**
     * 게시물 사진들(인스타그램 CDN 주소, 여러 장이면 게시물 순서대로 최대 10장).
     * 주소가 4~5일 뒤 만료되므로 사진 파일은 저장하지 않고, 만료가 가까우면 공식 임베드에서 다시 읽는다.
     */
    photoUrls: text("photo_urls")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** 사진 주소 중 가장 먼저 만료되는 시각 */
    photoExpiresAt: timestamp("photo_expires_at", { withTimezone: true }),
    /** 마지막으로 사진을 찾아본 시각 — 사진이 없는 게시물을 계속 다시 찾지 않게 한다. */
    photoCheckedAt: timestamp("photo_checked_at", { withTimezone: true }),
    /** like(가 보고 싶어) | pass(별로) | visited(다녀왔어) — 다음 조사의 취향 힌트가 된다. */
    reaction: text("reaction"),
    /**
     * 네이버 지도 장소 id. 가계부 지도 링크의 장소 key와 같아서, 다녀와서 남긴 리뷰를 이 추천에 붙이고
     * 리뷰 별점이 낮은 곳은 다시 추천하지 않는다.
     */
    naverPlaceId: text("naver_place_id"),
    /** 좌표 — 지역 수첩에서 반경 안인지 본다. */
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    digestIdx: index("date_spots_digest_idx").on(t.digestId),
  })
);

/* ───────────────────────── 골라 줘 (랜덤 뽑기) ───────────────────────── */

/** 한 번의 뽑기. 결과는 서버가 정해서 저장하므로 어느 폰에서 열어도 같다. */
export const picks = pgTable(
  "picks",
  {
    id: serial("id").primaryKey(),
    /** 고민 (예: "오늘 저녁 뭐 먹지?") — 비워도 된다. */
    title: text("title").notNull().default(""),
    /** 뽑힌 후보(pick_options.id) */
    resultOptionId: integer("result_option_id"),
    /** 다시 돌린 횟수 — 한 번까지만 */
    rerollsUsed: integer("rerolls_used").notNull().default(0),
    /** drawn(뽑기만 함) | decided(이걸로 결정) */
    status: text("status").notNull().default("drawn"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => ({
    createdIdx: index("picks_created_idx").on(t.createdAt),
  })
);

export const pickOptions = pgTable(
  "pick_options",
  {
    id: serial("id").primaryKey(),
    pickId: integer("pick_id")
      .notNull()
      .references(() => picks.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** manual(직접 입력) — 나중에 가 보고 싶은 곳·지도 장소에서 가져온 후보도 구분한다. */
    source: text("source").notNull().default("manual"),
    sourceId: integer("source_id"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => ({
    pickIdx: index("pick_options_pick_idx").on(t.pickId),
  })
);

/**
 * 골라 줘 화면 상태. 둘이 같이 쓰는 한 장짜리(id=1)라서 어느 브라우저에서 열어도 같은 화면이다.
 * 돌리기 전에 적고 있는 고민·후보와, 지금 보고 있는 뽑기 결과를 담는다.
 */
export const pickDraft = pgTable("pick_draft", {
  id: integer("id").primaryKey(),
  title: text("title").notNull().default(""),
  labels: text("labels")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  /** 지금 화면에 띄운 뽑기. 없으면 후보를 적는 화면이다. 기록을 지우면 비운다. */
  activePickId: integer("active_pick_id").references(() => picks.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────────────────── 지역 수첩 (우리 별점·리뷰) ───────────────────────── */

/**
 * 우리 수첩에 오른 장소. 한 장소 = 한 행. 하치와레 추천처럼 가계부 내역이 없는 장소의 정보를 둔다.
 * 별점·리뷰는 가계부 내역마다 남기는 place_reviews에 있다.
 */
export const places = pgTable(
  "places",
  {
    id: serial("id").primaryKey(),
    /** 장소를 가리키는 열쇠 — 네이버 장소 id, 없으면 지도 링크. 데이트 지도의 장소 key와 같다. */
    key: text("key").notNull(),
    name: text("name").notNull(),
    /** eat(맛집·카페·술집) | stay(숙소) | play(전시·체험 등) */
    kind: text("kind").notNull().default("eat"),
    category: text("category").notNull().default(""),
    address: text("address").notNull().default(""),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    mapUrl: text("map_url").notNull().default(""),
    imageUrl: text("image_url"),
    /** @deprecated 예전 공동 별점. 지금은 내역마다 남기는 place_reviews를 쓴다. */
    rating: integer("rating"),
    /** @deprecated 예전 공동 한 줄 리뷰. place_reviews를 쓴다. */
    review: text("review").notNull().default(""),
    /** @deprecated */
    ratedAt: timestamp("rated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    keyUniq: uniqueIndex("places_key_uniq").on(t.key),
  })
);

/**
 * 지역 수첩의 지역(예: 신도림). 이름으로 네이버 검색해 고른 곳을 중심으로 삼고,
 * 반경 안의 다녀온 곳·가 보고 싶은 곳을 한 화면에 모은다.
 */
export const placeAreas = pgTable(
  "place_areas",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    /** 중심으로 고른 곳의 주소 (확인용) */
    address: text("address").notNull().default(""),
    radiusM: integer("radius_m").notNull().default(1500),
    /** 마지막으로 연 시각 — 지역 칩을 최근 순으로 놓는다. */
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameUniq: uniqueIndex("place_areas_name_uniq").on(t.name),
  })
);

/**
 * 가계부 내역(지도 링크가 있는 지출 한 건)에 남기는 리뷰. 한 내역에 원찬·예은이 각자 여러 개 남길 수 있다.
 * 장소 별점은 그 장소(네이버 장소 id, 없으면 지도 링크)를 가리키는 내역들의 리뷰 별점 평균이다.
 */
export const placeReviews = pgTable(
  "place_reviews",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id")
      .notNull()
      .references(() => ledgerEntries.id, { onDelete: "cascade" }),
    /** wonchan | yeeun */
    author: text("author").notNull(),
    /** 0.5~5, 0.5 단위 */
    rating: doublePrecision("rating").notNull(),
    /** 한 줄 리뷰 (안 써도 된다) */
    review: text("review").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entryIdx: index("place_reviews_entry_idx").on(t.entryId),
  })
);

/* ───────────────────────── 우리 캘린더 (일정·일기) ───────────────────────── */

/** 캘린더 표시 설정. 한 줄(id = 1)만 쓴다. */
export const calendarSettings = pgTable("calendar_settings", {
  id: integer("id").primaryKey().default(1),
  showHolidays: boolean("show_holidays").notNull().default(true),
  showPhotos: boolean("show_photos").notNull().default(true),
  weekStart: integer("week_start").notNull().default(0), // 0=일요일, 1=월요일
  highlightWeekend: boolean("highlight_weekend").notNull().default(true),
  lunarDetail: boolean("lunar_detail").notNull().default(true),
  lunarMonth: boolean("lunar_month").notNull().default(false),
  lunarEvent: boolean("lunar_event").notNull().default(true),
  minuteStep: integer("minute_step").notNull().default(10),
  plus: boolean("plus").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

/** 일정 라벨. 비어 있으면 LABEL_COLORS 10색으로 기본 라벨을 만든다. */
export const calendarLabels = pgTable("calendar_labels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(), // LABEL_COLORS key
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    owner: text("owner").notNull(), // wonchan | yeeun | together
    allDay: boolean("all_day").notNull().default(false),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    isLunar: boolean("is_lunar").notNull().default(false),
    lunarYear: integer("lunar_year"),
    lunarMonth: integer("lunar_month"),
    lunarDay: integer("lunar_day"),
    lunarLeap: boolean("lunar_leap").notNull().default(false),
    recurrence: text("recurrence").notNull().default("none"),
    recurrenceUntil: text("recurrence_until"), // YYYY-MM-DD
    labelId: integer("label_id").references(() => calendarLabels.id, {
      onDelete: "set null",
    }),
    location: text("location").notNull().default(""),
    memo: text("memo").notNull().default(""),
    groupId: text("group_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    startIdx: index("calendar_events_start_idx").on(table.startAt),
    ownerIdx: index("calendar_events_owner_idx").on(table.owner),
  })
);

export const calendarDiaries = pgTable(
  "calendar_diaries",
  {
    id: serial("id").primaryKey(),
    date: text("date").notNull(), // YYYY-MM-DD
    author: text("author").notNull(), // wonchan | yeeun
    body: text("body").notNull().default(""),
    photos: jsonb("photos").$type<DiaryPhoto[]>().notNull().default([]),
    comments: jsonb("comments").$type<DiaryComment[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    dateAuthorIdx: uniqueIndex("calendar_diaries_date_author_idx").on(
      table.date,
      table.author
    ),
    dateIdx: index("calendar_diaries_date_idx").on(table.date),
  })
);

export const calendarTemplates = pgTable("calendar_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  title: text("title").notNull(),
  owner: text("owner").notNull(),
  allDay: boolean("all_day").notNull().default(false),
  labelId: integer("label_id"),
  location: text("location").notNull().default(""),
  memo: text("memo").notNull().default(""),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
