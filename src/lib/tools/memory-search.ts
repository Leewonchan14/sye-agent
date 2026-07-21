import { tool } from "ai";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

import { getDb } from "@/lib/db/db";
import { kakaoChat } from "@/lib/db/schema";
// embed is loaded lazily inside execute() to avoid loading @huggingface/transformers
// in Vercel serverless (depends on native onnxruntime binary).

const COSINE_DISTANCE_THRESHOLD = 0.5;

const sharedSchema = {
  dateFrom: z
    .string()
    .optional()
    .describe("검색할 날짜 범위 시작 (ISO 8601, 예: 2024-03-01)"),
  dateTo: z
    .string()
    .optional()
    .describe(
      "검색할 날짜 범위 끝 (ISO 8601, 예: 2024-03-31). 생략하면 dateFrom 당일만 검색합니다."
    ),
  limit: z.number().optional().default(10).describe("최대 결과 개수 (기본 10, 최대 50)"),
  user: z
    .enum(["볼따구", "이원찬"])
    .optional()
    .describe("특정 사용자로 필터링 (볼따구 or 이원찬)"),
};

const buildDateUserConditions = (dateFrom?: string, dateTo?: string, user?: string) => {
  const conditions = [];

  if (dateFrom) {
    conditions.push(sql`${kakaoChat.date} >= ${dateFrom}::timestamp`);
  }
  if (dateTo) {
    conditions.push(sql`${kakaoChat.date} <= ${dateTo + " 23:59:59"}::timestamp`);
  } else if (dateFrom && !dateTo) {
    conditions.push(sql`${kakaoChat.date} < ${dateFrom + " 23:59:59"}::timestamp`);
  }

  if (user) {
    conditions.push(sql`${kakaoChat.user} = ${user}`);
  }

  return conditions;
};

const formatResults = (
  results: { id: number; date: Date | null; user: string; message: string }[]
) =>
  results.map((r) => ({
    date:
      r.date instanceof Date
        ? r.date.toISOString().slice(0, 16).replace("T", " ")
        : String(r.date).slice(0, 16),
    user: r.user,
    message: r.message,
  }));

// ─── Vector Search (의미 기반 검색) ───

export const memoryVectorSearch = tool({
  description: `카카오톡 대화 내용을 의미(벡터) 기반으로 검색합니다.
비슷한 의미의 대화를 찾을 때 사용하세요.
예: "닭갈비" 검색 → 닭갈비 먹은 날 찾기
예: "영화" 검색 → 같이 본 영화 찾기
예: "신도림" 검색 → 신도림에서 만난 날 찾기
예: "3월에 닭갈비 얘기" → "2024-03-01" ~ "2024-03-31" + "닭갈비"`,
  inputSchema: z.object({
    keyword: z.string().describe("검색할 키워드 (의미 기반 벡터 검색)"),
    ...sharedSchema,
  }),
  execute: async ({ keyword, dateFrom, dateTo, limit = 10, user }) => {
    const db = getDb();
    const conditions = buildDateUserConditions(dateFrom, dateTo, user);

    const { embed } = await import("@/lib/embedding");
    const keywordEmbedding = await embed(keyword);
    const vecLiteral = `[${keywordEmbedding.join(",")}]`;

    conditions.push(
      sql`${kakaoChat.embedding} <=> ${vecLiteral}::vector < ${COSINE_DISTANCE_THRESHOLD}`
    );

    const results = await db
      .select({
        id: kakaoChat.id,
        date: kakaoChat.date,
        user: kakaoChat.user,
        message: kakaoChat.message,
      })
      .from(kakaoChat)
      .where(sql.join(conditions, sql` AND `))
      .orderBy(sql`${kakaoChat.embedding} <=> ${vecLiteral}::vector`)
      .limit(Math.min(limit, 50));

    return {
      count: results.length,
      keyword,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      results: formatResults(results),
    };
  },
});

// ─── Keyword Search (문자열 ILIKE 검색) ───

export const memoryKeywordSearch = tool({
  description: `카카오톡 대화 내용을 키워드(문자열 부분일치)로 검색합니다.
정확한 단어나 문장이 기억날 때 사용하세요.
예: "닭갈비" 검색 → "닭갈비"라는 단어가 포함된 대화 찾기
예: "영화" 검색 → "영화"라는 단어가 포함된 대화 찾기
예: "3월에 닭갈비" → "2024-03-01" ~ "2024-03-31" + "닭갈비"`,
  inputSchema: z.object({
    keyword: z.string().describe("검색할 키워드 (부분일치 ILIKE 검색, 띄어쓰기 포함)"),
    ...sharedSchema,
  }),
  execute: async ({ keyword, dateFrom, dateTo, limit = 10, user }) => {
    const db = getDb();
    const conditions = buildDateUserConditions(dateFrom, dateTo, user);

    conditions.push(sql`${kakaoChat.message} ILIKE ${"%" + keyword + "%"}`);

    const results = await db
      .select({
        id: kakaoChat.id,
        date: kakaoChat.date,
        user: kakaoChat.user,
        message: kakaoChat.message,
      })
      .from(kakaoChat)
      .where(sql.join(conditions, sql` AND `))
      .orderBy(kakaoChat.date)
      .limit(Math.min(limit, 50));

    return {
      count: results.length,
      keyword,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      results: formatResults(results),
    };
  },
});
