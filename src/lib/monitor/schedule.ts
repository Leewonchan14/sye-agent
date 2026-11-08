import type { Dayjs } from "dayjs";

import { kst } from "@/lib/kst";

/** 매일 자동 수집을 시작하는 시각 (KST) — 기본 모니터링 기간이 끝나는 때 */
export const DAILY_COLLECT_HOUR = 9;

/** 대시보드에 "찾고 있어요 · ○○"로 보이는 문구이자 자동 수집을 구분하는 표시 */
export const DAILY_COLLECT_REQUEST = "매일 자동 수집";

const slotOn = (day: Dayjs) => day.startOf("day").hour(DAILY_COLLECT_HOUR);

/** 오늘 수집 시각이 지났는지, 수집 날짜 키는 무엇인지, 다음 수집은 언제인지 */
export const dailyCollectSlot = (now: Dayjs = kst()) => {
  const today = slotOn(now);
  const due = !now.isBefore(today);
  return {
    due,
    key: now.format("YYYY-MM-DD"),
    next: due ? slotOn(now.add(1, "day")) : today,
  };
};

export const nextCollectLabel = (now: Dayjs = kst()) =>
  dailyCollectSlot(now).next.format("M월 D일 (dd) HH:mm");
