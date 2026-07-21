import "dayjs/locale/ko";
import customParseFormat from "dayjs/plugin/customParseFormat";
import _ from "lodash";
import Papa from "papaparse";

import { sql } from "drizzle-orm";

import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db/db";
import { kakaoChat } from "@/lib/db/schema";
import { embedBatch } from "@/lib/embedding";
import { dayjs } from "@/lib/kst";
import type { Dayjs } from "dayjs";

dayjs.extend(customParseFormat);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const COLUMN_ALIASES: Record<string, string> = {
  date: "date",
  날짜: "date",
  user: "user",
  사용자: "user",
  name: "user",
  이름: "user",
  sender: "user",
  보낸사람: "user",
  message: "message",
  메시지: "message",
  content: "message",
  내용: "message",
  text: "message",
  msg: "message",
};

const DATE_FORMATS = [
  "YYYY-MM-DD HH:mm:ss",
  "YYYY-MM-DD",
  "YYYY년 M월 D일 A h:mm",
  "YYYY. M. D. A h:mm",
  "MMM D, YYYY h:mm A",
  "MMM D, YYYY h:mm:ss A",
  "MM/DD/YYYY HH:mm",
  "M/D/YYYY HH:mm",
];

const asKst = (d: Dayjs): Date => {
  // dayjs는 로컬 타임존 기준으로 해석하므로 KST(UTC+9)로 보정
  const kstOffset = 9 * 60;
  const localOffset = new Date().getTimezoneOffset();
  return new Date(d.valueOf() + (localOffset + kstOffset) * 60 * 1000);
};

const parseDate = (raw: string): Date | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  for (const fmt of DATE_FORMATS) {
    const hasKorean = fmt.includes("A");
    const d = hasKorean ? dayjs(trimmed, fmt, "ko", true) : dayjs(trimmed, fmt, true);
    if (d.isValid()) return asKst(d);
  }

  return null;
};

interface CsvRow {
  date: Date;
  user: string;
  message: string;
}

const normalizeColumns = (headers: string[]): string[] =>
  headers.map((h) => {
    const key = h.trim().toLowerCase();
    return COLUMN_ALIASES[key] ?? key;
  });

const parseRows = (data: Record<string, string>[]): CsvRow[] => {
  if (data.length === 0) return [];

  const cols = normalizeColumns(Object.keys(data[0]));
  const dateIdx = cols.indexOf("date");
  const userIdx = cols.indexOf("user");
  const msgIdx = cols.indexOf("message");

  if (dateIdx === -1 || userIdx === -1 || msgIdx === -1) {
    return autoDetectColumns(data);
  }

  const rows: CsvRow[] = [];

  for (const row of data) {
    const values = Object.values(row) as string[];
    const rawDate = values[dateIdx] ?? "";
    const rawUser = values[userIdx] ?? "";
    const rawMsg = values[msgIdx] ?? "";
    const user = rawUser.trim();

    if (!rawDate.trim() || !user || !rawMsg.trim()) continue;

    const date = parseDate(rawDate);
    if (!date) continue;

    rows.push({ date, user, message: rawMsg.trim() });
  }

  return rows;
};

const autoDetectColumns = (data: Record<string, string>[]): CsvRow[] => {
  const keys = Object.keys(data[0]);
  const colCount = keys.length;

  if (colCount < 3) return [];

  const dateScore = new Array(colCount).fill(0);
  const userScore = new Array(colCount).fill(0);
  const msgScore = new Array(colCount).fill(0);
  const scanLimit = Math.min(data.length, 50);

  for (let i = 0; i < scanLimit; i++) {
    const row = data[i];
    const values = Object.values(row) as string[];

    for (let j = 0; j < colCount && j < values.length; j++) {
      const val = values[j]?.trim() ?? "";

      if (DATE_FORMATS.some((f) => dayjs(val.trim(), f, true).isValid())) {
        dateScore[j]++;
      } else if (val.length > 0 && val.length < 20) {
        userScore[j]++;
      }
      if (val.length > 10) {
        msgScore[j]++;
      }
    }
  }

  const best = (scores: number[]): number =>
    _.maxBy(
      scores.map((v, i) => ({ v, i })),
      (x) => x.v
    )?.i ?? -1;

  const dIdx = best(dateScore);
  const uIdx = best(userScore);
  const mIdx = best(msgScore);

  if (dIdx === -1 || uIdx === -1 || mIdx === -1) return [];
  if (dIdx === uIdx || dIdx === mIdx || uIdx === mIdx) return [];

  const rows: CsvRow[] = [];

  for (const row of data) {
    const values = Object.values(row) as string[];
    const rawDate = values[dIdx] ?? "";
    const rawUser = values[uIdx] ?? "";
    const rawMsg = values[mIdx] ?? "";
    const user = rawUser.trim();

    if (!rawDate.trim() || !user || !rawMsg.trim()) continue;

    const date = parseDate(rawDate);
    if (!date) continue;

    rows.push({ date, user, message: rawMsg.trim() });
  }

  return rows;
};

export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  // Parse file before streaming (need full data to start processing)
  let formData: FormData;
  let file: File | null;
  try {
    formData = await req.formData();
    file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "파일이 필요합니다." }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "요청을 처리할 수 없습니다." }, { status: 400 });
  }

  const csvText = await file.text();
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  if (result.errors.length > 0) {
    const critical = result.errors.filter((e) => e.type !== "FieldMismatch");
    if (critical.length > 0) {
      return Response.json(
        { error: "CSV 파싱 중 오류가 발생했습니다.", details: critical },
        { status: 400 }
      );
    }
  }

  const data = result.data as Record<string, string>[];
  if (data.length === 0) {
    return Response.json({ error: "파싱된 데이터가 없습니다." }, { status: 400 });
  }

  const rows = parseRows(data);
  if (rows.length === 0) {
    return Response.json(
      { error: "유효한 대화 데이터를 찾을 수 없습니다. CSV 형식을 확인해주세요." },
      { status: 400 }
    );
  }

  // ── SSE stream ──
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        const db = getDb();
        const totalFromCsv = rows.length;

        send("parse", { totalRows: totalFromCsv });

        // ── Dedup: filter out rows already in DB before embedding ──
        const minDate = rows.reduce(
          (min, r) => (r.date < min ? r.date : min),
          rows[0].date
        );
        const maxDate = rows.reduce(
          (max, r) => (r.date > max ? r.date : max),
          rows[0].date
        );

        const existingRows = await db
          .select({
            date: kakaoChat.date,
            user: kakaoChat.user,
            message: kakaoChat.message,
          })
          .from(kakaoChat)
          .where(
            sql`${kakaoChat.date} >= ${minDate} AND ${kakaoChat.date} <= ${maxDate}`
          );

        const existingSet = new Set(
          existingRows.map((r) => `${r.date?.toISOString()}|${r.user}|${r.message}`)
        );

        const newRows = rows.filter(
          (r) => !existingSet.has(`${r.date.toISOString()}|${r.user}|${r.message}`)
        );

        const total = newRows.length;
        const preFilteredSkipped = totalFromCsv - total;

        if (total === 0) {
          send("done", {
            totalRows: totalFromCsv,
            inserted: 0,
            skipped: totalFromCsv,
            summary: `모든 메시지가 이미 존재합니다 (${totalFromCsv}개 중복)`,
          });
          controller.close();
          return;
        }

        // Embedding (only for new rows)
        const messages = newRows.map((r) => r.message);
        const embeddings = await embedBatch(messages, (done) => {
          send("embedding", { done, total });
        });

        // Insert in batches
        let inserted = 0;
        const batchSize = 100;
        const batches = _.chunk(newRows, batchSize);

        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i];
          const offset = i * batchSize;

          const result = await db
            .insert(kakaoChat)
            .values(
              batch.map((r, j) => ({
                date: r.date,
                user: r.user,
                message: r.message,
                embedding: embeddings[offset + j],
              }))
            )
            .onConflictDoNothing();

          inserted += result.rowCount ?? 0;
          send("insert", { inserted, total });
        }

        const totalSkipped = preFilteredSkipped + (total - inserted);

        send("done", {
          totalRows: totalFromCsv,
          inserted,
          skipped: totalSkipped,
          summary: `${totalFromCsv}개 중 ${inserted}개 저장됨${totalSkipped > 0 ? ` (${totalSkipped}개 중복 제외)` : ""}`,
        });
      } catch (error) {
        console.error("SSE upload error:", error);
        send("error", {
          message: "대화 기록 업로드 중 오류가 발생했습니다.",
          details: error instanceof Error ? error.message : String(error),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
