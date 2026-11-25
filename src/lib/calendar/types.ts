export type CalendarOwner = "wonchan" | "yeeun" | "together";
export type CalendarViewer = "wonchan" | "yeeun";
export type CalendarRecurrence =
  "none" | "daily" | "weekly" | "biweekly" | "monthly" | "yearly";
export type CalendarView = "month" | "twoweek" | "couple";

export type LunarDate = { year: number; month: number; day: number; leap: boolean };

export type CalendarLabel = {
  id: number;
  name: string;
  color: string;
  sortOrder: number;
};

export type CalendarSettings = {
  showHolidays: boolean;
  showPhotos: boolean;
  weekStart: 0 | 1;
  highlightWeekend: boolean;
  lunarDetail: boolean;
  lunarMonth: boolean;
  lunarEvent: boolean;
  minuteStep: number;
  plus: boolean;
};

export type CalendarEvent = {
  id: number;
  title: string;
  owner: CalendarOwner;
  allDay: boolean;
  startAt: string; // ISO with +09:00
  endAt: string;
  isLunar: boolean;
  lunar: LunarDate | null;
  recurrence: CalendarRecurrence;
  recurrenceUntil: string | null;
  labelId: number | null;
  location: string;
  memo: string;
  groupId: string | null;
  createdAt: string;
};

export type CalendarOccurrence = CalendarEvent & {
  occurrenceKey: string; // `${id}:${occurrenceDate}`
  occurrenceDate: string; // YYYY-MM-DD (KST)
  occurrenceEndDate: string; // YYYY-MM-DD, inclusive
  isRecurringInstance: boolean;
};

export type CalendarDayInfo = {
  date: string;
  weekday: number; // 0=일
  lunar: (LunarDate & { label: string }) | null;
  holiday: string | null;
};

export type DiaryPhoto = {
  id: string;
  full: string;
  thumb: string;
  width: number;
  height: number;
};

export type CalendarDiary = {
  id: number;
  date: string;
  author: CalendarViewer;
  body: string;
  photos: DiaryPhoto[];
  createdAt: string;
  updatedAt: string;
};

export type CalendarDiarySummary = {
  id: number;
  date: string;
  author: CalendarViewer;
  excerpt: string;
  thumbs: string[];
  updatedAt: string;
};

export type CalendarTemplate = {
  id: number;
  name: string;
  title: string;
  owner: CalendarOwner;
  allDay: boolean;
  labelId: number | null;
  location: string;
  memo: string;
  durationMinutes: number;
};

export type CalendarPayload = {
  from: string;
  to: string;
  today: string;
  settings: CalendarSettings;
  labels: CalendarLabel[];
  days: CalendarDayInfo[];
  events: CalendarOccurrence[];
  diaries: CalendarDiarySummary[];
};

export type CalendarDayPayload = {
  date: string;
  day: CalendarDayInfo;
  events: CalendarOccurrence[];
  diaries: CalendarDiary[];
};

export type CalendarEventInput = {
  title: string;
  owner: CalendarOwner;
  allDay: boolean;
  startDate: string;
  startTime?: string; // HH:mm, allDay면 무시
  endDate: string;
  endTime?: string;
  isLunar?: boolean;
  lunar?: LunarDate | null;
  recurrence: CalendarRecurrence;
  recurrenceUntil?: string | null;
  labelId?: number | null;
  location?: string;
  memo?: string;
  /** EVT-08 여러 날짜 일괄 등록. 있으면 이 날짜들 각각에 별도 일정 row를 만든다. */
  dates?: string[];
};

export type CalendarDiaryInput = {
  date: string;
  author: CalendarViewer;
  body: string;
  photos: DiaryPhoto[];
};
