/**
 * 데이트 지도 목록의 검색·정렬·리뷰 필터. 서버가 준 장소 목록을 브라우저에서 거른다.
 * 주소 쿼리(`?q=&sort=&rated=`)에 그대로 남기는 값이라 브라우저와 서버가 함께 쓸 수 있게 순수 함수로 둔다.
 */
import type { LedgerMapPlace } from "@/lib/ledger/map-types";
import { DISLIKED_RATING, LIKED_RATING, type PlaceReview } from "@/lib/places/types";

/** 목록 정렬: 방문 많은 순(기본) · 별점 높은 순 · 최근에 간 순 */
export const MAP_SORTS = ["visits", "rating", "recent"] as const;
export type MapSort = (typeof MAP_SORTS)[number];
export const MAP_SORT_LABEL: Record<MapSort, string> = {
  visits: "방문순",
  rating: "별점순",
  recent: "최근순",
};

/**
 * 리뷰 필터
 * - reviewed: 리뷰가 하나라도 있는 곳
 * - liked: 별점 평균이 LIKED_RATING 이상 (또 갈 곳)
 * - disliked: 별점 평균이 DISLIKED_RATING 이하 (다시 안 갈 곳)
 */
export const MAP_RATED_FILTERS = ["all", "reviewed", "liked", "disliked"] as const;
export type MapRatedFilter = (typeof MAP_RATED_FILTERS)[number];
export const MAP_RATED_LABEL: Record<MapRatedFilter, string> = {
  all: "전체",
  reviewed: "리뷰 있는 곳",
  liked: `또 갈 곳 ★${LIKED_RATING}↑`,
  disliked: `다시 안 갈 곳 ★${DISLIKED_RATING}↓`,
};

/** 검색 비교용: 대소문자와 띄어쓰기를 무시한다. "성수 카페" → "성수카페" */
const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, "");

/** 이 기간에 간 날의 리뷰, 최근에 남긴 것부터 (간 날 최신순 → 그날 나중에 쓴 것부터) */
export const placeReviews = (place: LedgerMapPlace): PlaceReview[] =>
  place.entries.flatMap((visit) => [...visit.reviews].reverse());

/**
 * 목록 줄에 한 줄로 보여 줄 리뷰. 글이 있는 리뷰 중 가장 최근 것.
 * 검색어가 리뷰 글에 있으면 그 리뷰를 먼저 보여 줘 왜 걸렸는지 알 수 있게 한다.
 */
export const pickReviewSnippet = (
  place: LedgerMapPlace,
  query = ""
): PlaceReview | null => {
  const written = placeReviews(place).filter((review) => review.review.trim());
  const needle = normalize(query);
  if (needle) {
    const hit = written.find((review) => normalize(review.review).includes(needle));
    if (hit) return hit;
  }
  return written[0] ?? null;
};

/** 가게 이름·업종·주소·결제 메모·리뷰 글 중 하나에 검색어가 들어 있는지 */
export const matchesPlaceQuery = (place: LedgerMapPlace, query: string) => {
  const needle = normalize(query);
  if (!needle) return true;
  const haystack = [
    place.name,
    place.category,
    place.address,
    ...place.entries.flatMap((visit) => visit.payments.map((payment) => payment.memo)),
    ...placeReviews(place).map((review) => review.review),
  ];
  return haystack.some((value) => normalize(value).includes(needle));
};

const matchesRated = (place: LedgerMapPlace, rated: MapRatedFilter) => {
  if (rated === "all") return true;
  if (!place.rating) return false;
  if (rated === "liked") return place.rating.average >= LIKED_RATING;
  if (rated === "disliked") return place.rating.average <= DISLIKED_RATING;
  return true;
};

const byVisits = (a: LedgerMapPlace, b: LedgerMapPlace) =>
  b.visits - a.visits || b.lastDate.localeCompare(a.lastDate);

const byRecent = (a: LedgerMapPlace, b: LedgerMapPlace) =>
  b.lastDate.localeCompare(a.lastDate) || b.visits - a.visits;

/**
 * 별점 높은 순. 평균이 같으면 리뷰가 많은 곳을 위에 둬, 리뷰 하나짜리 5점이
 * 여러 번 검증된 곳보다 무조건 앞서지 않게 한다. 리뷰가 없는 곳은 맨 뒤(방문순).
 */
const byRating = (a: LedgerMapPlace, b: LedgerMapPlace) => {
  if (!a.rating || !b.rating) {
    if (a.rating) return -1;
    if (b.rating) return 1;
    return byVisits(a, b);
  }
  return (
    b.rating.average - a.rating.average ||
    b.rating.count - a.rating.count ||
    byVisits(a, b)
  );
};

const COMPARATORS: Record<MapSort, (a: LedgerMapPlace, b: LedgerMapPlace) => number> = {
  visits: byVisits,
  rating: byRating,
  recent: byRecent,
};

export type MapListQuery = {
  query: string;
  sort: MapSort;
  rated: MapRatedFilter;
};

/** 검색·리뷰 필터로 거르고 정렬한 새 목록. 원래 배열은 바꾸지 않는다. */
export const filterMapPlaces = (
  places: LedgerMapPlace[],
  { query, sort, rated }: MapListQuery
): LedgerMapPlace[] =>
  places
    .filter((place) => matchesRated(place, rated) && matchesPlaceQuery(place, query))
    .sort(COMPARATORS[sort]);
