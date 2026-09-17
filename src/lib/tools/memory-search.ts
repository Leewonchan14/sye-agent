import { tool } from "ai";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod/v4";

import { getDb } from "@/lib/db/db";
import { kakaoChat } from "@/lib/db/schema";
import { kst } from "@/lib/kst";
// embed is loaded lazily inside execute() to avoid loading @huggingface/transformers
// in Vercel serverless (depends on native onnxruntime binary).

const COSINE_DISTANCE_THRESHOLD = 0.5;

// 카톡 내보내기 시각과 "몇 월 며칠" 질문은 모두 KST 기준이라 날짜 경계도 KST로 맞춘다.
// (DB 세션 타임존이 UTC라서 ::timestamp 캐스트는 9시간 어긋난다)
const KST_OFFSET = "+09:00";
const DAY_MS = 24 * 60 * 60 * 1000;

// keyword 검색은 몇 개만, 날짜 범위 전체 조회는 그날 대화가 통째로 들어오도록 크게 잡는다.
const KEYWORD_LIMIT = { fallback: 10, max: 50 };
const BROWSE_LIMIT = { fallback: 1000, max: 2000 };

const sharedSchema = {
  dateFrom: z
    .string()
    .optional()
    .describe("검색할 날짜 범위 시작 (KST 기준, 예: 2026-09-16 또는 2026-09-16 18:00)"),
  dateTo: z
    .string()
    .optional()
    .describe(
      "검색할 날짜 범위 끝 (KST 기준, 예: 2026-09-30). 생략하면 dateFrom 당일만 검색합니다."
    ),
  limit: z
    .number()
    .optional()
    .describe(
      "최대 결과 개수. keyword 검색은 기본 10·최대 50, 날짜 범위 전체 조회는 기본 1000·최대 2000."
    ),
  user: z
    .enum(["볼따구", "이원찬"])
    .optional()
    .describe("특정 사용자로 필터링 (볼따구 or 이원찬)"),
};

const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/** 날짜/시각 문자열을 KST 기준 시점으로 해석합니다. 날짜만 주어지면 fallbackTime을 KST 시각으로 붙입니다. */
const parseKstInstant = (raw: string, fallbackTime: string, field: string): Date => {
  const value = raw.trim().replace(" ", "T");
  const hasOffset = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
  const iso = hasOffset
    ? value
    : isDateOnly(value)
      ? `${value}T${fallbackTime}${KST_OFFSET}`
      : `${value}${KST_OFFSET}`;

  const parsed = new Date(iso);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${field} 날짜 형식이 올바르지 않습니다: ${raw} (예: 2026-09-16)`);
  }

  return parsed;
};

const buildDateUserConditions = (dateFrom?: string, dateTo?: string, user?: string) => {
  const conditions: SQL[] = [];
  const from = dateFrom?.trim();
  const to = dateTo?.trim();
  const start = from ? parseKstInstant(from, "00:00:00.000", "dateFrom") : undefined;

  if (start) {
    conditions.push(sql`${kakaoChat.date} >= ${start.toISOString()}::timestamptz`);
  }

  if (to) {
    if (isDateOnly(to)) {
      // 날짜만 준 경우 그날 하루 전체를 포함한다.
      const endExclusive = new Date(
        parseKstInstant(to, "00:00:00.000", "dateTo").getTime() + DAY_MS
      );
      conditions.push(
        sql`${kakaoChat.date} < ${endExclusive.toISOString()}::timestamptz`
      );
    } else {
      const end = parseKstInstant(to, "00:00:00.000", "dateTo");
      conditions.push(sql`${kakaoChat.date} <= ${end.toISOString()}::timestamptz`);
    }
  } else if (start) {
    // dateTo가 없으면 dateFrom 하루치만 본다.
    const endExclusive = new Date(start.getTime() + DAY_MS);
    conditions.push(sql`${kakaoChat.date} < ${endExclusive.toISOString()}::timestamptz`);
  }

  if (user) {
    conditions.push(sql`${kakaoChat.user} = ${user}`);
  }

  return conditions;
};

const countMatches = async (conditions: SQL[]) => {
  const [row] = await getDb()
    .select({ total: sql<number>`count(*)::int` })
    .from(kakaoChat)
    .where(sql.join(conditions, sql` AND `));

  return row?.total ?? 0;
};

const formatResults = (
  results: { id: number; date: Date; user: string; message: string }[]
) =>
  results.map((r) => ({
    date: kst(r.date).format("YYYY-MM-DD HH:mm"),
    user: r.user,
    message: r.message,
  }));

// ─── Vector Search (의미 기반 검색) ───

export const memoryVectorSearch = tool({
  description: `카카오톡 대화 내용을 의미(벡터) 기반으로 검색합니다.
비슷한 의미의 대화를 찾을 때 사용하세요.
특정 날짜의 대화 전체가 궁금하면 keyword 없이 memory_keyword_search를 사용하세요.
예: "닭갈비" 검색 → 닭갈비 먹은 날 찾기
예: "영화" 검색 → 같이 본 영화 찾기
예: "신도림" 검색 → 신도림에서 만난 날 찾기
예: "3월에 닭갈비 얘기" → "2024-03-01" ~ "2024-03-31" + "닭갈비"`,
  inputSchema: z.object({
    keyword: z.string().describe("검색할 키워드 (의미 기반 벡터 검색)"),
    ...sharedSchema,
  }),
  execute: async ({ keyword, dateFrom, dateTo, limit, user }) => {
    const db = getDb();
    const conditions = buildDateUserConditions(dateFrom, dateTo, user);

    const { embed } = await import("@/lib/embedding");
    const keywordEmbedding = await embed(keyword);
    const vecLiteral = `[${keywordEmbedding.join(",")}]`;

    conditions.push(
      sql`${kakaoChat.embedding} <=> ${vecLiteral}::vector < ${COSINE_DISTANCE_THRESHOLD}`
    );

    const take = Math.min(limit ?? KEYWORD_LIMIT.fallback, KEYWORD_LIMIT.max);

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
      .limit(take);

    return {
      count: results.length,
      keyword,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      results: formatResults(results),
    };
  },
});

// ─── Keyword Search (문자열 ILIKE 검색 / 날짜 범위 전체 조회) ───

export const memoryKeywordSearch = tool({
  description: `카카오톡 대화 내용을 키워드(문자열 부분일치)로 검색합니다.
정확한 단어나 문장이 기억날 때 사용하세요.
keyword를 생략하면 dateFrom~dateTo 범위의 모든 대화를 시간순으로 반환합니다. ("그날 무슨 대화 했지?" 질문용)
예: "닭갈비" 검색 → "닭갈비"라는 단어가 포함된 대화 찾기
예: "영화" 검색 → "영화"라는 단어가 포함된 대화 찾기
예: "3월에 닭갈비" → "2024-03-01" ~ "2024-03-31" + "닭갈비"
예: "9월 16일 무슨 대화 했지?" → dateFrom: "2026-09-16"만 지정 (keyword 생략) → 그날 대화 전부`,
  inputSchema: z.object({
    keyword: z
      .string()
      .optional()
      .describe(
        "검색할 키워드 (부분일치 ILIKE 검색, 띄어쓰기 포함). 생략하면 날짜 범위의 모든 대화를 반환합니다."
      ),
    ...sharedSchema,
  }),
  execute: async ({ keyword, dateFrom, dateTo, limit, user }) => {
    const search = keyword?.trim();

    if (!search && !dateFrom && !dateTo) {
      return {
        count: 0,
        totalCount: 0,
        truncated: false,
        keyword: null,
        dateFrom: null,
        dateTo: null,
        message:
          "키워드 또는 날짜 범위 중 최소 하나는 필요합니다. 그날 대화 전체가 궁금하면 dateFrom에 날짜를 넣어 다시 호출하세요.",
        results: [],
      };
    }

    const db = getDb();
    const conditions = buildDateUserConditions(dateFrom, dateTo, user);

    if (search) {
      conditions.push(sql`${kakaoChat.message} ILIKE ${"%" + search + "%"}`);
    }

    const take = Math.min(
      limit ?? (search ? KEYWORD_LIMIT.fallback : BROWSE_LIMIT.fallback),
      search ? KEYWORD_LIMIT.max : BROWSE_LIMIT.max
    );

    // 한 개 더 가져와서 limit을 넘겼는지(= 잘렸는지) 판단한다.
    const rows = await db
      .select({
        id: kakaoChat.id,
        date: kakaoChat.date,
        user: kakaoChat.user,
        message: kakaoChat.message,
      })
      .from(kakaoChat)
      .where(sql.join(conditions, sql` AND `))
      .orderBy(kakaoChat.date)
      .limit(take + 1);

    const truncated = rows.length > take;
    const results = truncated ? rows.slice(0, take) : rows;

    // 잘린 경우에만 전체 개수를 세서, 모델이 시간대를 좁혀 다시 조회할 수 있게 알려준다.
    const totalCount = truncated ? await countMatches(conditions) : results.length;

    return {
      count: results.length,
      totalCount,
      truncated,
      keyword: search ?? null,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      results: formatResults(results),
    };
  },
});
