import KoreanLunarCalendar from "korean-lunar-calendar";

import type { LunarDate } from "@/lib/calendar/types";

/** 자주 쓰는 날짜의 변환 결과를 재사용한다. 실패(null)도 캐시해 반복 계산을 피한다. */
const solarToLunarCache = new Map<string, LunarDate | null>();

const pad = (value: number): string => String(value).padStart(2, "0");

/** 양력 → 음력. 범위 밖/잘못된 날짜는 null. 절대 throw하지 않는다. */
export const solarToLunar = (date: string): LunarDate | null => {
  const cached = solarToLunarCache.get(date);
  if (cached !== undefined) return cached;

  const parts = date.split("-").map(Number);
  const calendar = new KoreanLunarCalendar();
  if (!calendar.setSolarDate(parts[0], parts[1], parts[2])) {
    solarToLunarCache.set(date, null);
    return null;
  }
  const result = calendar.getLunarCalendar();
  const lunar: LunarDate = {
    year: result.year,
    month: result.month,
    day: result.day,
    leap: result.intercalation ?? false,
  };
  solarToLunarCache.set(date, lunar);
  return lunar;
};

/** 음력 → 양력(YYYY-MM-DD). 잘못된 날짜는 null. 절대 throw하지 않는다. */
export const lunarToSolar = (lunar: LunarDate): string | null => {
  const calendar = new KoreanLunarCalendar();
  if (!calendar.setLunarDate(lunar.year, lunar.month, lunar.day, lunar.leap)) return null;
  const result = calendar.getSolarCalendar();
  return `${result.year}-${pad(result.month)}-${pad(result.day)}`;
};

/** "음 10.17", 윤달이면 "음 윤10.17". */
export const lunarLabel = (lunar: LunarDate): string =>
  lunar.leap ? `음 윤${lunar.month}.${lunar.day}` : `음 ${lunar.month}.${lunar.day}`;

/** 해당 음력 달의 일수(29 또는 30). 유효하지 않으면 0. */
export const lunarDaysInMonth = (year: number, month: number, leap = false): number => {
  const calendar = new KoreanLunarCalendar();
  if (calendar.setLunarDate(year, month, 30, leap)) return 30;
  if (calendar.setLunarDate(year, month, 29, leap)) return 29;
  return 0;
};
