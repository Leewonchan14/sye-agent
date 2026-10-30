import type { UIMessageChunk } from "ai";
import { sql } from "drizzle-orm";
import {
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

/** 채팅 밖(HTTP 업로드)에서 온 UI 아티팩트 — 메시지에는 id만 싣는다. */
export const artifacts = pgTable("artifacts", {
  id: text("id").primaryKey(),
  /** image | video | svg | html | glb */
  kind: text("kind").notNull(),
  mime: text("mime").notNull(),
  bytes: integer("bytes").notNull(),
  width: integer("width"),
  height: integer("height"),
  durationMs: integer("duration_ms"),
  /** 같은 테이블의 다른 아티팩트 id */
  posterId: text("poster_id"),
  /** local | blob */
  storage: text("storage").notNull().default("local"),
  /** 저장 키(상대 경로 또는 blob pathname) */
  key: text("key").notNull(),
  caption: text("caption"),
  sessionId: text("session_id"),
  /** "hachi" | "upload" */
  source: text("source"),
  meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
