import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";

import { MonitorError } from "@/lib/db/monitor";
import {
  getHermesConfig,
  missingHermesEnv,
  toHermesSessionId,
} from "@/lib/hermes/config";
import { getHermesRunStatus, startHermesRun } from "@/lib/hermes/run-client";
import { safeEqual } from "@/lib/monitor/api";
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

/*
 * 초안은 DB에 남기지 않고 Hermes 런 id로 다시 읽는다. 다른 사용자가 남의 런 id로 읽지 못하게
 * 화면에는 `<런 id>.<서명>` 형태의 초안 id를 준다. 서명은 요청한 사용자 id에 묶인다.
 */
const FALLBACK_SECRET = randomBytes(32).toString("hex");
const draftSecret = () => process.env.BETTER_AUTH_SECRET || FALLBACK_SECRET;

const signDraft = (userId: string, hermesRunId: string) =>
  createHmac("sha256", draftSecret())
    .update(`monitor-draft:${userId}:${hermesRunId}`)
    .digest("base64url");

/** 초안 id를 확인하고 Hermes 런 id를 꺼낸다. 다른 사용자의 초안이면 404 */
export const openDraftId = (userId: string, draftId: string) => {
  const dot = draftId.lastIndexOf(".");
  const hermesRunId = dot > 0 ? draftId.slice(0, dot) : "";
  const signature = dot > 0 ? draftId.slice(dot + 1) : "";
  if (!hermesRunId || !safeEqual(signature, signDraft(userId, hermesRunId))) {
    throw new MonitorError("초안을 찾을 수 없어요.", 404);
  }
  return hermesRunId;
};

/** 평소 요청 문장으로 고객사 설정 초안을 만들도록 에이전트에게 맡긴다. 초안 id를 돌려준다. */
export const startSetupDraft = async (
  userId: string,
  clientName: string,
  request: string
) => {
  const missing = missingHermesEnv();
  if (missing.length) throw new Error(`Hermes 설정이 비어 있어요: ${missing.join(", ")}`);
  const config = getHermesConfig(userId);
  const hermesRunId = await startHermesRun(config, {
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
  return `${hermesRunId}.${signDraft(userId, hermesRunId)}`;
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

export const readSetupDraft = async (
  userId: string,
  draftId: string
): Promise<SetupDraftState> => {
  const hermesRunId = openDraftId(userId, draftId);
  const status = await getHermesRunStatus(getHermesConfig(userId), hermesRunId);
  if (!status || !FINISHED.has(status.status)) return { status: "running" };
  if (status.status !== "completed") {
    return { status: "failed", error: "에이전트가 초안을 만들지 못했어요." };
  }
  const draft = parseSetupDraft(status.output ?? "");
  return draft
    ? { status: "done", draft }
    : { status: "failed", error: "초안을 읽지 못했어요. 카테고리를 직접 적어 주세요." };
};
