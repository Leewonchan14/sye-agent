import {
  claimDailyRun,
  claimIssueSlot,
  getIssueRow,
  listAutoCollectClients,
  listAutoIssues,
  releaseDailyRun,
  releaseIssueSlot,
} from "@/lib/db/monitor";
import { kst } from "@/lib/kst";
import {
  reconcileIssuePending,
  startIssueRecount,
  startMoreSearch,
} from "@/lib/monitor/hermes";
import { resolvePeriod } from "@/lib/monitor/period";
import {
  clientPeriod,
  collectSlotOn,
  DAILY_COLLECT_REQUEST,
  issueCollectSlot,
  nextCollectAt,
} from "@/lib/monitor/schedule";

/** 하치와레에게 넘기지 못했을 때 다시 확인하는 간격 */
const RETRY_MS = 5 * 60 * 1000;
/** 대시보드에서 바꾼 시각을 놓치지 않도록 다음 시각이 멀어도 이 간격마다 확인한다. */
const MAX_CHECK_MS = 30 * 60 * 1000;

/**
 * Oracle 스크립트가 부르는 "할 일 있어?" 처리.
 * 고객사마다 정한 수집 시각(기본은 모니터링 기간이 끝나는 때)에 수집을 시작하고, 가장 가까운 다음 시각을
 * 돌려준다. 감시 중인 이슈는 이슈마다 정한 시작 시각과 간격으로 정기 보고를 집계한다. 스크립트는 그때까지 호출하지 않으므로 1분 주기로 돌아도 DB가 깨지 않는다.
 */
export const runDailyCollectTick = async (origin: string, now = kst()) => {
  const collectKey = now.format("YYYY-MM-DD");
  const clients = await listAutoCollectClients(collectKey);

  const started: string[] = [];
  const failed: { client: string; error: string }[] = [];
  const upcoming: number[] = [];

  for (const { client, collected } of clients) {
    const period = clientPeriod(client.rules);
    const slot = collectSlotOn(client, now);
    upcoming.push(nextCollectAt(client, collected, now).valueOf());
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

  for (const { issue, lastReportAt } of await listAutoIssues()) {
    const slot = issueCollectSlot(issue, now);
    upcoming.push(slot.next.valueOf());

    if (issue.lastAutoSlot === slot.key) continue;
    if (!(await claimIssueSlot(issue.id, slot.key))) continue;

    // 사람이 누른 집계가 돌고 있으면 이번 시각은 그 결과로 대신한다.
    await reconcileIssuePending(issue.id);
    if ((await getIssueRow(issue.id))?.pendingHermesRunId) continue;

    try {
      await startIssueRecount({
        origin,
        issueId: issue.id,
        title: issue.title,
        keywords: issue.keywords,
        brandTerms: issue.brandTerms,
        lastSnapshotAt: lastReportAt,
        isReport: true,
      });
      started.push(`issue:${issue.id}`);
    } catch (error) {
      await releaseIssueSlot(issue.id, issue.lastAutoSlot);
      failed.push({
        client: `이슈 ${issue.title}`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const next = failed.length
    ? now.valueOf() + RETRY_MS
    : Math.min(...upcoming, now.valueOf() + MAX_CHECK_MS);
  return { started, failed, nextCheckAt: new Date(next).toISOString() };
};
