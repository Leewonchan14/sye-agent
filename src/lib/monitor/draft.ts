import { z } from "zod";

import {
  getHermesConfig,
  missingHermesEnv,
  toHermesSessionId,
} from "@/lib/hermes/config";
import { getHermesRunStatus, startHermesRun } from "@/lib/hermes/run-client";
import { formatPeriod, parsePeriod } from "@/lib/monitor/period";

const draftSchema = z.object({
  categories: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        goal: z.number().int().min(0).max(100).nullable().catch(null),
      })
    )
    .min(1)
    .max(12),
  excludeMedia: z.array(z.string().trim().min(1).max(80)).max(60).catch([]),
  period: z.string().nullable().catch(null),
});

export type MonitorSetupDraft = z.infer<typeof draftSchema>;

const FINISHED = new Set(["completed", "failed", "cancelled", "error"]);

/** 평소 요청 문장으로 고객사 설정 초안을 만들도록 하치와레에게 맡긴다. */
export const startSetupDraft = async (clientName: string, request: string) => {
  const missing = missingHermesEnv();
  if (missing.length) throw new Error(`Hermes 설정이 비어 있어요: ${missing.join(", ")}`);
  const config = getHermesConfig();
  return startHermesRun(config, {
    sessionId: toHermesSessionId(config, `monitor-draft-${Date.now()}`),
    input: [
      "[모니터링 설정 초안 요청]",
      `고객사: ${clientName}`,
      "사용자가 뉴스 모니터링을 맡길 때 보내던 요청:",
      request,
      "",
      "이 요청을 읽고 대시보드 설정 초안을 만들어. 도구는 쓰지 말고 아래 JSON 하나로만 답해. 설명이나 코드블록은 쓰지 마.",
      '{"categories":[{"name":"기사를 나눌 카테고리 이름","goal":3}],"excludeMedia":["제외할 매체"],"period":"전일 09:00 ~ 당일 09:00"}',
      "goal은 요청에 건수가 있으면 그 숫자, 없으면 null.",
      'period는 요청에 기간이 있을 때만 "전일 HH:mm ~ 당일 HH:mm" 형식으로 쓰고, 없으면 null.',
      "excludeMedia는 요청에 제외 매체가 있을 때만 채우고, 없으면 빈 배열.",
    ].join("\n"),
  });
};

/** 답변에서 JSON 한 덩어리를 꺼내 검증한다. 형식이 틀리면 null */
export const parseSetupDraft = (output: string): MonitorSetupDraft | null => {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = draftSchema.parse(JSON.parse(output.slice(start, end + 1)));
    const period = parsePeriod(parsed.period);
    return { ...parsed, period: period ? formatPeriod(period) : null };
  } catch {
    return null;
  }
};

export type SetupDraftState =
  | { status: "running" }
  | { status: "failed"; error: string }
  | { status: "done"; draft: MonitorSetupDraft };

export const readSetupDraft = async (hermesRunId: string): Promise<SetupDraftState> => {
  const status = await getHermesRunStatus(getHermesConfig(), hermesRunId);
  if (!status || !FINISHED.has(status.status)) return { status: "running" };
  if (status.status !== "completed") {
    return { status: "failed", error: "하치와레가 초안을 만들지 못했어요." };
  }
  const draft = parseSetupDraft(status.output ?? "");
  return draft
    ? { status: "done", draft }
    : { status: "failed", error: "초안을 읽지 못했어요. 카테고리를 직접 적어 주세요." };
};
