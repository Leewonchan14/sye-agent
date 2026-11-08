export const PROGRESS_STAGES = [
  "준비",
  "기사 수집·검증",
  "결과 정리",
  "보내는 중",
] as const;

export interface MonitorProgress {
  /** 지금까지 쓴 도구 횟수 */
  steps: number;
  /** PROGRESS_STAGES의 위치 */
  stage: number;
  /** 지금 하는 일 — 도구 인자 원문은 토큰이 섞일 수 있어 그대로 내보내지 않는다. */
  activity: string;
  lastActivityAt: string | null;
}

/** 하치와레 작업량 표시 — 캐시를 뺀 토큰과 도구 횟수 */
export const formatUsage = ({ tokens, tools }: { tokens: number; tools: number }) => {
  const amount =
    tokens >= 10_000
      ? `${(tokens / 10_000).toFixed(1)}만`
      : tokens.toLocaleString("ko-KR");
  return `토큰 ${amount} · 도구 ${tools}회`;
};
