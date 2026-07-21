import { tool } from "ai";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

import { getDb } from "@/lib/db/db";
import { kakaoChat } from "@/lib/db/schema";
import { embed } from "@/lib/embedding";

const COSINE_DISTANCE_THRESHOLD = 0.5;

export const memorySearch = tool({
  description: `카카오톡 대화 내용을 키워드와 날짜로 검색합니다.
예은님과 원찬님이 나눈 모든 대화 기록을 검색할 수 있어요!
키워드만, 날짜만, 또는 둘 다 함께 써도 돼요!
예: "닭갈비" 검색 → 닭갈비 먹은 날 찾기
예: "영화" 검색 → 같이 본 영화 찾기
예: "신도림" 검색 → 신도림에서 만난 날 찾기
예: "2024-03-01" ~ "2024-03-31" → 3월 대화 몰아보기
예: "2025-12-25" → 크리스마스 대화 보기
예: "닭갈비" + "2024-03-01" ~ "2024-03-31" → 3월에 닭갈비 얘기한 날 찾기`,
  inputSchema: z.object({
    keyword: z
      .string()
      .optional()
      .describe(
        "검색할 키워드 (의미 기반 벡터 검색, 띄어쓰기 포함). dateFrom/dateTo와 함께 쓰면 AND 조건으로 검색합니다."
      ),
    dateFrom: z
      .string()
      .optional()
      .describe(
        "검색할 날짜 범위 시작 (ISO 8601, 예: 2024-03-01). keyword 없이도 사용 가능합니다."
      ),
    dateTo: z
      .string()
      .optional()
      .describe(
        "검색할 날짜 범위 끝 (ISO 8601, 예: 2024-03-31). 생략하면 dateFrom 당일만 검색합니다."
      ),
    limit: z
      .number()
      .optional()
      .default(10)
      .describe("최대 결과 개수 (기본 10, 최대 50)"),
    user: z
      .enum(["볼따구", "이원찬"])
      .optional()
      .describe("특정 사용자로 필터링 (볼따구 or 이원찬)"),
  }),
  execute: async ({ keyword, dateFrom, dateTo, limit = 10, user }) => {
    const db = getDb();

    if (!keyword && !dateFrom) {
      throw new Error("keyword 또는 dateFrom 중 하나는 필수입니다.");
    }

    const conditions = [];
    let orderBy;

    if (keyword) {
      const keywordEmbedding = await embed(keyword);
      const vecLiteral = `[${keywordEmbedding.join(",")}]`;

      conditions.push(
        sql`${kakaoChat.embedding} <=> ${vecLiteral}::vector < ${COSINE_DISTANCE_THRESHOLD}`
      );
      orderBy = sql`${kakaoChat.embedding} <=> ${vecLiteral}::vector`;
    }

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

    const query = db
      .select({
        id: kakaoChat.id,
        date: kakaoChat.date,
        user: kakaoChat.user,
        message: kakaoChat.message,
      })
      .from(kakaoChat)
      .where(sql.join(conditions, sql` AND `))
      .orderBy(orderBy ?? kakaoChat.date)
      .limit(Math.min(limit, 50));

    const results = await query;

    return {
      count: results.length,
      keyword: keyword ?? null,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      results: results.map((r) => ({
        date:
          r.date instanceof Date
            ? r.date.toISOString().slice(0, 16).replace("T", " ")
            : String(r.date).slice(0, 16),
        user: r.user,
        message: r.message,
      })),
    };
  },
});
