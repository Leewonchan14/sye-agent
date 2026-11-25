import { labelColor } from "@/lib/calendar/labels";
import type {
  CalendarDayInfo,
  CalendarLabel,
  CalendarOccurrence,
  CalendarSettings,
} from "@/lib/calendar/types";
import { kst } from "@/lib/kst";

/** 캘린더 화면들이 함께 쓰는 표시용 순수 함수. */

export const todayKst = (): string => kst().format("YYYY-MM-DD");

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  showHolidays: true,
  showPhotos: true,
  weekStart: 0,
  highlightWeekend: true,
  lunarDetail: true,
  lunarMonth: false,
  lunarEvent: true,
  minuteStep: 10,
  plus: true,
};

export const weekdayLabels = (weekStart: 0 | 1): string[] =>
  weekStart === 0
    ? ["일", "월", "화", "수", "목", "금", "토"]
    : ["월", "화", "수", "목", "금", "토", "일"];

/** weekStart 기준 열 번호(0~6). */
export const weekdayColumn = (weekday: number, weekStart: 0 | 1): number =>
  (weekday - weekStart + 7) % 7;

/** 월 그리드 칸 배열. weekStart에 맞춰 앞을 빈 칸으로 채우고, 끝도 7의 배수로 맞춘다. */
export const monthGridCells = (
  days: CalendarDayInfo[],
  weekStart: 0 | 1
): (CalendarDayInfo | null)[] => {
  const first = days[0];
  if (!first) return [];
  const cells: (CalendarDayInfo | null)[] = [
    ...Array.from({ length: weekdayColumn(first.weekday, weekStart) }, () => null),
    ...days,
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

/** 종일 일정을 먼저, 그다음 시작 시각 순. */
export const compareOccurrences = (
  a: CalendarOccurrence,
  b: CalendarOccurrence
): number => {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return a.startAt.localeCompare(b.startAt);
};

/** 날짜별 일정. 여러 날 일정은 걸친 날마다 넣고, 각 날짜 안에서는 정렬해 둔다. */
export const groupEventsByDate = (
  events: CalendarOccurrence[],
  days: CalendarDayInfo[]
): Map<string, CalendarOccurrence[]> => {
  const map = new Map<string, CalendarOccurrence[]>();
  for (const day of days) {
    const list = events.filter(
      (ev) => day.date >= ev.occurrenceDate && day.date <= ev.occurrenceEndDate
    );
    if (list.length > 0) map.set(day.date, list.sort(compareOccurrences));
  }
  return map;
};

/** 목록에 붙이는 짧은 시각. */
export const eventTimeText = (event: CalendarOccurrence): string =>
  event.allDay ? "종일" : kst(event.startAt).format("HH:mm");

/** 상세에 붙이는 시각 범위. */
export const eventTimeRange = (event: CalendarOccurrence): string =>
  event.allDay
    ? "종일"
    : `${kst(event.startAt).format("HH:mm")} – ${kst(event.endAt).format("HH:mm")}`;

/** 라벨 id → 색. 라벨이 없거나 지워졌으면 기본색. */
export const labelColorResolver = (
  labels: CalendarLabel[]
): ((labelId: number | null) => string) => {
  const byId = new Map(labels.map((label) => [label.id, label.color]));
  return (labelId) => {
    const color = labelId == null ? undefined : byId.get(labelId);
    return color ? labelColor(color) : "var(--color-primary)";
  };
};

/** 날짜 숫자 색. 공휴일·일요일은 빨강, 토요일은 옅게. */
export const dateColorClass = (
  day: CalendarDayInfo,
  settings: CalendarSettings
): string => {
  if (settings.showHolidays && day.holiday) return "text-error";
  if (settings.highlightWeekend && day.weekday === 0) return "text-error";
  if (settings.highlightWeekend && day.weekday === 6) return "text-muted-soft";
  return "text-body";
};

/** 연-월-일 형식인지. */
export const isIsoDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);
