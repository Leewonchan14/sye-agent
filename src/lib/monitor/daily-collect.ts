import { claimDailyRun, listAutoCollectClients, releaseDailyRun } from "@/lib/db/monitor";
import { kst } from "@/lib/kst";
import { startMoreSearch } from "@/lib/monitor/hermes";
import { resolvePeriod } from "@/lib/monitor/period";
import {
  clientPeriod,
  collectSlotOn,
  DAILY_COLLECT_REQUEST,
} from "@/lib/monitor/schedule";

/** 하치와레에게 넘기지 못했을 때 다시 확인하는 간격 */
const RETRY_MS = 5 * 60 * 1000;
/** 자동 수집이 켜진 고객사가 없을 때 다시 확인하는 간격 */
const IDLE_MS = 60 * 60 * 1000;

/**
 * Oracle 스크립트가 부르는 "할 일 있어?" 처리.
 * 고객사마다 모니터링 기간이 끝나는 시각에 수집을 시작하고, 가장 가까운 다음 시각을
 * 돌려준다. 스크립트는 그때까지 호출하지 않으므로 1분 주기로 돌아도 DB가 깨지 않는다.
 */
export const runDailyCollectTick = async (origin: string, now = kst()) => {
  const collectKey = now.format("YYYY-MM-DD");
  const clients = await listAutoCollectClients(collectKey);

  const started: string[] = [];
  const failed: { client: string; error: string }[] = [];
  const upcoming: number[] = [];

  for (const { client, collected } of clients) {
    const period = clientPeriod(client.rules);
    const slot = collectSlotOn(period, now);
    upcoming.push(
      (!collected && now.isBefore(slot)
        ? slot
        : collectSlotOn(period, now.add(1, "day"))
      ).valueOf()
    );
    if (collected || now.isBefore(slot)) continue;

    const { since, until } = resolvePeriod(period, now);
    const runId = await claimDailyRun({
      clientId: client.id,
      collectKey,
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

  const next = failed.length
    ? Date.now() + RETRY_MS
    : upcoming.length
      ? Math.min(...upcoming)
      : Date.now() + IDLE_MS;
  return { started, failed, nextCheckAt: new Date(next).toISOString() };
};
