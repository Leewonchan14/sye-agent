import { readHermesSessionSummary, readLatestHermesMessages } from "@/lib/hermes/client";
import { getHermesConfig, missingHermesEnv } from "@/lib/hermes/config";
import { getHermesRunStatus } from "@/lib/hermes/run-client";

import type { MonitorProgress } from "@/lib/monitor/progress-stages";
import type { MonitorUsage } from "@/lib/monitor/types";

const parseArgs = (raw: string | undefined): Record<string, unknown> => {
  try {
    return JSON.parse(raw ?? "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
};

/** 도구 호출을 사람이 읽을 단계와 문장으로 바꾼다. */
export const describeHermesTool = (name: string, rawArgs: string | undefined) => {
  const args = rawArgs ?? "";
  if (args.includes("/api/monitor/agent")) {
    return { stage: 3, activity: "대시보드로 결과를 보내는 중" };
  }
  if (/monitor_result|build_payload|\\?"runId\\?"/.test(args)) {
    return { stage: 2, activity: "보낼 결과를 정리하는 중" };
  }
  switch (name) {
    case "skill_view":
      return { stage: 0, activity: "모니터링 규칙을 읽는 중" };
    case "skill_manage":
      return { stage: 2, activity: "이번 작업 내용을 기록하는 중" };
    case "web_search": {
      const query = String(parseArgs(rawArgs).query ?? "").slice(0, 40);
      return { stage: 1, activity: query ? `"${query}" 검색 중` : "기사를 검색하는 중" };
    }
    case "web_extract":
      return { stage: 1, activity: "기사 원문을 확인하는 중" };
    case "write_file":
      return { stage: 1, activity: "수집 도구를 준비하는 중" };
    default:
      if (name.startsWith("browser")) {
        return { stage: 1, activity: "기사 원문을 확인하는 중" };
      }
      return { stage: 1, activity: "기사를 모으고 검증하는 중" };
  }
};

/** Hermes 세션의 지금 상태. 못 읽으면 null — 화면은 시작 시각과 경과 시간만 보여 준다. */
export const readSessionProgress = async (
  sessionId: string
): Promise<MonitorProgress | null> => {
  const config = getHermesConfig();
  const [summary, messages] = await Promise.all([
    readHermesSessionSummary(config, sessionId),
    readLatestHermesMessages(config, sessionId, 6),
  ]);
  if (!summary) return null;

  const lastCall = messages.flatMap((m) => m.tool_calls ?? []).at(-1)?.function;
  const described = lastCall
    ? describeHermesTool(lastCall.name ?? "", lastCall.arguments)
    : { stage: 0, activity: "요청을 읽는 중" };
  const lastAt = messages
    .map((m) => m.timestamp ?? 0)
    .reduce((a, b) => Math.max(a, b), 0);

  return {
    steps: summary.tool_call_count ?? 0,
    ...described,
    lastActivityAt: lastAt ? new Date(lastAt * 1000).toISOString() : null,
  };
};

/** 진행 중인 Hermes 런의 진행 상황 */
export const readRunProgress = async (
  hermesRunId: string
): Promise<MonitorProgress | null> => {
  if (hermesRunId === "starting" || missingHermesEnv().length) return null;
  const status = await getHermesRunStatus(getHermesConfig(), hermesRunId);
  return status?.session_id ? readSessionProgress(status.session_id) : null;
};

/** 이 Hermes 런에 쓴 작업량. 못 읽으면 null — 결과 저장은 막지 않는다. */
export const readRunUsage = async (hermesRunId: string): Promise<MonitorUsage | null> => {
  if (hermesRunId === "starting" || missingHermesEnv().length) return null;
  const config = getHermesConfig();
  const status = await getHermesRunStatus(config, hermesRunId);
  if (!status?.session_id) return null;
  const summary = await readHermesSessionSummary(config, status.session_id);
  if (!summary) return null;
  return {
    tokens: (summary.input_tokens ?? 0) + (summary.output_tokens ?? 0),
    tools: summary.tool_call_count ?? 0,
  };
};
