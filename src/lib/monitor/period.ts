import type { Dayjs } from "dayjs";

import { kst } from "@/lib/kst";

/**
 * "모니터링 기간" 규칙 — 매일 도는 수집의 시간대.
 * 값은 사람이 읽고 Hermes도 그대로 이해하도록 문자열로 저장한다.
 *   예: "전일 09:00 ~ 당일 09:00"
 * day는 수집하는 날(당일) 기준 며칠 전인지 (0 = 당일, -1 = 전일, -2 = 2일 전).
 */
export interface MonitorPeriod {
  startDay: number;
  startTime: string;
  endDay: number;
  endTime: string;
}

export const MIN_PERIOD_DAY = -6;

export const DEFAULT_PERIOD: MonitorPeriod = {
  startDay: -1,
  startTime: "09:00",
  endDay: 0,
  endTime: "09:00",
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const dayLabel = (day: number) =>
  day === 0 ? "당일" : day === -1 ? "전일" : `${-day}일 전`;

const parseDay = (label: string) => {
  if (label === "당일") return 0;
  if (label === "전일") return -1;
  const m = label.match(/^(\d)일 전$/);
  return m ? -Number(m[1]) : null;
};

const toMinutes = (day: number, time: string) => {
  const [h, m] = time.split(":").map(Number);
  return day * 1440 + h * 60 + m;
};

export const periodMinutes = (p: MonitorPeriod) =>
  toMinutes(p.endDay, p.endTime) - toMinutes(p.startDay, p.startTime);

export const isValidPeriod = (p: MonitorPeriod) =>
  TIME.test(p.startTime) &&
  TIME.test(p.endTime) &&
  p.startDay >= MIN_PERIOD_DAY &&
  p.endDay <= 0 &&
  periodMinutes(p) > 0;

export const formatPeriod = (p: MonitorPeriod) =>
  `${dayLabel(p.startDay)} ${p.startTime} ~ ${dayLabel(p.endDay)} ${p.endTime}`;

export const parsePeriod = (value: unknown): MonitorPeriod | null => {
  if (typeof value !== "string") return null;
  const m = value
    .trim()
    .match(
      /^(당일|전일|\d일 전)\s*(\d{1,2}:\d{2})\s*~\s*(당일|전일|\d일 전)\s*(\d{1,2}:\d{2})$/
    );
  if (!m) return null;
  const startDay = parseDay(m[1]);
  const endDay = parseDay(m[3]);
  if (startDay == null || endDay == null) return null;
  const period = {
    startDay,
    startTime: m[2].padStart(5, "0"),
    endDay,
    endTime: m[4].padStart(5, "0"),
  };
  return isValidPeriod(period) ? period : null;
};

/** base 날짜(기본 오늘, KST)에 수집한다면 실제로 어느 구간인지 */
export const resolvePeriod = (p: MonitorPeriod, base: Dayjs = kst()) => {
  const at = (day: number, time: string) => {
    const [h, m] = time.split(":").map(Number);
    return base.startOf("day").add(day, "day").hour(h).minute(m);
  };
  return { since: at(p.startDay, p.startTime), until: at(p.endDay, p.endTime) };
};

/**
 * 지금 수집할 수 있는 가장 최근 구간. 끝 시각이 아직 안 지났으면 하루 전 구간을 쓴다.
 * (예: "전일 18:00 ~ 당일 18:00"인데 09:00에 돌면 어제 18:00에 끝난 구간)
 */
export const resolveCompletedPeriod = (p: MonitorPeriod, now: Dayjs = kst()) => {
  const today = resolvePeriod(p, now);
  return today.until.isAfter(now) ? resolvePeriod(p, now.subtract(1, "day")) : today;
};

export const describeDuration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h && `${h}시간`, m && `${m}분`].filter(Boolean).join(" ");
};

/**
 * 사람이 자유롭게 적은 기간 문장에서 시간대를 최대한 읽어 낸다.
 * 예: "전일 오전 9시 ~ 당일 오전 9시", "전날 09:00부터 오늘 09:00까지", "09:00~09:00"
 * 날짜 말이 없으면 시작은 전일, 끝은 당일로 본다.
 */
export const parsePeriodLoose = (value: unknown): MonitorPeriod | null => {
  const strict = parsePeriod(value);
  if (strict || typeof value !== "string") return strict;
  const DAY = "(당일|오늘|전일|전날|어제|그제|\\d일\\s*전)?";
  const TIME = "(오전|오후)?\\s*(\\d{1,2})(?::(\\d{2})|\\s*시(?:\\s*(\\d{1,2})\\s*분)?)";
  const parts = [...value.matchAll(new RegExp(`${DAY}\\s*${TIME}`, "g"))];
  if (parts.length < 2) return null;
  const toDay = (label: string | undefined, fallback: number) => {
    if (!label) return fallback;
    if (/당일|오늘/.test(label)) return 0;
    if (/전일|전날|어제/.test(label)) return -1;
    if (label === "그제") return -2;
    return -Number(label.match(/\d/)![0]);
  };
  const toTime = (m: RegExpMatchArray) => {
    let h = Number(m[3]);
    if (m[2] === "오후" && h < 12) h += 12;
    if (m[2] === "오전" && h === 12) h = 0;
    const min = Number(m[4] ?? m[5] ?? 0);
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  };
  const [a, b] = parts;
  const period = {
    startDay: toDay(a[1], -1),
    startTime: toTime(a),
    endDay: toDay(b[1], 0),
    endTime: toTime(b),
  };
  return isValidPeriod(period) ? period : null;
};
