import { kst } from "@/lib/kst";

const START_DATE = process.env.NEXT_PUBLIC_COUPLE_START_DATE ?? "2026-04-11";

/** 사귀기 시작한 날로부터 오늘까지 며칠이 지났는지 반환합니다. */
export const getDDay = (): number | null => {
  const start = kst(START_DATE);
  if (!start.isValid()) return null;

  const today = kst().startOf("day");
  const startDay = start.startOf("day");

  return today.diff(startDay, "day") + 1; // 1일째부터 시작
};

/** 기념일 여부를 확인합니다 (100일, 200일, 1주년 등). */
export const getMilestone = (): string | null => {
  const days = getDDay();
  if (days === null) return null;

  if (days === 100) return "100일";
  if (days === 200) return "200일";
  if (days === 300) return "300일";
  if (days === 365) return "1주년";
  if (days === 500) return "500일";
  if (days === 730) return "2주년";
  if (days === 1000) return "1000일";

  // 매 100일 단위
  if (days > 0 && days % 100 === 0) return `${days}일`;

  return null;
};
