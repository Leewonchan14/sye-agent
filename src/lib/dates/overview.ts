import { reconcileDigestPending } from "@/lib/dates/hermes";
import { nextDateCollectAt } from "@/lib/dates/tick";
import type { DateOverview } from "@/lib/dates/types";
import {
  attachPlaceReviews,
  getDateSettings,
  getDigestByDay,
  getDigestView,
  listDigestDays,
  listSpotsByReaction,
  refreshSpotPhotos,
} from "@/lib/db/dates";
import { getRatedPlaces } from "@/lib/db/places";
import { kst } from "@/lib/kst";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 고른 날(없으면 오늘, 오늘 조사가 없으면 가장 최근 날)의 추천과 찜·다녀온 곳 목록 */
export const getDateOverview = async (day: string | null): Promise<DateOverview> => {
  const todayKey = kst().format("YYYY-MM-DD");
  const [settings, days, today] = await Promise.all([
    getDateSettings(),
    listDigestDays(),
    getDigestByDay(todayKey),
  ]);

  const dayKey =
    day && DAY_RE.test(day) ? day : today ? todayKey : (days[0]?.dayKey ?? todayKey);
  let digest = dayKey === todayKey ? today : await getDigestByDay(dayKey);
  if (digest?.pendingHermesRunId) {
    await reconcileDigestPending(digest.id);
    digest = await getDigestByDay(dayKey);
  }
  // 보여 줄 카드의 사진 주소가 없거나 곧 만료되면 먼저 새로 읽는다.
  await refreshSpotPhotos({ digestId: digest?.id ?? null }).catch((error) =>
    console.error("[date-spots] photo", error)
  );
  const [liked, visited, rated, digestView] = await Promise.all([
    listSpotsByReaction("like"),
    listSpotsByReaction("visited"),
    getRatedPlaces(),
    digest ? getDigestView(digest) : null,
  ]);
  // 다녀와서 가계부 내역에 남긴 리뷰를 카드에 붙인다.
  for (const spots of [liked, visited, digestView?.spots ?? []]) {
    attachPlaceReviews(spots, rated);
  }

  return {
    settings,
    digest: digestView,
    dayKey,
    days,
    liked,
    visited,
    nextCollectAt:
      nextDateCollectAt(settings, Boolean(today?.autoState))?.toISOString() ?? null,
  };
};
