import { reconcileDigestPending } from "@/lib/dates/hermes";
import type { DateSpotView } from "@/lib/dates/types";
import {
  attachPlaceReviews,
  getDigestByDay,
  hasPendingDigest,
  listRecentUnreactedSpots,
  listSpotsByReaction,
  refreshSpotPhotos,
} from "@/lib/db/dates";
import { getLedgerMapPlaces } from "@/lib/db/ledger-map";
import { getRatedPlaces, listAreas, PlaceError, touchArea } from "@/lib/db/places";
import { kst } from "@/lib/kst";
import { distanceM } from "@/lib/places/geo";
import {
  type AreaView,
  inferPlaceKind,
  type MapLayersPayload,
  normalizeAreaName,
  type PlaceCard,
} from "@/lib/places/types";

/** 데이트 지도에 모아 보는 하치와레 추천의 최대 수 (반응별) */
const SPOT_LIMIT = 300;
/** "하치와레 새 추천"으로 보여 줄 아직 표시하지 않은 추천의 기간과 최대 수 */
const FRESH_DAYS = 30;
const FRESH_LIMIT = 20;

const compact = (value: string) => value.replace(/\s+/g, "");

/**
 * 하치와레 추천을 지역에 묶는다. 좌표가 있으면 반경 안인지 보고,
 * 좌표가 없는 예전 추천은 동네 이름·주소 글자로 묶는다.
 * "신도림역" 지역이면 동네가 "신도림"이거나 주소에 "신도림"이 들어간 추천이다.
 */
export const spotInArea = (
  spot: Pick<DateSpotView, "area" | "address" | "lat" | "lng">,
  area: AreaView
) => {
  if (spot.lat !== null && spot.lng !== null) {
    return distanceM(area, { lat: spot.lat, lng: spot.lng }) <= area.radiusM;
  }
  const target = normalizeAreaName(area.name);
  if (!target) return false;
  const spotArea = normalizeAreaName(spot.area);
  return (
    (spotArea.length >= 2 && (spotArea.includes(target) || target.includes(spotArea))) ||
    compact(spot.address ?? "").includes(target)
  );
};

/** 하치와레 추천 카드. 지역을 안 고르면(데이트 지도 전체) 거리는 없다. */
const spotCard = (spot: DateSpotView, area: AreaView | null): PlaceCard => ({
  key: `spot:${spot.id}`,
  source: "spot",
  name: spot.name,
  // 하치와레가 숙소로 보낸 추천은 업종과 상관없이 숙소다.
  kind: spot.kind === "stay" ? "stay" : inferPlaceKind(spot.category),
  category: spot.category,
  address: spot.address ?? "",
  lat: spot.lat,
  lng: spot.lng,
  distanceM:
    area && spot.lat !== null && spot.lng !== null
      ? distanceM(area, { lat: spot.lat, lng: spot.lng })
      : null,
  imageUrl: spot.photos[0] ?? null,
  mapUrl: spot.naverPlaceId
    ? `https://map.naver.com/p/entry/place/${spot.naverPlaceId}`
    : null,
  instagramUrl: spot.instagramUrl,
  reason: spot.reason,
  visits: 0,
  total: 0,
  lastDate: null,
  rating: spot.placeRating,
  reviews: spot.placeReviews,
  visitEntries: [],
  priceHint: spot.priceHint,
  sourceUrl: spot.sourceUrl,
  spotId: spot.id,
  reaction: spot.reaction,
});

/**
 * 이 지역의 찜한 추천, 다녀온 추천, 아직 표시하지 않은 최근 추천.
 * 가계부 지도에도 있는 다녀온 추천(장소 id나 이름이 같은 곳)은 가계부 카드로만 보여 준다.
 * 지역이 없으면(데이트 지도 전체) 찜한·다녀온 추천 전부이고, 새 추천은 없다.
 */
const loadAreaSpots = async (
  area: AreaView | null,
  ledger: { keys: Set<string>; names: Set<string> }
) => {
  const [liked, visited, fresh] = await Promise.all([
    listSpotsByReaction("like", SPOT_LIMIT),
    listSpotsByReaction("visited", SPOT_LIMIT),
    area ? listRecentUnreactedSpots(FRESH_DAYS) : Promise.resolve([]),
  ]);
  const inArea = (spot: DateSpotView) => !area || spotInArea(spot, area);
  const inLedger = (spot: DateSpotView) =>
    (spot.naverPlaceId !== null && ledger.keys.has(spot.naverPlaceId)) ||
    ledger.names.has(compact(spot.name));
  return {
    want: liked.filter(inArea),
    done: visited.filter((spot) => inArea(spot) && !inLedger(spot)),
    fresh: fresh.filter(inArea).slice(0, FRESH_LIMIT),
  };
};

/** 오늘 조사를 하치와레가 하고 있는지. 끝났는데 표시만 남아 있으면 먼저 푼다. */
const isSearching = async () => {
  const today = await getDigestByDay(kst().format("YYYY-MM-DD"));
  if (today?.pendingHermesRunId) {
    await reconcileDigestPending(today.id).catch((error) =>
      console.error("[places] reconcile", error)
    );
  }
  return hasPendingDigest();
};

/**
 * 데이트 지도의 하치와레 추천 레이어와 동네.
 * - 동네를 안 고르면(전체) 가 보고 싶어·다녀왔어로 표시한 추천 전부. 새 추천은 동네를 골라야 보인다.
 * - 동네를 고르면 그 반경 안의 것만, 그리고 아직 표시하지 않은 최근 추천(새 추천).
 * 가계부 지도에 이미 있는 다녀온 추천은 빼고(지도의 다녀온 곳으로 보인다), 다녀와서 남긴 리뷰를 붙인다.
 * 다녀온 가계부 장소는 데이트 지도 API(기간·분류 필터)가 따로 주고, 브라우저가 동네 반경으로 거른다.
 */
export const getMapLayers = async (areaId: number | null): Promise<MapLayersPayload> => {
  const areas = await listAreas();
  let area: AreaView | null = null;
  if (areaId !== null) {
    const picked = areas.find((item) => item.id === areaId);
    if (!picked) throw new PlaceError("지역을 찾을 수 없어요.", 404);
    area = (await touchArea(picked.id)) ?? picked;
  }

  const [ledgerMap, rated, searching] = await Promise.all([
    getLedgerMapPlaces({ range: "all" }),
    getRatedPlaces(),
    isSearching(),
  ]);
  const ledger = {
    keys: new Set(ledgerMap.places.map((place) => place.key)),
    names: new Set(ledgerMap.places.map((place) => compact(place.name))),
  };
  let spots = await loadAreaSpots(area, ledger);
  // 보여 줄 추천 사진이 없거나 곧 만료되면 새로 읽고, 읽었으면 다시 불러온다.
  const spotIds = [...spots.want, ...spots.done, ...spots.fresh].map((spot) => spot.id);
  if (spotIds.length) {
    const refreshed = await refreshSpotPhotos({ spotIds }).catch((error) => {
      console.error("[map layers] photo", error);
      return 0;
    });
    if (refreshed) spots = await loadAreaSpots(area, ledger);
  }
  for (const list of [spots.want, spots.done, spots.fresh])
    attachPlaceReviews(list, rated);
  const toCard = (spot: DateSpotView) => spotCard(spot, area);
  return {
    areas: area ? [area, ...areas.filter((item) => item.id !== area.id)] : areas,
    area,
    want: spots.want.map(toCard),
    done: spots.done.map(toCard),
    fresh: spots.fresh.map(toCard),
    searching,
  };
};
