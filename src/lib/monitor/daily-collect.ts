import {
  advanceIssueAutoState,
  advanceRunAutoState,
  claimDailyRun,
  claimIssueSlot,
  countRunLeads,
  getIssueRow,
  getLatestSnapshot,
  getRunRow,
  listActiveAutoRuns,
  listAutoCollectClients,
  listAutoIssues,
  releaseDailyRun,
  releaseIssueSlot,
  setIssuePending,
  setRunPending,
} from "@/lib/db/monitor";
import { kst } from "@/lib/kst";
import {
  reconcileIssuePending,
  reconcileRunPending,
  startIssueRecount,
  startMoreSearch,
} from "@/lib/monitor/hermes";
import {
  collectSlotOn,
  collectWindow,
  DAILY_COLLECT_REQUEST,
  isCollectDay,
  issueCollectSlot,
  nextCollectAt,
} from "@/lib/monitor/schedule";
import type { MonitorClientView } from "@/lib/monitor/types";

/** 하치와레에게 넘기지 못했을 때 다시 확인하는 간격 */
const RETRY_MS = 5 * 60 * 1000;
/** 대시보드에서 바꾼 시각을 놓치지 않도록 다음 시각이 멀어도 이 간격마다 확인한다. */
const MAX_CHECK_MS = 30 * 60 * 1000;
/** 자동 작업이 돌고 있으면 끝을 빨리 알아채도록 자주 확인한다. */
const ACTIVE_CHECK_MS = 90 * 1000;
/** 콜백 토큰 유효 시간과 같다. 이보다 오래 끝나지 않으면 실패로 본다. */
const STALE_MS = 3 * 60 * 60 * 1000;
const STALE_ERROR = "하치와레가 3시간 안에 결과를 보내지 않았어요.";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const startDaily = (origin: string, client: MonitorClientView, runId: number) =>
  startMoreSearch({
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

type AutoIssue = Awaited<ReturnType<typeof listAutoIssues>>[number];

const startIssue = (origin: string, { issue, lastReportAt }: AutoIssue) =>
  startIssueRecount({
    origin,
    issueId: issue.id,
    title: issue.title,
    keywords: issue.keywords,
    brandTerms: issue.brandTerms,
    lastSnapshotAt: lastReportAt,
    isReport: true,
    reportRecipient: issue.reportRecipient,
    reportTemplate: issue.reportTemplate,
  });

/**
 * Oracle 스크립트가 부르는 "할 일 있어?" 처리.
 * 고객사는 정한 시각에, 감시 중인 이슈는 시작 시각과 간격대로 하치와레에게 맡긴다.
 * 끝난 자동 작업은 결과가 없으면 한 번 다시 시도하고, 완료·실패를 notifications로 돌려준다.
 * 스크립트는 nextCheckAt까지 호출하지 않으므로 1분 주기로 돌아도 DB가 깨지 않는다.
 */
export const runDailyCollectTick = async (
  origin: string,
  now = kst(),
  siteOrigin = origin
) => {
  const collectKey = now.format("YYYY-MM-DD");
  const monitorUrl = `${siteOrigin}/monitor`;
  const started: string[] = [];
  const failed: { client: string; error: string }[] = [];
  const upcoming: number[] = [];
  const notifications: string[] = [];
  let active = false;

  /* 돌고 있던 자동 수집 마무리 */
  for (const { run, client } of await listActiveAutoRuns()) {
    if (run.pendingHermesRunId) {
      if (run.pendingSince && now.valueOf() - run.pendingSince.valueOf() > STALE_MS) {
        await setRunPending(run.id, null, STALE_ERROR);
      } else {
        await reconcileRunPending(run.id);
      }
    }
    const current = await getRunRow(run.id);
    if (!current) continue;
    if (current.pendingHermesRunId) {
      active = true;
      continue;
    }

    const leads = await countRunLeads(run.id);
    if (current.lastError && leads === 0) {
      if (await advanceRunAutoState(run.id, "running", "retried")) {
        try {
          await startDaily(origin, client, run.id);
          started.push(`retry:${client.slug}`);
          active = true;
          continue;
        } catch (error) {
          await advanceRunAutoState(run.id, "retried", "done");
          notifications.push(
            `⚠️ ${client.name} 자동 수집을 다시 시도하지 못했어요. ${errorText(error)}\n${monitorUrl}`
          );
          continue;
        }
      }
      if (await advanceRunAutoState(run.id, "retried", "done")) {
        notifications.push(
          `⚠️ ${client.name} 자동 수집이 두 번 모두 실패했어요. ${current.lastError}\n${monitorUrl}`
        );
      }
      continue;
    }

    const state = current.autoState ?? "";
    if (state && (await advanceRunAutoState(run.id, state, "done"))) {
      notifications.push(
        `📰 ${client.name} 기사 ${leads}건을 모았어요. 확인하고 보고해 주세요.\n${monitorUrl}`
      );
    }
  }

  /* 오늘 수집 시작 */
  for (const { client, collected } of await listAutoCollectClients(collectKey)) {
    const slot = collectSlotOn(client, now);
    upcoming.push(nextCollectAt(client, collected, now).valueOf());
    if (collected || !isCollectDay(client, now) || now.isBefore(slot)) continue;

    const { since, until } = collectWindow(client, now);
    const runId = await claimDailyRun({
      clientId: client.id,
      collectKey,
      since: since.toDate(),
      until: until.toDate(),
    });
    if (!runId) continue;

    try {
      await startDaily(origin, client, runId);
      started.push(client.slug);
      active = true;
    } catch (error) {
      await releaseDailyRun(runId);
      failed.push({ client: client.slug, error: errorText(error) });
    }
  }

  /* 이슈 — 끝난 자동 집계를 마무리하고, 시각이 되면 시작 */
  for (const auto of await listAutoIssues()) {
    const { issue } = auto;
    const slot = issueCollectSlot(issue, now);
    upcoming.push(slot.next.valueOf());

    if (issue.autoState === "running" || issue.autoState === "retried") {
      if (issue.pendingHermesRunId) {
        if (
          issue.pendingSince &&
          now.valueOf() - issue.pendingSince.valueOf() > STALE_MS
        ) {
          await setIssuePending(issue.id, null, STALE_ERROR);
        } else {
          await reconcileIssuePending(issue.id);
        }
      }
      const current = await getIssueRow(issue.id);
      if (current?.pendingHermesRunId) {
        active = true;
        continue;
      }
      if (current?.lastError) {
        if (await advanceIssueAutoState(issue.id, "running", "retried")) {
          try {
            await startIssue(origin, auto);
            started.push(`retry:issue:${issue.id}`);
            active = true;
            continue;
          } catch (error) {
            await advanceIssueAutoState(issue.id, "retried", "done");
            notifications.push(
              `⚠️ ${issue.title} 자동 집계를 다시 시도하지 못했어요. ${errorText(error)}\n${monitorUrl}`
            );
            continue;
          }
        }
        if (await advanceIssueAutoState(issue.id, "retried", "done")) {
          notifications.push(
            `⚠️ ${issue.title} 자동 집계가 두 번 모두 실패했어요. ${current.lastError}\n${monitorUrl}`
          );
        }
      } else if (await advanceIssueAutoState(issue.id, issue.autoState, "done")) {
        const latest = await getLatestSnapshot(issue.id);
        notifications.push(
          `🚨 ${issue.title} 집계 완료: +${latest?.added ?? 0}건, 브랜드 언급 ${latest?.brandMentions ?? 0}건\n${monitorUrl}`
        );
      }
    }

    if (issue.lastAutoSlot === slot.key) continue;
    if (!(await claimIssueSlot(issue.id, slot.key))) continue;

    // 사람이 누른 집계가 돌고 있으면 이번 시각은 그 결과로 대신한다.
    await reconcileIssuePending(issue.id);
    if ((await getIssueRow(issue.id))?.pendingHermesRunId) {
      await advanceIssueAutoState(issue.id, "running", null);
      continue;
    }

    try {
      await startIssue(origin, auto);
      started.push(`issue:${issue.id}`);
      active = true;
    } catch (error) {
      await releaseIssueSlot(issue.id, issue.lastAutoSlot);
      failed.push({ client: `이슈 ${issue.title}`, error: errorText(error) });
    }
  }

  const checks = [...upcoming, now.valueOf() + MAX_CHECK_MS];
  if (active) checks.push(now.valueOf() + ACTIVE_CHECK_MS);
  if (failed.length) checks.push(now.valueOf() + RETRY_MS);
  return {
    started,
    failed,
    notifications,
    nextCheckAt: new Date(Math.min(...checks)).toISOString(),
  };
};
