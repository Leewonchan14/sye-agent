import { lunarToSolar } from "@/lib/calendar/lunar";
import type { CalendarEvent, CalendarOccurrence } from "@/lib/calendar/types";
import { kst } from "@/lib/kst";

/** 함수당 최대 발생 개수. 넘으면 자른다. */
const MAX_OCCURRENCES = 400;

const pad = (value: number): string => String(value).padStart(2, "0");

const addDays = (date: string, days: number): string =>
  kst(date).add(days, "day").format("YYYY-MM-DD");

/** KST 자정 기준 하루 번호. KST 오프셋이 고정(+9)이라 매일 정확히 1씩 증가한다. */
const dayNum = (date: string): number => Math.floor(kst(date).valueOf() / 86_400_000);

const parseDate = (date: string): { y: number; m: number; d: number } => {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
};

const daysInMonth = (year: number, month: number): number =>
  kst(`${year}-${pad(month)}-01`).daysInMonth();

const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** n번째 발생의 시작일. 음력 연간 반복에서 지원 범위를 벗어나면 null. */
const occurrenceStart = (
  event: CalendarEvent,
  index: number,
  startDate: string
): string | null => {
  const start = parseDate(startDate);
  switch (event.recurrence) {
    case "daily":
      return addDays(startDate, index);
    case "weekly":
      return addDays(startDate, index * 7);
    case "biweekly":
      return addDays(startDate, index * 14);
    case "monthly": {
      const total = start.y * 12 + (start.m - 1) + index;
      const year = Math.floor(total / 12);
      const month = (total % 12) + 1;
      const day = Math.min(start.d, daysInMonth(year, month));
      return `${year}-${pad(month)}-${pad(day)}`;
    }
    case "yearly": {
      if (event.isLunar && event.lunar) {
        return lunarToSolar({
          year: event.lunar.year + index,
          month: event.lunar.month,
          day: event.lunar.day,
          leap: event.lunar.leap,
        });
      }
      const year = start.y + index;
      const day = start.m === 2 && start.d === 29 && !isLeapYear(year) ? 28 : start.d;
      return `${year}-${pad(start.m)}-${pad(day)}`;
    }
    default:
      return startDate;
  }
};

/**
 * targetDate 이상인 첫 발생 근처의 인덱스. 매일 반복이 오래 전부터 시작해도
 * 처음부터 세지 않도록 조회 구간 가까이로 건너뛴다. monthly/yearly는 보정을
 * 넉넉히 잡아 clamp 때문에 생기는 오차를 흡수한다.
 */
const estimateStartIndex = (
  event: CalendarEvent,
  startDate: string,
  targetDate: string
): number => {
  const diff = dayNum(targetDate) - dayNum(startDate);
  const target = parseDate(targetDate);
  const start = parseDate(startDate);
  switch (event.recurrence) {
    case "daily":
      return Math.max(0, Math.ceil(diff));
    case "weekly":
      return Math.max(0, Math.ceil(diff / 7));
    case "biweekly":
      return Math.max(0, Math.ceil(diff / 14));
    case "monthly":
      return Math.max(
        0,
        target.y * 12 + (target.m - 1) - (start.y * 12 + (start.m - 1)) - 2
      );
    case "yearly":
      return Math.max(0, target.y - start.y - 2);
    default:
      return 0;
  }
};

const makeOccurrence = (
  event: CalendarEvent,
  occurrenceDate: string,
  occurrenceEndDate: string,
  isRecurringInstance: boolean
): CalendarOccurrence => ({
  ...event,
  occurrenceKey: `${event.id}:${occurrenceDate}`,
  occurrenceDate,
  occurrenceEndDate,
  isRecurringInstance,
});

/** [from, to]와 겹치는 발생을 반복 규칙에 따라 펼친다. 최대 400개. */
export const expandEvent = (
  event: CalendarEvent,
  from: string,
  to: string
): CalendarOccurrence[] => {
  const startDate = kst(event.startAt).format("YYYY-MM-DD");
  const endDate = kst(event.endAt).format("YYYY-MM-DD");

  if (event.recurrence === "none") {
    if (startDate <= to && endDate >= from) {
      return [makeOccurrence(event, startDate, endDate, false)];
    }
    return [];
  }

  const durationDays = dayNum(endDate) - dayNum(startDate);
  const targetDate = addDays(from, -durationDays);
  const startIndex = estimateStartIndex(event, startDate, targetDate);

  const occurrences: CalendarOccurrence[] = [];
  const fromNum = dayNum(from);
  const toNum = dayNum(to);

  let index = startIndex;
  while (index < startIndex + MAX_OCCURRENCES) {
    const occurrenceDate = occurrenceStart(event, index, startDate);
    if (occurrenceDate !== null) {
      const occurrenceNum = dayNum(occurrenceDate);
      if (occurrenceNum > toNum) break;
      if (occurrenceNum + durationDays >= fromNum) {
        occurrences.push(
          makeOccurrence(
            event,
            occurrenceDate,
            addDays(occurrenceDate, durationDays),
            true
          )
        );
        if (occurrences.length >= MAX_OCCURRENCES) break;
      }
    }
    index += 1;
  }

  return occurrences;
};

/** from(포함) 이후 첫 발생일. 없으면 null. */
export const nextOccurrence = (event: CalendarEvent, from: string): string | null => {
  const startDate = kst(event.startAt).format("YYYY-MM-DD");

  if (event.recurrence === "none") {
    return startDate >= from ? startDate : null;
  }

  const startIndex = estimateStartIndex(event, startDate, from);
  const fromNum = dayNum(from);

  let index = startIndex;
  while (index < startIndex + MAX_OCCURRENCES) {
    const occurrenceDate = occurrenceStart(event, index, startDate);
    if (occurrenceDate !== null && dayNum(occurrenceDate) >= fromNum) {
      return occurrenceDate;
    }
    index += 1;
  }

  return null;
};
