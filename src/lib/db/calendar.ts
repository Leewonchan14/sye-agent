import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  like,
  lte,
  max,
  ne,
  or,
} from "drizzle-orm";
import { nanoid } from "nanoid";

import { getHoliday } from "@/lib/calendar/holidays";
import { LABEL_COLORS } from "@/lib/calendar/labels";
import { lunarLabel, lunarToSolar, solarToLunar } from "@/lib/calendar/lunar";
import { expandEvent, nextOccurrence } from "@/lib/calendar/recurrence";
import type {
  CalendarDayInfo,
  CalendarDayPayload,
  CalendarDiary,
  CalendarDiaryInput,
  CalendarDiarySummary,
  CalendarEvent,
  CalendarEventInput,
  CalendarLabel,
  CalendarOccurrence,
  CalendarOwner,
  CalendarPayload,
  CalendarRecurrence,
  CalendarSettings,
  CalendarTemplate,
  CalendarViewer,
  DiaryComment,
  DiaryPhoto,
  LunarDate,
} from "@/lib/calendar/types";
import { getDb, schema } from "@/lib/db/db";
import { kst } from "@/lib/kst";

/** API 밖으로 나가면 400으로 변환되는 검증 오류. */
export class CalendarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarError";
  }
}

/** API 밖으로 나가면 404로 변환되는 미존재 오류. */
export class CalendarNotFoundError extends CalendarError {
  constructor(message: string) {
    super(message);
    this.name = "CalendarNotFoundError";
  }
}

export const calendarErrorResponse = (error: unknown, fallback: string): Response => {
  if (error instanceof CalendarNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof CalendarError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  console.error(error);
  return Response.json({ error: fallback }, { status: 500 });
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const OWNERS: readonly CalendarOwner[] = ["wonchan", "yeeun", "together"];
const RECURRENCES: readonly CalendarRecurrence[] = [
  "none",
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "yearly",
];
const MINUTE_STEPS = new Set([1, 5, 10, 15, 30, 60]);
const MAX_PHOTOS = 4;
const MAX_PHOTO_JSON_LENGTH = 3_500_000;
const MAX_DIARY_BODY = 10_000;
const MAX_COMMENTS = 500;
const MAX_COMMENT_ID = 64;
const MAX_COMMENT_BODY = 2_000;

type SettingsRow = typeof schema.calendarSettings.$inferSelect;
type LabelRow = typeof schema.calendarLabels.$inferSelect;
type EventRow = typeof schema.calendarEvents.$inferSelect;
type DiaryRow = typeof schema.calendarDiaries.$inferSelect;
type TemplateRow = typeof schema.calendarTemplates.$inferSelect;

const addDays = (date: string, days: number): string =>
  kst(date).add(days, "day").format("YYYY-MM-DD");

const diffDays = (from: string, to: string): number =>
  kst(to).startOf("day").diff(kst(from).startOf("day"), "day");

/** createdAt/updatedAt는 defaultNow()라 실제로는 항상 있지만 타입이 nullable이라 감싼다. */
const toIso = (value: Date | null): string =>
  value ? kst(value).format() : kst().format();

const startOfDayDate = (date: string): Date => kst(date).startOf("day").toDate();
const endOfDayDate = (date: string): Date => kst(date).endOf("day").toDate();

const timeParts = (time: string | null): [number, number] => {
  const [hour, minute] = (time ?? "00:00").split(":").map(Number);
  return [hour, minute];
};

/* ───────────────────────── 행 → 공용 타입 변환 ───────────────────────── */

const toCalendarSettings = (row: SettingsRow): CalendarSettings => ({
  showHolidays: row.showHolidays,
  showPhotos: row.showPhotos,
  weekStart: row.weekStart as 0 | 1,
  highlightWeekend: row.highlightWeekend,
  lunarDetail: row.lunarDetail,
  lunarMonth: row.lunarMonth,
  lunarEvent: row.lunarEvent,
  minuteStep: row.minuteStep,
  plus: row.plus,
});

const toCalendarLabel = (row: LabelRow): CalendarLabel => ({
  id: row.id,
  name: row.name,
  color: row.color,
  sortOrder: row.sortOrder,
});

const toCalendarEvent = (row: EventRow): CalendarEvent => {
  const hasLunar =
    row.isLunar &&
    row.lunarYear !== null &&
    row.lunarMonth !== null &&
    row.lunarDay !== null;
  return {
    id: row.id,
    title: row.title,
    owner: row.owner as CalendarOwner,
    allDay: row.allDay,
    startAt: kst(row.startAt).format(),
    endAt: kst(row.endAt).format(),
    isLunar: row.isLunar,
    lunar: hasLunar
      ? {
          year: row.lunarYear as number,
          month: row.lunarMonth as number,
          day: row.lunarDay as number,
          leap: row.lunarLeap,
        }
      : null,
    recurrence: row.recurrence as CalendarRecurrence,
    recurrenceUntil: row.recurrenceUntil,
    labelId: row.labelId,
    location: row.location,
    memo: row.memo,
    groupId: row.groupId,
    createdAt: toIso(row.createdAt),
  };
};

const toCalendarDiary = (row: DiaryRow): CalendarDiary => ({
  id: row.id,
  date: row.date,
  author: row.author as CalendarViewer,
  body: row.body,
  photos: row.photos,
  comments: row.comments ?? [],
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

const toDiarySummary = (row: DiaryRow): CalendarDiarySummary => ({
  id: row.id,
  date: row.date,
  author: row.author as CalendarViewer,
  excerpt: row.body.slice(0, 80),
  thumbs: row.photos.map((photo) => photo.thumb),
  updatedAt: toIso(row.updatedAt),
});

const toCalendarTemplate = (row: TemplateRow): CalendarTemplate => ({
  id: row.id,
  name: row.name,
  title: row.title,
  owner: row.owner as CalendarOwner,
  allDay: row.allDay,
  labelId: row.labelId,
  location: row.location,
  memo: row.memo,
  durationMinutes: row.durationMinutes,
});

/* ───────────────────────── 검증 헬퍼 ───────────────────────── */

const normalizeBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== "boolean")
    throw new CalendarError(`${label} 설정이 올바르지 않아요.`);
  return value;
};

const normalizeWeekStart = (value: unknown): 0 | 1 => {
  if (value !== 0 && value !== 1) throw new CalendarError("시작 요일이 올바르지 않아요.");
  return value;
};

const normalizeMinuteStep = (value: unknown): number => {
  const step = Number(value);
  if (!MINUTE_STEPS.has(step))
    throw new CalendarError("시간 입력 단위가 올바르지 않아요.");
  return step;
};

const normalizeId = (value: unknown, label: string): number => {
  const id =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  if (!Number.isInteger(id) || id <= 0)
    throw new CalendarError(`${label} 번호가 올바르지 않아요.`);
  return id;
};

const normalizeTitle = (value: unknown): string => {
  if (typeof value !== "string") throw new CalendarError("제목을 입력해 주세요.");
  const title = value.trim();
  if (!title) throw new CalendarError("제목을 입력해 주세요.");
  if (title.length > 200) throw new CalendarError("제목은 200자 이하여야 해요.");
  return title;
};

const normalizeOwner = (value: unknown): CalendarOwner => {
  if (typeof value !== "string" || !OWNERS.includes(value as CalendarOwner)) {
    throw new CalendarError("참여자가 올바르지 않아요.");
  }
  return value as CalendarOwner;
};

const normalizeRecurrence = (value: unknown): CalendarRecurrence => {
  if (typeof value !== "string" || !RECURRENCES.includes(value as CalendarRecurrence)) {
    throw new CalendarError("반복 설정이 올바르지 않아요.");
  }
  return value as CalendarRecurrence;
};

const normalizeDate = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !DATE_RE.test(value)) {
    throw new CalendarError(`${label} 날짜가 올바르지 않아요.`);
  }
  if (kst(value).format("YYYY-MM-DD") !== value) {
    throw new CalendarError(`${label} 날짜가 올바르지 않아요.`);
  }
  return value;
};

const normalizeTime = (value: unknown): string | null => {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !TIME_RE.test(value)) {
    throw new CalendarError("시각이 올바르지 않아요.");
  }
  return value;
};

const normalizeRecurrenceUntil = (
  value: unknown,
  recurrence: CalendarRecurrence
): string | null => {
  if (recurrence === "none") return null;
  if (value == null || value === "") return null;
  return normalizeDate(value, "반복 종료");
};

const normalizeLabelId = async (value: unknown): Promise<number | null> => {
  if (value == null || value === "") return null;
  const id = normalizeId(value, "라벨");
  const rows = await getDb()
    .select({ id: schema.calendarLabels.id })
    .from(schema.calendarLabels)
    .where(eq(schema.calendarLabels.id, id))
    .limit(1);
  if (!rows.length) throw new CalendarError("라벨을 찾을 수 없어요.");
  return id;
};

const normalizeLabelName = (value: unknown): string => {
  if (typeof value !== "string") throw new CalendarError("라벨 이름을 입력해 주세요.");
  const name = value.trim();
  if (!name) throw new CalendarError("라벨 이름을 입력해 주세요.");
  if (name.length > 20) throw new CalendarError("라벨 이름은 20자 이하여야 해요.");
  return name;
};

const normalizeLabelColor = (value: unknown): string => {
  if (typeof value !== "string" || !LABEL_COLORS.some((color) => color.key === value)) {
    throw new CalendarError("라벨 색상이 올바르지 않아요.");
  }
  return value;
};

const normalizeTemplateName = (value: unknown): string => {
  if (typeof value !== "string") throw new CalendarError("템플릿 이름을 입력해 주세요.");
  const name = value.trim();
  if (!name) throw new CalendarError("템플릿 이름을 입력해 주세요.");
  return name;
};

const normalizeDurationMinutes = (value: unknown): number => {
  if (value == null) return 60;
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 1) {
    throw new CalendarError("일정 길이가 올바르지 않아요.");
  }
  return minutes;
};

const normalizeAuthor = (value: unknown): CalendarViewer => {
  if (value !== "wonchan" && value !== "yeeun") {
    throw new CalendarError("작성자가 올바르지 않아요.");
  }
  return value;
};

const normalizePhotos = (value: unknown): DiaryPhoto[] => {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new CalendarError("사진 목록이 올바르지 않아요.");
  if (value.length > MAX_PHOTOS) {
    throw new CalendarError("사진은 최대 4장까지 등록할 수 있어요.");
  }
  const photos: DiaryPhoto[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      throw new CalendarError("사진 정보가 올바르지 않아요.");
    }
    const photo = item as Record<string, unknown>;
    if (
      typeof photo.id !== "string" ||
      typeof photo.full !== "string" ||
      typeof photo.thumb !== "string" ||
      typeof photo.width !== "number" ||
      typeof photo.height !== "number"
    ) {
      throw new CalendarError("사진 정보가 올바르지 않아요.");
    }
    photos.push({
      id: photo.id,
      full: photo.full,
      thumb: photo.thumb,
      width: photo.width,
      height: photo.height,
    });
  }
  if (JSON.stringify(photos).length > MAX_PHOTO_JSON_LENGTH) {
    throw new CalendarError("사진 용량이 너무 커요.");
  }
  return photos;
};

const normalizeComments = (value: unknown): DiaryComment[] => {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new CalendarError("댓글 목록이 올바르지 않아요.");
  if (value.length > MAX_COMMENTS) {
    throw new CalendarError("댓글은 최대 500개까지 등록할 수 있어요.");
  }
  const comments: DiaryComment[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      throw new CalendarError("댓글 정보가 올바르지 않아요.");
    }
    const comment = item as Record<string, unknown>;
    if (
      typeof comment.id !== "string" ||
      comment.id.length > MAX_COMMENT_ID ||
      typeof comment.body !== "string" ||
      !comment.body ||
      comment.body.length > MAX_COMMENT_BODY ||
      typeof comment.createdAt !== "string" ||
      Number.isNaN(Date.parse(comment.createdAt))
    ) {
      throw new CalendarError("댓글 정보가 올바르지 않아요.");
    }
    comments.push({
      id: comment.id,
      author: normalizeAuthor(comment.author),
      body: comment.body,
      createdAt: comment.createdAt,
    });
  }
  return comments;
};

const normalizeDates = (raw: unknown, startDate: string): string[] => {
  if (!Array.isArray(raw)) throw new CalendarError("날짜 목록이 올바르지 않아요.");
  const seen = new Set<string>([startDate]);
  const result: string[] = [startDate];
  for (const item of raw) {
    const date = normalizeDate(item, "일정");
    if (!seen.has(date)) {
      seen.add(date);
      result.push(date);
    }
  }
  if (result.length > 31) throw new CalendarError("날짜는 31개까지 등록할 수 있어요.");
  return result;
};

/* ───────────────────────── 일정 값 계산 ───────────────────────── */

type EventValues = {
  title: string;
  owner: CalendarOwner;
  allDay: boolean;
  isLunar: boolean;
  lunarYear: number | null;
  lunarMonth: number | null;
  lunarDay: number | null;
  lunarLeap: boolean;
  recurrence: CalendarRecurrence;
  recurrenceUntil: string | null;
  labelId: number | null;
  location: string;
  memo: string;
  startDate: string;
  durationDays: number;
  startTime: string | null;
  endTime: string | null;
};

const buildStartEnd = (
  values: EventValues,
  date: string
): { startAt: Date; endAt: Date } => {
  const endDate = addDays(date, values.durationDays);
  if (values.allDay) {
    return {
      startAt: kst(date).startOf("day").toDate(),
      endAt: kst(endDate).endOf("day").toDate(),
    };
  }
  const [startHour, startMinute] = timeParts(values.startTime);
  const [endHour, endMinute] = timeParts(values.endTime);
  return {
    startAt: kst(date)
      .hour(startHour)
      .minute(startMinute)
      .second(0)
      .millisecond(0)
      .toDate(),
    endAt: kst(endDate).hour(endHour).minute(endMinute).second(0).millisecond(0).toDate(),
  };
};

const buildEventValues = async (input: CalendarEventInput): Promise<EventValues> => {
  const title = normalizeTitle(input.title);
  const owner = normalizeOwner(input.owner);
  const allDay = input.allDay === true;
  const recurrence = normalizeRecurrence(input.recurrence);

  let startDate = normalizeDate(input.startDate, "시작");
  let endDate = normalizeDate(input.endDate, "종료");
  const startTime = allDay ? null : normalizeTime(input.startTime);
  const endTime = allDay ? null : normalizeTime(input.endTime);

  if (!allDay && (startTime === null || endTime === null)) {
    throw new CalendarError("시작/종료 시각을 입력해 주세요.");
  }

  const isLunar = input.isLunar === true;
  const lunar: LunarDate | null = input.lunar ?? null;

  if (isLunar) {
    if (input.dates && input.dates.length > 0) {
      throw new CalendarError("음력 일정은 여러 날짜 등록과 함께 사용할 수 없어요.");
    }
    if (!lunar) throw new CalendarError("음력 날짜를 입력해 주세요.");
    if (recurrence !== "none" && recurrence !== "yearly") {
      throw new CalendarError("음력 일정은 반복을 없음 또는 매년만 사용할 수 있어요.");
    }
    const solar = lunarToSolar(lunar);
    if (!solar) throw new CalendarError("음력 날짜가 올바르지 않아요.");
    const duration = diffDays(startDate, endDate);
    startDate = solar;
    endDate = addDays(solar, duration);
  }

  if (endDate < startDate) {
    throw new CalendarError("종료 날짜가 시작 날짜보다 빠를 수 없어요.");
  }

  const recurrenceUntil = normalizeRecurrenceUntil(input.recurrenceUntil, recurrence);
  if (recurrenceUntil !== null && recurrenceUntil < startDate) {
    throw new CalendarError("반복 종료일은 시작일보다 빠를 수 없어요.");
  }

  const labelId = await normalizeLabelId(input.labelId);
  const location = typeof input.location === "string" ? input.location.trim() : "";
  const memo = typeof input.memo === "string" ? input.memo : "";

  return {
    title,
    owner,
    allDay,
    isLunar,
    lunarYear: isLunar && lunar ? lunar.year : null,
    lunarMonth: isLunar && lunar ? lunar.month : null,
    lunarDay: isLunar && lunar ? lunar.day : null,
    lunarLeap: isLunar && lunar ? lunar.leap : false,
    recurrence,
    recurrenceUntil,
    labelId,
    location,
    memo,
    startDate,
    durationDays: diffDays(startDate, endDate),
    startTime,
    endTime,
  };
};

/* ───────────────────────── 설정·라벨 ───────────────────────── */

/** row id=1이 없으면 기본값으로 만든 뒤 반환. */
export const getCalendarSettings = async (): Promise<CalendarSettings> => {
  const db = getDb();
  await db.insert(schema.calendarSettings).values({ id: 1 }).onConflictDoNothing();
  const rows = await db
    .select()
    .from(schema.calendarSettings)
    .where(eq(schema.calendarSettings.id, 1))
    .limit(1);
  return toCalendarSettings(rows[0]);
};

export const patchCalendarSettings = async (
  patch: Record<string, unknown>
): Promise<CalendarSettings> => {
  await getCalendarSettings();

  const updates: Record<string, unknown> = {};
  if (patch.showHolidays !== undefined) {
    updates.showHolidays = normalizeBoolean(patch.showHolidays, "공휴일 표시");
  }
  if (patch.showPhotos !== undefined) {
    updates.showPhotos = normalizeBoolean(patch.showPhotos, "사진 표시");
  }
  if (patch.weekStart !== undefined)
    updates.weekStart = normalizeWeekStart(patch.weekStart);
  if (patch.highlightWeekend !== undefined) {
    updates.highlightWeekend = normalizeBoolean(patch.highlightWeekend, "주말 강조");
  }
  if (patch.lunarDetail !== undefined) {
    updates.lunarDetail = normalizeBoolean(patch.lunarDetail, "음력 상세");
  }
  if (patch.lunarMonth !== undefined) {
    updates.lunarMonth = normalizeBoolean(patch.lunarMonth, "음력 월간");
  }
  if (patch.lunarEvent !== undefined) {
    updates.lunarEvent = normalizeBoolean(patch.lunarEvent, "음력 일정");
  }
  if (patch.minuteStep !== undefined)
    updates.minuteStep = normalizeMinuteStep(patch.minuteStep);
  if (patch.plus !== undefined) updates.plus = normalizeBoolean(patch.plus, "Plus");

  if (Object.keys(updates).length > 0) {
    updates.updatedAt = kst().toDate();
    await getDb()
      .update(schema.calendarSettings)
      .set(updates)
      .where(eq(schema.calendarSettings.id, 1));
  }

  return getCalendarSettings();
};

/** 라벨이 하나도 없으면 기본 10색을 sortOrder 순서로 넣는다. */
export const ensureCalendarLabels = async (): Promise<void> => {
  const db = getDb();
  const existing = await db
    .select({ id: schema.calendarLabels.id })
    .from(schema.calendarLabels)
    .limit(1);
  if (existing.length > 0) return;
  await db.insert(schema.calendarLabels).values(
    LABEL_COLORS.map((color, index) => ({
      name: color.name,
      color: color.key,
      sortOrder: index,
    }))
  );
};

export const getCalendarLabels = async (): Promise<CalendarLabel[]> => {
  await ensureCalendarLabels();
  const rows = await getDb()
    .select()
    .from(schema.calendarLabels)
    .orderBy(asc(schema.calendarLabels.sortOrder), asc(schema.calendarLabels.id));
  return rows.map(toCalendarLabel);
};

const findLabelRow = async (id: number): Promise<LabelRow> => {
  const rows = await getDb()
    .select()
    .from(schema.calendarLabels)
    .where(eq(schema.calendarLabels.id, id))
    .limit(1);
  if (!rows.length) throw new CalendarNotFoundError("라벨을 찾을 수 없어요.");
  return rows[0];
};

export const createCalendarLabel = async (input: {
  name?: unknown;
  color?: unknown;
}): Promise<CalendarLabel> => {
  const name = normalizeLabelName(input.name);
  const color = normalizeLabelColor(input.color);
  const db = getDb();
  const sortRows = await db
    .select({ value: max(schema.calendarLabels.sortOrder) })
    .from(schema.calendarLabels);
  const sortOrder = (sortRows[0]?.value ?? -1) + 1;
  const [row] = await db
    .insert(schema.calendarLabels)
    .values({ name, color, sortOrder })
    .returning();
  return toCalendarLabel(row);
};

export const updateCalendarLabel = async (
  idInput: unknown,
  patch: { name?: unknown; color?: unknown }
): Promise<CalendarLabel> => {
  const id = normalizeId(idInput, "라벨");
  const existing = await findLabelRow(id);

  const updates: { name?: string; color?: string } = {};
  if (patch.name !== undefined) updates.name = normalizeLabelName(patch.name);
  if (patch.color !== undefined) updates.color = normalizeLabelColor(patch.color);
  if (Object.keys(updates).length === 0) return toCalendarLabel(existing);

  const [row] = await getDb()
    .update(schema.calendarLabels)
    .set(updates)
    .where(eq(schema.calendarLabels.id, id))
    .returning();
  return toCalendarLabel(row);
};

export const deleteCalendarLabel = async (idInput: unknown): Promise<void> => {
  const id = normalizeId(idInput, "라벨");
  await findLabelRow(id);
  await getDb().delete(schema.calendarLabels).where(eq(schema.calendarLabels.id, id));
};

/* ───────────────────────── 템플릿 ───────────────────────── */

export const listCalendarTemplates = async (): Promise<CalendarTemplate[]> => {
  const rows = await getDb()
    .select()
    .from(schema.calendarTemplates)
    .orderBy(asc(schema.calendarTemplates.id));
  return rows.map(toCalendarTemplate);
};

export const createCalendarTemplate = async (
  input: Record<string, unknown>
): Promise<CalendarTemplate> => {
  const name = normalizeTemplateName(input.name);
  const title = normalizeTitle(input.title);
  const owner = normalizeOwner(input.owner);
  const allDay = input.allDay === true;
  const labelId = await normalizeLabelId(input.labelId);
  const location = typeof input.location === "string" ? input.location.trim() : "";
  const memo = typeof input.memo === "string" ? input.memo : "";
  const durationMinutes = normalizeDurationMinutes(input.durationMinutes);

  const [row] = await getDb()
    .insert(schema.calendarTemplates)
    .values({ name, title, owner, allDay, labelId, location, memo, durationMinutes })
    .returning();
  return toCalendarTemplate(row);
};

export const deleteCalendarTemplate = async (idInput: unknown): Promise<void> => {
  const id = normalizeId(idInput, "템플릿");
  const rows = await getDb()
    .select({ id: schema.calendarTemplates.id })
    .from(schema.calendarTemplates)
    .where(eq(schema.calendarTemplates.id, id))
    .limit(1);
  if (!rows.length) throw new CalendarNotFoundError("템플릿을 찾을 수 없어요.");
  await getDb()
    .delete(schema.calendarTemplates)
    .where(eq(schema.calendarTemplates.id, id));
};

/* ───────────────────────── 일정 CRUD ───────────────────────── */

const findEventRow = async (id: number): Promise<EventRow> => {
  const rows = await getDb()
    .select()
    .from(schema.calendarEvents)
    .where(eq(schema.calendarEvents.id, id))
    .limit(1);
  if (!rows.length) throw new CalendarNotFoundError("일정을 찾을 수 없어요.");
  return rows[0];
};

export const createCalendarEvent = async (
  input: CalendarEventInput
): Promise<CalendarEvent[]> => {
  const values = await buildEventValues(input);
  const dates =
    input.dates && input.dates.length > 0
      ? normalizeDates(input.dates, values.startDate)
      : [values.startDate];

  const base = buildStartEnd(values, values.startDate);
  if (base.endAt.getTime() < base.startAt.getTime()) {
    throw new CalendarError("종료 시각이 시작 시각보다 빠를 수 없어요.");
  }

  const groupId = dates.length > 1 ? nanoid() : null;

  const rows = await getDb()
    .insert(schema.calendarEvents)
    .values(
      dates.map((date) => {
        const { startAt, endAt } = buildStartEnd(values, date);
        return {
          title: values.title,
          owner: values.owner,
          allDay: values.allDay,
          startAt,
          endAt,
          isLunar: values.isLunar,
          lunarYear: values.lunarYear,
          lunarMonth: values.lunarMonth,
          lunarDay: values.lunarDay,
          lunarLeap: values.lunarLeap,
          recurrence: values.recurrence,
          recurrenceUntil: values.recurrenceUntil,
          labelId: values.labelId,
          location: values.location,
          memo: values.memo,
          groupId,
        };
      })
    )
    .returning();

  return rows.map(toCalendarEvent);
};

const rowToInput = (row: EventRow): CalendarEventInput => ({
  title: row.title,
  owner: row.owner as CalendarOwner,
  allDay: row.allDay,
  startDate: kst(row.startAt).format("YYYY-MM-DD"),
  startTime: row.allDay ? undefined : kst(row.startAt).format("HH:mm"),
  endDate: kst(row.endAt).format("YYYY-MM-DD"),
  endTime: row.allDay ? undefined : kst(row.endAt).format("HH:mm"),
  isLunar: row.isLunar,
  lunar:
    row.isLunar &&
    row.lunarYear !== null &&
    row.lunarMonth !== null &&
    row.lunarDay !== null
      ? {
          year: row.lunarYear,
          month: row.lunarMonth,
          day: row.lunarDay,
          leap: row.lunarLeap,
        }
      : null,
  recurrence: row.recurrence as CalendarRecurrence,
  recurrenceUntil: row.recurrenceUntil,
  labelId: row.labelId,
  location: row.location,
  memo: row.memo,
});

const definedFields = (patch: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
};

export const updateCalendarEvent = async (
  idInput: unknown,
  patch: Record<string, unknown>
): Promise<CalendarEvent> => {
  const id = normalizeId(idInput, "일정");
  const existing = await findEventRow(id);

  const fields = definedFields(patch) as Partial<CalendarEventInput>;
  const merged: CalendarEventInput = { ...rowToInput(existing), ...fields };
  const values = await buildEventValues(merged);

  const { startAt, endAt } = buildStartEnd(values, values.startDate);
  if (endAt.getTime() < startAt.getTime()) {
    throw new CalendarError("종료 시각이 시작 시각보다 빠를 수 없어요.");
  }

  const [row] = await getDb()
    .update(schema.calendarEvents)
    .set({
      title: values.title,
      owner: values.owner,
      allDay: values.allDay,
      startAt,
      endAt,
      isLunar: values.isLunar,
      lunarYear: values.lunarYear,
      lunarMonth: values.lunarMonth,
      lunarDay: values.lunarDay,
      lunarLeap: values.lunarLeap,
      recurrence: values.recurrence,
      recurrenceUntil: values.recurrenceUntil,
      labelId: values.labelId,
      location: values.location,
      memo: values.memo,
      updatedAt: kst().toDate(),
    })
    .where(eq(schema.calendarEvents.id, id))
    .returning();
  return toCalendarEvent(row);
};

export const deleteCalendarEvent = async (idInput: unknown): Promise<void> => {
  const id = normalizeId(idInput, "일정");
  await findEventRow(id);
  await getDb().delete(schema.calendarEvents).where(eq(schema.calendarEvents.id, id));
};

/* ───────────────────────── 범위/날짜/검색 ───────────────────────── */

const buildDays = (from: string, to: string): CalendarDayInfo[] => {
  const days: CalendarDayInfo[] = [];
  let cursor = from;
  while (cursor <= to) {
    const lunar = solarToLunar(cursor);
    days.push({
      date: cursor,
      weekday: kst(cursor).day(),
      lunar: lunar ? { ...lunar, label: lunarLabel(lunar) } : null,
      holiday: getHoliday(cursor),
    });
    cursor = kst(cursor).add(1, "day").format("YYYY-MM-DD");
  }
  return days;
};

const queryEventRows = async (from: string, to: string): Promise<EventRow[]> => {
  const db = getDb();
  const nonRecurring = await db
    .select()
    .from(schema.calendarEvents)
    .where(
      and(
        eq(schema.calendarEvents.recurrence, "none"),
        lte(schema.calendarEvents.startAt, endOfDayDate(to)),
        gte(schema.calendarEvents.endAt, startOfDayDate(from))
      )
    );
  const recurring = await db
    .select()
    .from(schema.calendarEvents)
    .where(
      and(
        ne(schema.calendarEvents.recurrence, "none"),
        or(
          isNull(schema.calendarEvents.recurrenceUntil),
          gte(schema.calendarEvents.recurrenceUntil, from)
        )
      )
    );
  return [...nonRecurring, ...recurring];
};

const compareOccurrences = (a: CalendarOccurrence, b: CalendarOccurrence): number =>
  a.occurrenceDate.localeCompare(b.occurrenceDate) ||
  a.startAt.localeCompare(b.startAt) ||
  a.id - b.id;

const getOccurrencesForRange = async (
  from: string,
  to: string
): Promise<CalendarOccurrence[]> => {
  const rows = await queryEventRows(from, to);
  return rows
    .map(toCalendarEvent)
    .flatMap((event) => expandEvent(event, from, to))
    .sort(compareOccurrences);
};

const getDiarySummaries = async (
  from: string,
  to: string
): Promise<CalendarDiarySummary[]> => {
  const rows = await getDb()
    .select()
    .from(schema.calendarDiaries)
    .where(
      and(gte(schema.calendarDiaries.date, from), lte(schema.calendarDiaries.date, to))
    )
    .orderBy(asc(schema.calendarDiaries.date), asc(schema.calendarDiaries.author));
  return rows.map(toDiarySummary);
};

export const getCalendarRange = async (
  from: string,
  to: string
): Promise<CalendarPayload> => {
  const [settings, labels, events, diaries] = await Promise.all([
    getCalendarSettings(),
    getCalendarLabels(),
    getOccurrencesForRange(from, to),
    getDiarySummaries(from, to),
  ]);
  return {
    from,
    to,
    today: kst().format("YYYY-MM-DD"),
    settings,
    labels,
    days: buildDays(from, to),
    events,
    diaries,
  };
};

export const getCalendarDay = async (date: string): Promise<CalendarDayPayload> => {
  const [events, diaries] = await Promise.all([
    getOccurrencesForRange(date, date),
    listCalendarDiariesByDate(date),
  ]);
  return {
    date,
    day: buildDays(date, date)[0],
    events,
    diaries,
  };
};

export const searchCalendarEvents = async (
  query: string,
  scope: string
): Promise<Array<{ event: CalendarEvent; nextDate: string | null }>> => {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const conditions = [
    or(
      ilike(schema.calendarEvents.title, `%${trimmed}%`),
      ilike(schema.calendarEvents.memo, `%${trimmed}%`),
      ilike(schema.calendarEvents.location, `%${trimmed}%`)
    ),
  ];
  if (scope === "wonchan" || scope === "yeeun" || scope === "together") {
    conditions.push(eq(schema.calendarEvents.owner, scope));
  }

  const rows = await getDb()
    .select()
    .from(schema.calendarEvents)
    .where(and(...conditions))
    .orderBy(desc(schema.calendarEvents.startAt))
    .limit(50);

  const today = kst().format("YYYY-MM-DD");
  return rows.map((row) => {
    const event = toCalendarEvent(row);
    const nextDate =
      nextOccurrence(event, today) ?? kst(event.startAt).format("YYYY-MM-DD");
    return { event, nextDate };
  });
};

/* ───────────────────────── 일기 ───────────────────────── */

export const upsertCalendarDiary = async (
  input: CalendarDiaryInput
): Promise<CalendarDiary> => {
  const date = normalizeDate(input.date, "날짜");
  const author = normalizeAuthor(input.author);
  const body = typeof input.body === "string" ? input.body : "";
  if (body.length > MAX_DIARY_BODY) {
    throw new CalendarError("일기 본문은 10,000자 이하여야 해요.");
  }
  const photos = normalizePhotos(input.photos);
  const comments =
    input.comments === undefined ? undefined : normalizeComments(input.comments);
  const now = kst().toDate();

  const [row] = await getDb()
    .insert(schema.calendarDiaries)
    .values({ date, author, body, photos, comments: comments ?? [], updatedAt: now })
    .onConflictDoUpdate({
      target: [schema.calendarDiaries.date, schema.calendarDiaries.author],
      set: {
        body,
        photos,
        updatedAt: now,
        ...(comments !== undefined ? { comments } : {}),
      },
    })
    .returning();
  return toCalendarDiary(row);
};

export const listCalendarDiariesByMonth = async (
  month: string
): Promise<CalendarDiary[]> => {
  if (!MONTH_RE.test(month)) throw new CalendarError("월이 올바르지 않아요.");
  const rows = await getDb()
    .select()
    .from(schema.calendarDiaries)
    .where(like(schema.calendarDiaries.date, `${month}-%`))
    .orderBy(asc(schema.calendarDiaries.date), asc(schema.calendarDiaries.author));
  return rows.map(toCalendarDiary);
};

export const listCalendarDiariesByDate = async (
  dateInput: string
): Promise<CalendarDiary[]> => {
  const date = normalizeDate(dateInput, "날짜");
  const rows = await getDb()
    .select()
    .from(schema.calendarDiaries)
    .where(eq(schema.calendarDiaries.date, date))
    .orderBy(asc(schema.calendarDiaries.author));
  return rows.map(toCalendarDiary);
};

export const deleteCalendarDiary = async (idInput: unknown): Promise<void> => {
  const id = normalizeId(idInput, "일기");
  const rows = await getDb()
    .select({ id: schema.calendarDiaries.id })
    .from(schema.calendarDiaries)
    .where(eq(schema.calendarDiaries.id, id))
    .limit(1);
  if (!rows.length) throw new CalendarNotFoundError("일기를 찾을 수 없어요.");
  await getDb().delete(schema.calendarDiaries).where(eq(schema.calendarDiaries.id, id));
};
