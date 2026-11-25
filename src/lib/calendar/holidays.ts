import holidaysData from "@/lib/calendar/holidays.json";

const HOLIDAYS = holidaysData as Record<string, string>;

export const getHoliday = (date: string): string | null => HOLIDAYS[date] ?? null;

/** [from, to] 범위의 공휴일. 날짜 오름차순 정렬된 Record. */
export const holidaysInRange = (from: string, to: string): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [date, name] of Object.entries(HOLIDAYS)) {
    if (date >= from && date <= to) result[date] = name;
  }
  return result;
};
