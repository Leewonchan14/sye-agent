/** 모든 캘린더 쿼리는 ["calendar", ...] 아래에 두어 뷰별로 무효화한다. */
export const calendarKeys = {
  all: ["calendar"] as const,
  range: (from: string, to: string) => ["calendar", "range", from, to] as const,
  day: (date: string) => ["calendar", "day", date] as const,
  search: (q: string, scope: string) => ["calendar", "search", q, scope] as const,
  labels: ["calendar", "labels"] as const,
  templates: ["calendar", "templates"] as const,
  settings: ["calendar", "settings"] as const,
  diariesMonth: (month: string) => ["calendar", "diaries", "month", month] as const,
  diariesDate: (date: string) => ["calendar", "diaries", "date", date] as const,
  lunar: (date: string) => ["calendar", "lunar", "date", date] as const,
  lunarSolar: (year: number, month: number, day: number, leap: boolean) =>
    ["calendar", "lunar", "solar", year, month, day, leap] as const,
} as const;

/** 두 사람이 함께 쓰므로 상대가 입력한 일정이 자동으로 보이게 한다. */
export const CALENDAR_LIVE_QUERY = {
  staleTime: 10_000,
  refetchInterval: 30_000,
  refetchOnWindowFocus: true,
} as const;

export const calendarRequest = async <T = unknown>(
  token: string,
  path: string,
  init?: RequestInit
): Promise<T> => {
  const res = await fetch(path, {
    ...init,
    headers: {
      "x-auth-token": token,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || data === null) {
    throw new Error(data?.error ?? "요청을 처리하지 못했어요.");
  }
  return data;
};
