import { createParser, parseAsStringLiteral } from "nuqs";

import { kst } from "@/lib/kst";

/** 통계 탭 "기간별 리포트"의 기간 종류. */
export const REPORT_RANGES = [
  { id: "month", label: "월별" },
  { id: "week", label: "주별" },
  { id: "trip", label: "여행" },
  { id: "all", label: "전체" },
  { id: "3m", label: "최근 3개월" },
  { id: "30", label: "최근 30일" },
  { id: "7", label: "최근 7일" },
  { id: "custom", label: "직접 설정" },
] as const;

export type ReportRangeId = (typeof REPORT_RANGES)[number]["id"];

/** 직접 설정 기간의 경계. KST 기준 `YYYY-MM-DDTHH:mm`. */
const REPORT_BOUND_RE = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d$/;

export const isReportBound = (value: string) => {
  const date = REPORT_BOUND_RE.exec(value)?.[1];
  return Boolean(date) && kst(date).format("YYYY-MM-DD") === date;
};

const parseAsReportBound = createParser({
  parse: (value) => (isReportBound(value) ? value : null),
  serialize: (value: string) => value,
});

/**
 * 기간별 리포트 상태를 주소 쿼리로 둔다. (?report=custom&from=2026-11-14T09:00&to=…)
 * 월별·주별의 달·주와 여행 리포트의 여행(?trip=)은 내역·달력 탭과 함께 쓰는 값이라 가계부 화면이 갖는다.
 */
export const reportQueryParsers = {
  report: parseAsStringLiteral(REPORT_RANGES.map((range) => range.id)),
  from: parseAsReportBound,
  to: parseAsReportBound,
};
