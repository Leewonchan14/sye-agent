import type { Dayjs } from "dayjs";

import { kst } from "@/lib/kst";
import {
  DEFAULT_PERIOD,
  type MonitorPeriod,
  parsePeriod,
  resolvePeriod,
} from "@/lib/monitor/period";
import type { MonitorRule } from "@/lib/monitor/types";

/** 모니터링 기간이 전날 이전에 끝나서 언제든 모을 수 있을 때 수집을 시작하는 시각 (KST) */
const FALLBACK_COLLECT_HOUR = 9;

/** 대시보드에 "찾고 있어요 · ○○"로 보이는 문구이자 자동 수집을 구분하는 표시 */
export const DAILY_COLLECT_REQUEST = "매일 자동 수집";

/** 고객사의 "모니터링 기간" 규칙. 없거나 형식이 틀리면 기본 기간을 쓴다. */
export const clientPeriod = (rules: MonitorRule[]): MonitorPeriod => {
  const rule =
    rules.find((r) => r.kind === "period" && r.id === "window") ??
    rules.find((r) => r.kind === "period");
  return parsePeriod(rule?.value) ?? DEFAULT_PERIOD;
};

/** day에 수집을 시작하는 시각 — 그날 끝나는 기간이면 끝나는 바로 그때 */
export const collectSlotOn = (period: MonitorPeriod, day: Dayjs) =>
  period.endDay === 0
    ? resolvePeriod(period, day).until
    : day.startOf("day").hour(FALLBACK_COLLECT_HOUR);

export const nextCollectLabel = (rules: MonitorRule[], now: Dayjs = kst()) => {
  const period = clientPeriod(rules);
  const today = collectSlotOn(period, now);
  const next = now.isBefore(today) ? today : collectSlotOn(period, now.add(1, "day"));
  return next.format("M월 D일 (dd) HH:mm");
};
