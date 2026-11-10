import { reconcileDigestPending } from "@/lib/dates/hermes";
import { nextDateCollectAt } from "@/lib/dates/tick";
import type { DateOverview } from "@/lib/dates/types";
import {
  getDateSettings,
  getDigestByDay,
  getDigestView,
  listDigestDays,
  listSpotsByReaction,
} from "@/lib/db/dates";
import { kst } from "@/lib/kst";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 고른 날(없으면 오늘, 오늘 조사가 없으면 가장 최근 날)의 추천과 찜 목록 */
export const getDateOverview = async (day: string | null): Promise<DateOverview> => {
  const todayKey = kst().format("YYYY-MM-DD");
  const [settings, days, liked, today] = await Promise.all([
    getDateSettings(),
    listDigestDays(),
    listSpotsByReaction("like"),
    getDigestByDay(todayKey),
  ]);

  const dayKey =
    day && DAY_RE.test(day) ? day : today ? todayKey : (days[0]?.dayKey ?? todayKey);
  let digest = dayKey === todayKey ? today : await getDigestByDay(dayKey);
  if (digest?.pendingHermesRunId) {
    await reconcileDigestPending(digest.id);
    digest = await getDigestByDay(dayKey);
  }

  return {
    settings,
    digest: digest ? await getDigestView(digest) : null,
    dayKey,
    days,
    liked,
    nextCollectAt:
      nextDateCollectAt(settings, Boolean(today?.autoState))?.toISOString() ?? null,
  };
};
