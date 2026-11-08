import type { Dayjs } from "dayjs";

import { kst } from "@/lib/kst";
import { DEFAULT_PERIOD, type MonitorPeriod, parsePeriod } from "@/lib/monitor/period";
import type {
  MonitorClientView,
  MonitorIssuePayload,
  MonitorRule,
} from "@/lib/monitor/types";

/** 모니터링 기간이 전날 이전에 끝나서 언제든 모을 수 있을 때의 기본 수집 시각 */
const FALLBACK_COLLECT_TIME = "09:00";

/** 대시보드에 "찾고 있어요 · ○○"로 보이는 문구이자 자동 수집을 구분하는 표시 */
export const DAILY_COLLECT_REQUEST = "매일 자동 수집";

type CollectSettings = Pick<MonitorClientView, "rules" | "collectTime">;

const atTime = (day: Dayjs, time: string) => {
  const [h, m] = time.split(":").map(Number);
  return day.startOf("day").hour(h).minute(m);
};

/** 고객사의 "모니터링 기간" 규칙. 없거나 형식이 틀리면 기본 기간을 쓴다. */
export const clientPeriod = (rules: MonitorRule[]): MonitorPeriod => {
  const rule =
    rules.find((r) => r.kind === "period" && r.id === "window") ??
    rules.find((r) => r.kind === "period");
  return parsePeriod(rule?.value) ?? DEFAULT_PERIOD;
};

/** 수집을 시작할 수 있는 가장 이른 시각. 기간이 전날 이전에 끝나면 제한이 없다. */
export const earliestCollectTime = (period: MonitorPeriod) =>
  period.endDay === 0 ? period.endTime : null;

export const defaultCollectTime = (period: MonitorPeriod) =>
  earliestCollectTime(period) ?? FALLBACK_COLLECT_TIME;

/** 실제 수집 시각 — 기간이 끝나기 전에는 모을 수 없으니 기간 끝보다 앞서지 않는다. */
export const effectiveCollectTime = ({ rules, collectTime }: CollectSettings) => {
  const period = clientPeriod(rules);
  const earliest = earliestCollectTime(period);
  if (!collectTime) return defaultCollectTime(period);
  return earliest && collectTime < earliest ? earliest : collectTime;
};

export const collectSlotOn = (client: CollectSettings, day: Dayjs) =>
  atTime(day, effectiveCollectTime(client));

export const nextCollectAt = (
  client: CollectSettings,
  collectedToday: boolean,
  now: Dayjs = kst()
) => {
  const today = collectSlotOn(client, now);
  return !collectedToday && now.isBefore(today)
    ? today
    : collectSlotOn(client, now.add(1, "day"));
};

export const nextCollectLabel = (client: CollectSettings, collectedToday: boolean) =>
  nextCollectAt(client, collectedToday).format("M월 D일 (dd) HH:mm");

export const MIN_ISSUE_GAP_MINUTES = 30;
export const MAX_ISSUE_GAP_MINUTES = 24 * 60;

export type IssueSchedule = Pick<
  MonitorIssuePayload["issue"],
  "collectStart" | "collectGapMinutes"
>;

/** 하루의 집계 시각(HH:mm) — 시작 시각부터 그날 끝까지 간격마다 */
export const issueCollectTimes = ({ collectStart, collectGapMinutes }: IssueSchedule) => {
  const [h, m] = collectStart.split(":").map(Number);
  const times: string[] = [];
  for (let at = h * 60 + m; at < 24 * 60; at += collectGapMinutes) {
    const hour = String(Math.floor(at / 60)).padStart(2, "0");
    times.push(`${hour}:${String(at % 60).padStart(2, "0")}`);
  }
  return times;
};

/** 가장 최근에 지난 이슈 집계 시각의 키와 다음 집계 시각 */
export const issueCollectSlot = (schedule: IssueSchedule, now: Dayjs = kst()) => {
  const times = issueCollectTimes(schedule);
  const slots = [-1, 0, 1].flatMap((offset) =>
    times.map((t) => atTime(now.add(offset, "day"), t))
  );
  const latest = slots.filter((s) => !s.isAfter(now)).at(-1)!;
  const next = slots.find((s) => s.isAfter(now))!;
  return { key: latest.format("YYYY-MM-DD-HH:mm"), next };
};
