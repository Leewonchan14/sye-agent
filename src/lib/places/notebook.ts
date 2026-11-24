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
import type { LedgerMapPlace } from "@/lib/ledger/map-types";
import {
  type AreaView,
  inferPlaceKind,
  normalizeAreaName,
  type PlaceCard,
  type PlacesPayload,
} from "@/lib/places/types";

/** 지역 수첩에 모아 보는 하치와레 추천의 최대 수 (반응별) */
const SPOT_LIMIT = 300;
/** "하치와레 새 추천"으로 보여 줄 아직 표시하지 않은 추천의 기간과 최대 수 */
const FRESH_DAYS = 30;
const FRESH_LIMIT = 20;

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** 두 좌표 사이의 거리(m, 하버사인) */
export const distanceM = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) => {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h)));
};

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

const ledgerCard = (place: LedgerMapPlace, area: AreaView): PlaceCard => ({
  key: place.key,
  source: "ledger",
  name: place.name,
  kind: inferPlaceKind(place.category),
  category: place.category,
  address: place.address,
  lat: place.lat,
  lng: place.lng,
  distanceM: distanceM(area, place),
  imageUrl: place.imageUrl,
  mapUrl: place.mapUrl,
  instagramUrl: null,
  reason: "",
  visits: place.visits,
  total: place.total,
  lastDate: place.lastDate,
  priceHint: null,
  sourceUrl: null,
  spotId: null,
  reaction: null,
  rating: place.rating,
  // 전체 기간으로 읽었으므로 간 날 리뷰를 모으면 이 장소 리뷰 전체다.
  reviews: place.entries
    .flatMap((visit) => visit.reviews)
    .sort(
      (a, b) =>
        b.entryDate.localeCompare(a.entryDate) || b.createdAt.localeCompare(a.createdAt)
    ),
  visitEntries: place.entries.map((visit) => ({
    date: visit.date,
    entryId: visit.payments[0].id,
  })),
});

const spotCard = (spot: DateSpotView, area: AreaView): PlaceCard => ({
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
    spot.lat !== null && spot.lng !== null
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
 */
const loadAreaSpots = async (
  area: AreaView,
  ledger: { keys: Set<string>; names: Set<string> }
) => {
  const [liked, visited, fresh] = await Promise.all([
    listSpotsByReaction("like", SPOT_LIMIT),
    listSpotsByReaction("visited", SPOT_LIMIT),
    listRecentUnreactedSpots(FRESH_DAYS),
  ]);
  const inLedger = (spot: DateSpotView) =>
    (spot.naverPlaceId !== null && ledger.keys.has(spot.naverPlaceId)) ||
    ledger.names.has(compact(spot.name));
  return {
    want: liked.filter((spot) => spotInArea(spot, area)),
    done: visited.filter((spot) => spotInArea(spot, area) && !inLedger(spot)),
    fresh: fresh.filter((spot) => spotInArea(spot, area)).slice(0, FRESH_LIMIT),
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
 * 지역 수첩: 고른 지역의 가 보고 싶은 곳(찜한 추천), 다녀온 곳(가계부 지도 + 다녀왔어), 숙소,
 * 그리고 아직 표시하지 않은 하치와레 새 추천.
 * 지역을 안 고르면 가장 최근에 연 지역을 연다. 저장한 지역이 없으면 목록은 비어 있다.
 */
export const getPlacesPayload = async (areaId: number | null): Promise<PlacesPayload> => {
  const areas = await listAreas();
  if (!areas.length) {
    return {
      areas,
      area: null,
      want: [],
      visited: [],
      stays: [],
      fresh: [],
      searching: false,
    };
  }
  const picked = areaId === null ? areas[0] : areas.find((item) => item.id === areaId);
  if (!picked) throw new PlaceError("지역을 찾을 수 없어요.", 404);
  const area = (await touchArea(picked.id)) ?? picked;

  const [ledgerMap, rated, searching] = await Promise.all([
    getLedgerMapPlaces({ range: "all" }),
    getRatedPlaces(),
    isSearching(),
  ]);
  const nearby = ledgerMap.places
    .map((place) => ledgerCard(place, area))
    .filter((card) => card.distanceM !== null && card.distanceM <= area.radiusM)
    .sort(
      (a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? "") || b.visits - a.visits
    );

  const ledger = {
    keys: new Set(nearby.map((card) => card.key)),
    names: new Set(nearby.map((card) => compact(card.name))),
  };
  let spots = await loadAreaSpots(area, ledger);
  // 보여 줄 추천 사진이 없거나 곧 만료되면 새로 읽고, 읽었으면 다시 불러온다.
  const spotIds = [...spots.want, ...spots.done, ...spots.fresh].map((spot) => spot.id);
  if (spotIds.length) {
    const refreshed = await refreshSpotPhotos({ spotIds }).catch((error) => {
      console.error("[places] photo", error);
      return 0;
    });
    if (refreshed) spots = await loadAreaSpots(area, ledger);
  }
  // 다녀와서 가계부 내역에 남긴 리뷰를 추천 카드에도 붙인다.
  for (const list of [spots.want, spots.done, spots.fresh])
    attachPlaceReviews(list, rated);
  const toCard = (spot: DateSpotView) => spotCard(spot, area);

  const cards = [...nearby, ...spots.done.map(toCard)];
  return {
    // 연 지역이 칩 맨 앞으로 온다.
    areas: [area, ...areas.filter((item) => item.id !== area.id)],
    area,
    want: spots.want.map(toCard),
    visited: cards.filter((card) => card.kind !== "stay"),
    stays: cards.filter((card) => card.kind === "stay"),
    fresh: spots.fresh.map(toCard),
    searching,
  };
};
