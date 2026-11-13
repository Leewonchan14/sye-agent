import type { Dayjs } from "dayjs";

import { reconcileDigestPending, startDateSpotSearch } from "@/lib/dates/hermes";
import type { DateSettings } from "@/lib/dates/types";
import {
  advanceDigestAutoState,
  countDigestSpots,
  DateSpotError,
  ensureDigest,
  getDateSettings,
  getDigestByDay,
  getDigestRow,
  listActiveAutoDigests,
  releaseDigestPending,
} from "@/lib/db/dates";
import { kst } from "@/lib/kst";

/** 자동 조사가 돌고 있으면 끝을 빨리 알아채도록 자주 확인한다. */
const ACTIVE_CHECK_MS = 90 * 1000;
/** 하치와레에게 넘기지 못했을 때 다시 확인하는 간격 */
const RETRY_MS = 5 * 60 * 1000;
/** 콜백 토큰 유효 시간과 같다. 이보다 오래 끝나지 않으면 실패로 본다. */
const STALE_MS = 3 * 60 * 60 * 1000;

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const collectSlot = (settings: DateSettings, day: Dayjs) => {
  const [hour, minute] = settings.collectTime.split(":").map(Number);
  return day.startOf("day").hour(hour).minute(minute);
};

/** 다음 자동 조사 시각. 꺼져 있으면 null. 오늘 이미 했으면 내일 시각. */
export const nextDateCollectAt = (
  settings: DateSettings,
  doneToday: boolean,
  now = kst()
): Dayjs | null => {
  if (!settings.enabled) return null;
  const today = collectSlot(settings, now);
  return doneToday || now.isAfter(today)
    ? collectSlot(settings, now.add(1, "day"))
    : today;
};

/**
 * Oracle 시계(`/api/monitor/agent/tick`)가 1분마다 부르는 데이트 추천 처리.
 * 정한 시각이 되면 하치와레에게 오늘 조사를 맡기고, 끝나면 Discord 알림 문구를 돌려준다.
 * 결과 없이 끝나면 한 번 다시 시도한다.
 */
export const runDateSpotTick = async (
  origin: string,
  now = kst(),
  siteOrigin = origin
) => {
  const pageUrl = `${siteOrigin}/dates`;
  const started: string[] = [];
  const failed: { client: string; error: string }[] = [];
  const notifications: string[] = [];
  const checks: number[] = [];

  /* 돌고 있던 자동 조사 마무리 */
  for (const digest of await listActiveAutoDigests()) {
    if (digest.pendingHermesRunId) {
      if (
        digest.pendingSince &&
        now.valueOf() - digest.pendingSince.valueOf() > STALE_MS
      ) {
        await releaseDigestPending(
          digest.id,
          "하치와레가 3시간 안에 결과를 보내지 않았어요."
        );
      } else {
        await reconcileDigestPending(digest.id);
      }
    }
    const current = await getDigestRow(digest.id);
    if (!current) continue;
    if (current.pendingHermesRunId) {
      checks.push(now.valueOf() + ACTIVE_CHECK_MS);
      continue;
    }

    const spots = await countDigestSpots(current.id);
    if (current.lastError && spots === 0) {
      if (await advanceDigestAutoState(current.id, "running", "retried")) {
        try {
          await startDateSpotSearch({ origin, digestId: current.id, extra: false });
          started.push("retry:dates");
          checks.push(now.valueOf() + ACTIVE_CHECK_MS);
          continue;
        } catch (error) {
          await advanceDigestAutoState(current.id, "retried", "done");
          notifications.push(
            `⚠️ 데이트 추천 조사를 다시 시도하지 못했어요. ${errorText(error)}\n${pageUrl}`
          );
          continue;
        }
      }
      if (await advanceDigestAutoState(current.id, "retried", "done")) {
        notifications.push(
          `⚠️ 데이트 추천 조사가 두 번 모두 실패했어요. ${current.lastError}\n${pageUrl}`
        );
      }
      continue;
    }

    const state = current.autoState ?? "";
    if (state && (await advanceDigestAutoState(current.id, state, "done"))) {
      notifications.push(
        spots > 0
          ? `💕 하치와레가 오늘의 데이트 추천 ${spots}개를 골라 왔어요.\n${pageUrl}`
          : `🙈 오늘은 조건에 맞는 데이트 추천을 못 찾았어요. 지역이나 테마를 넓혀 볼까요?\n${pageUrl}`
      );
    }
  }

  /* 오늘 조사 시작 */
  const settings = await getDateSettings();
  const dayKey = now.format("YYYY-MM-DD");
  const today = await getDigestByDay(dayKey);
  const next = nextDateCollectAt(settings, Boolean(today?.autoState), now);
  if (next) checks.push(next.valueOf());

  if (
    settings.enabled &&
    !today?.autoState &&
    !now.isBefore(collectSlot(settings, now))
  ) {
    const digest = today ?? (await ensureDigest(dayKey));
    if (await advanceDigestAutoState(digest.id, null, "running")) {
      try {
        // 시각 전에 "지금 찾아 줘"로 받아 둔 곳이 있으면 겹치지 않게 더 찾는다.
        const extra = (await countDigestSpots(digest.id)) > 0;
        await startDateSpotSearch({ origin, digestId: digest.id, extra });
        started.push("dates");
        checks.push(now.valueOf() + ACTIVE_CHECK_MS);
      } catch (error) {
        if (error instanceof DateSpotError && error.status === 409) {
          // 사람이 누른 조사가 돌고 있으면 오늘 자동 조사는 그 결과로 대신한다.
          checks.push(now.valueOf() + ACTIVE_CHECK_MS);
        } else {
          // 다음 확인 때 다시 시도하도록 차지를 되돌린다.
          await advanceDigestAutoState(digest.id, "running", null);
          failed.push({ client: "데이트 추천", error: errorText(error) });
          checks.push(now.valueOf() + RETRY_MS);
        }
      }
    }
  }

  return { started, failed, notifications, checks };
};
