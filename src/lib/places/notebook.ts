import type { DateSpotView } from "@/lib/dates/types";
import { listSpotsByReaction, refreshSpotPhotos } from "@/lib/db/dates";
import { getLedgerMapPlaces } from "@/lib/db/ledger-map";
import { listAreas, PlaceError, touchArea } from "@/lib/db/places";
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
 * 좌표가 없는 하치와레 추천은 동네 이름·주소 글자로 지역에 묶는다.
 * "신도림역" 지역이면 동네가 "신도림"이거나 주소에 "신도림"이 들어간 추천이다.
 */
export const spotInArea = (
  spot: Pick<DateSpotView, "area" | "address">,
  area: AreaView
) => {
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

const spotCard = (spot: DateSpotView): PlaceCard => ({
  key: `spot:${spot.id}`,
  source: "spot",
  name: spot.name,
  kind: inferPlaceKind(spot.category),
  category: spot.category,
  address: spot.address ?? "",
  lat: null,
  lng: null,
  distanceM: null,
  imageUrl: spot.photos[0] ?? null,
  mapUrl: null,
  instagramUrl: spot.instagramUrl,
  reason: spot.reason,
  visits: 0,
  total: 0,
  lastDate: null,
  rating: null,
  reviews: [],
  visitEntries: [],
});

/** 이 지역의 찜한 추천과 다녀온 추천. 가계부 지도에도 있는 곳(이름이 같은 곳)은 뺀다. */
const loadAreaSpots = async (area: AreaView, ledgerNames: Set<string>) => {
  const [liked, visited] = await Promise.all([
    listSpotsByReaction("like", SPOT_LIMIT),
    listSpotsByReaction("visited", SPOT_LIMIT),
  ]);
  return {
    want: liked.filter((spot) => spotInArea(spot, area)),
    done: visited.filter(
      (spot) => spotInArea(spot, area) && !ledgerNames.has(compact(spot.name))
    ),
  };
};

/**
 * 지역 수첩: 고른 지역의 가 보고 싶은 곳(찜한 추천), 다녀온 곳(가계부 지도 + 다녀왔어), 숙소.
 * 지역을 안 고르면 가장 최근에 연 지역을 연다. 저장한 지역이 없으면 목록은 비어 있다.
 */
export const getPlacesPayload = async (areaId: number | null): Promise<PlacesPayload> => {
  const areas = await listAreas();
  if (!areas.length) return { areas, area: null, want: [], visited: [], stays: [] };
  const picked = areaId === null ? areas[0] : areas.find((item) => item.id === areaId);
  if (!picked) throw new PlaceError("지역을 찾을 수 없어요.", 404);
  const area = (await touchArea(picked.id)) ?? picked;

  const ledger = await getLedgerMapPlaces({ range: "all" });
  const nearby = ledger.places
    .map((place) => ledgerCard(place, area))
    .filter((card) => card.distanceM !== null && card.distanceM <= area.radiusM)
    .sort(
      (a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? "") || b.visits - a.visits
    );

  // 가계부 지도에도 있는 다녀온 추천은 가계부 쪽 카드(별점을 매길 수 있는)로만 보여 준다.
  const ledgerNames = new Set(nearby.map((card) => compact(card.name)));
  let spots = await loadAreaSpots(area, ledgerNames);
  // 보여 줄 추천 사진이 없거나 곧 만료되면 새로 읽고, 읽었으면 다시 불러온다.
  const spotIds = [...spots.want, ...spots.done].map((spot) => spot.id);
  if (spotIds.length) {
    const refreshed = await refreshSpotPhotos({ spotIds }).catch((error) => {
      console.error("[places] photo", error);
      return 0;
    });
    if (refreshed) spots = await loadAreaSpots(area, ledgerNames);
  }

  const cards = [...nearby, ...spots.done.map(spotCard)];
  return {
    // 연 지역이 칩 맨 앞으로 온다.
    areas: [area, ...areas.filter((item) => item.id !== area.id)],
    area,
    want: spots.want.map(spotCard),
    visited: cards.filter((card) => card.kind !== "stay"),
    stays: cards.filter((card) => card.kind === "stay"),
  };
};
