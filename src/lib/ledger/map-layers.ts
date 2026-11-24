/**
 * 데이트 지도의 레이어와 목록 구역. 가계부 장소(데이트 지도 API)와 하치와레 추천(지도 레이어 API)을
 * 고른 동네 반경으로 거르고, 다녀온 곳·가 보고 싶은 곳·숙소로 나눈다. 브라우저에서 쓰는 순수 함수다.
 */
import {
  filterMapPlaces,
  filterSpotCards,
  type MapListQuery,
} from "@/lib/ledger/map-filter";
import type { LedgerMapPlace } from "@/lib/ledger/map-types";
import { distanceM } from "@/lib/places/geo";
import {
  inferPlaceKind,
  type AreaView,
  type MapLayersPayload,
  type PlaceCard,
} from "@/lib/places/types";

/**
 * 지도에 겹쳐 보는 레이어.
 * - visited: 다녀온 곳 — 가계부 지도 링크로 모은 곳(기간·분류 필터를 따른다)과 다녀왔어로 표시한 추천
 * - want: 가 보고 싶은 곳 — 가 보고 싶어로 표시한 추천, 동네를 고르면 새 추천도
 * - stay: 숙소 — 묵었던 숙소와 하치와레가 찾아 온 숙소
 */
export const MAP_LAYERS = ["visited", "want", "stay"] as const;
export type MapLayer = (typeof MAP_LAYERS)[number];

/**
 * 목록 구역. 위에서부터 이 순서로 보인다.
 * - fresh: 하치와레 새 추천 (동네를 골랐을 때만, want 레이어)
 */
export type LayerSectionId = "fresh" | "visited" | "want" | "stay";

export interface LayerSection {
  id: LayerSectionId;
  layer: MapLayer;
  /** 가계부 장소 (다녀온 곳·묵었던 숙소) */
  ledger: LedgerMapPlace[];
  /** 하치와레 추천 카드 */
  spots: PlaceCard[];
}

const isStayCategory = (category: string) => inferPlaceKind(category) === "stay";
const notStay = (card: PlaceCard) => card.kind !== "stay";

/** 가계부 장소와 추천을 동네 반경으로 거르고 구역으로 나눈다. 추천의 동네 거르기는 서버가 한다. */
export const splitLayers = (
  ledgerPlaces: LedgerMapPlace[],
  spots: Pick<MapLayersPayload, "want" | "done" | "fresh"> | undefined,
  area: AreaView | null
): LayerSection[] => {
  const ledger = area
    ? ledgerPlaces.filter((place) => distanceM(area, place) <= area.radiusM)
    : ledgerPlaces;
  const fresh = spots?.fresh ?? [];
  const want = spots?.want ?? [];
  const done = spots?.done ?? [];
  return [
    { id: "fresh", layer: "want", ledger: [], spots: fresh.filter(notStay) },
    {
      id: "visited",
      layer: "visited",
      ledger: ledger.filter((place) => !isStayCategory(place.category)),
      spots: done.filter(notStay),
    },
    { id: "want", layer: "want", ledger: [], spots: want.filter(notStay) },
    {
      id: "stay",
      layer: "stay",
      ledger: ledger.filter((place) => isStayCategory(place.category)),
      spots: [...fresh, ...want, ...done].filter((card) => !notStay(card)),
    },
  ];
};

export const sectionSize = (section: LayerSection) =>
  section.ledger.length + section.spots.length;

/** 레이어 칩에 붙이는 개수 (검색·필터 전) */
export const layerCounts = (sections: LayerSection[]): Record<MapLayer, number> => {
  const counts: Record<MapLayer, number> = { visited: 0, want: 0, stay: 0 };
  for (const section of sections) counts[section.layer] += sectionSize(section);
  return counts;
};

/** 한 구역에 검색·정렬·리뷰 필터를 건다. */
export const filterSection = (
  section: LayerSection,
  query: MapListQuery
): LayerSection => ({
  ...section,
  ledger: filterMapPlaces(section.ledger, query),
  spots: filterSpotCards(section.spots, query),
});
