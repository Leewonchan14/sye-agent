import { kst } from "@/lib/kst";
import {
  DEFAULT_PERIOD,
  formatPeriod,
  parsePeriod,
  parsePeriodLoose,
} from "@/lib/monitor/period";
import type { MonitorRule, MonitorRuleKind } from "@/lib/monitor/types";

export const RULE_KIND_OPTIONS: {
  value: MonitorRuleKind;
  label: string;
  hint: string;
}[] = [
  { value: "toggle", label: "켜고 끄기", hint: "지킬지 말지만 정해요" },
  { value: "tags", label: "목록", hint: "제외 매체, 키워드처럼 여러 개" },
  { value: "period", label: "수집 시간대", hint: "전일 09:00 ~ 당일 09:00처럼" },
  { value: "date", label: "날짜", hint: "이 날짜부터, 엠바고 해제일 등" },
  { value: "number", label: "숫자", hint: "카테고리별 최대 건수 등" },
  { value: "text", label: "문장", hint: "자유롭게 적는 지시" },
];

export const ruleKindLabel = (kind: MonitorRuleKind) =>
  RULE_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? kind;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const defaultRuleValue = (kind: MonitorRuleKind): MonitorRule["value"] => {
  switch (kind) {
    case "toggle":
      return true;
    case "tags":
      return [];
    case "number":
      return 0;
    case "period":
      return formatPeriod(DEFAULT_PERIOD);
    case "date":
      return kst().format("YYYY-MM-DD");
    default:
      return "";
  }
};

/** 값이 종류에 맞는지 — 서버 검증과 편집 화면이 함께 쓴다. */
export const ruleValueError = (rule: Pick<MonitorRule, "kind" | "value">) => {
  const { kind, value } = rule;
  if (kind === "toggle" && typeof value !== "boolean") return "켜고 끄기 값이 아니에요.";
  if (kind === "number" && typeof value !== "number") return "숫자가 아니에요.";
  if (kind === "tags" && !Array.isArray(value)) return "목록이 아니에요.";
  if (kind === "text" && typeof value !== "string") return "문장이 아니에요.";
  if (kind === "period" && !parsePeriod(value))
    return "시간대는 '전일 09:00 ~ 당일 09:00' 형식이고 끝이 시작보다 늦어야 해요.";
  if (kind === "date" && !(typeof value === "string" && DATE.test(value)))
    return "날짜는 YYYY-MM-DD 형식이어야 해요.";
  return null;
};

/**
 * 예전에 문장(text)으로 저장된 "모니터링 기간" 규칙을 시간대(period)로 읽는다.
 * - 값이 시간대로 읽히면 그대로 옮긴다.
 * - 기본 "모니터링 기간"(id: window)은 값이 비었거나 못 읽어도 기본 시간대로 연다.
 *   (문장으로 두면 달력 선택기가 안 나오고, 잘못된 값이면 규칙 저장 전체가 막힌다.)
 * DB를 고치지 않고 읽을 때 바꿔 주므로, 다음에 저장할 때 자연스럽게 옮겨진다.
 */
export const normalizeRule = (rule: MonitorRule): MonitorRule => {
  if (rule.kind === "period") {
    if (parsePeriod(rule.value)) return rule;
    const loose = parsePeriodLoose(rule.value);
    return { ...rule, value: formatPeriod(loose ?? DEFAULT_PERIOD) };
  }
  if (rule.kind !== "text") return rule;
  const strict = parsePeriod(rule.value);
  if (strict) return { ...rule, kind: "period", value: formatPeriod(strict) };
  // 자유 문장은 시각이 두 번 나와도 기간이 아닐 수 있어서, 느슨한 해석은 기본 기간 규칙에만 쓴다.
  if (rule.id === "window") {
    const loose = parsePeriodLoose(rule.value);
    return { ...rule, kind: "period", value: formatPeriod(loose ?? DEFAULT_PERIOD) };
  }
  return rule;
};

export const newRuleId = () => `rule-${Date.now().toString(36)}`;
