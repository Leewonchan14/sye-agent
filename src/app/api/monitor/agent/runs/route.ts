import { ingestAgentRun } from "@/lib/db/monitor";
import {
  monitorErrorResponse,
  readJson,
  requireAgentAccess,
  requireAgentKey,
} from "@/lib/monitor/api";
import { agentRunSchema } from "@/lib/monitor/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hermes 전용 — 수집 결과 저장.
 * - 새 런(client·since·until): 고정 키 `x-monitor-key`만 허용
 * - "더 찾기" 결과(runId): 고정 키 또는 그 런에 발급한 콜백 토큰 `x-monitor-token`
 */
export const POST = async (req: Request) => {
  try {
    const input = agentRunSchema.parse(await readJson(req));
    const authError = input.runId
      ? await requireAgentAccess(req, { kind: "run", id: input.runId })
      : requireAgentKey(req);
    if (authError) return authError;

    return Response.json(await ingestAgentRun(input), { status: 201 });
  } catch (error) {
    return monitorErrorResponse(error, "수집 결과를 저장하지 못했어요.");
  }
};
