import { randomUUID } from "node:crypto";

import {
  claimWeeklyRecapComment,
  getLedgerWeeklyRecap,
  saveWeeklyRecapComment,
} from "@/lib/db/ledger-recap";
import {
  getHermesConfig,
  missingHermesEnv,
  toHermesSessionId,
} from "@/lib/hermes/config";
import {
  getHermesRunStatus,
  startHermesRun,
  stopHermesRun,
} from "@/lib/hermes/run-client";
import {
  buildRecapCommentInput,
  parseRecapComment,
  RECAP_COMMENT_INSTRUCTIONS,
} from "@/lib/ledger/recap";

/** 예약 호출의 실행 제한(120초) 안에 끝나도록 잡는다. */
const DEADLINE_MS = 75_000;
const POLL_MS = 3_000;
const TERMINAL = new Set(["completed", "failed", "cancelled", "error"]);

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const askHachi = async (input: string, weekStart: string): Promise<string> => {
  const config = getHermesConfig();
  const runId = await startHermesRun(config, {
    sessionId: toHermesSessionId(config, `ledger-recap-${weekStart}-${randomUUID()}`),
    input,
    instructions: RECAP_COMMENT_INSTRUCTIONS,
  });

  const deadline = Date.now() + DEADLINE_MS;
  while (Date.now() < deadline) {
    await delay(POLL_MS);
    const status = await getHermesRunStatus(config, runId);
    if (!status || !TERMINAL.has(status.status)) continue;
    if (status.status !== "completed") {
      throw new Error(
        status.error || `하치와레 작업이 ${status.status} 상태로 끝났어요.`
      );
    }
    return status.output ?? "";
  }

  await stopHermesRun(config, runId);
  throw new Error("하치와레가 제한 시간 안에 답하지 않았어요.");
};

/**
 * 지난주 리캡 코멘트를 하치와레에게 받아 저장한다. 예약 호출 뒤에 돌며,
 * 실패해도 카드의 수치는 그대로 보이므로 로그만 남긴다.
 */
export const writeWeeklyRecapComment = async (): Promise<void> => {
  try {
    if (missingHermesEnv().length) return;

    const recap = await getLedgerWeeklyRecap();
    if (recap.expense === 0) return;
    if (!(await claimWeeklyRecapComment(recap.from, recap.expense))) return;

    const output = await askHachi(buildRecapCommentInput(recap), recap.from);
    const comment = parseRecapComment(output);
    if (!comment) {
      throw new Error("코멘트 형식이 맞지 않아 저장하지 않았어요.");
    }
    await saveWeeklyRecapComment(recap.from, recap.expense, comment);
  } catch (error) {
    console.error("[ledger-recap]", error instanceof Error ? error.message : error);
  }
};
