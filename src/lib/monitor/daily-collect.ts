import {
  claimDailyRun,
  listClientsDueForCollect,
  releaseDailyRun,
} from "@/lib/db/monitor";
import { kst } from "@/lib/kst";
import { startMoreSearch } from "@/lib/monitor/hermes";
import {
  DEFAULT_PERIOD,
  parsePeriod,
  resolveCompletedPeriod,
} from "@/lib/monitor/period";
import { DAILY_COLLECT_REQUEST, dailyCollectSlot } from "@/lib/monitor/schedule";
import type { MonitorClientView } from "@/lib/monitor/types";

/** 하치와레에게 넘기지 못했을 때 다시 확인하는 간격 */
const RETRY_MS = 5 * 60 * 1000;

const clientPeriod = (client: MonitorClientView) => {
  const rule =
    client.rules.find((r) => r.kind === "period" && r.id === "window") ??
    client.rules.find((r) => r.kind === "period");
  return parsePeriod(rule?.value) ?? DEFAULT_PERIOD;
};

/**
 * Oracle 스크립트가 주기적으로 부르는 "할 일 있어?" 처리.
 * 수집 시각 전에는 DB를 건드리지 않고 다음 확인 시각만 돌려줘서, 자주 불러도 DB가 깨지 않는다.
 */
export const runDailyCollectTick = async (origin: string) => {
  const now = kst();
  const slot = dailyCollectSlot(now);
  if (!slot.due) {
    return { started: [], failed: [], nextCheckAt: slot.next.toISOString() };
  }

  const started: string[] = [];
  const failed: { client: string; error: string }[] = [];

  for (const client of await listClientsDueForCollect(slot.key)) {
    const { since, until } = resolveCompletedPeriod(clientPeriod(client), now);
    const runId = await claimDailyRun({
      clientId: client.id,
      collectKey: slot.key,
      since: since.toDate(),
      until: until.toDate(),
    });
    if (!runId) continue;

    try {
      await startMoreSearch({
        origin,
        runId,
        clientName: client.name,
        categories: client.categories,
        rules: client.rules,
        category: null,
        request: DAILY_COLLECT_REQUEST,
        existingUrls: [],
        daily: true,
      });
      started.push(client.slug);
    } catch (error) {
      await releaseDailyRun(runId);
      failed.push({
        client: client.slug,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    started,
    failed,
    nextCheckAt: failed.length
      ? new Date(Date.now() + RETRY_MS).toISOString()
      : slot.next.toISOString(),
  };
};
