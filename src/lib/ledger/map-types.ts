/** 데이트 지도(/map) 응답 모양. 브라우저와 서버가 함께 쓴다. */

/**
 * 데이트 지도에서 고르는 기간.
 * - custom: 직접 고른 날짜(from~to)
 * - trip: 가계부 여행 하나(trip id)에 묶인 지출
 */
export const MAP_RANGES = ["all", "year", "month", "custom", "trip"] as const;
export type LedgerMapRange = (typeof MAP_RANGES)[number];

/** 바로 누르는 기간 칩 */
export const MAP_PRESET_RANGES = ["all", "year", "month"] as const;

export type LedgerMapQuery = {
  range: LedgerMapRange;
  /** custom일 때 YYYY-MM-DD */
  from?: string | null;
  to?: string | null;
  /** trip일 때 여행 id */
  trip?: number | null;
};

export type LedgerMapTrip = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
};

/** API 주소의 쿼리. 기간에 쓰지 않는 값은 넣지 않는다. */
export const toMapSearchParams = (query: LedgerMapQuery): string => {
  const params = new URLSearchParams({ range: query.range });
  if (query.range === "custom") {
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
  }
  if (query.range === "trip" && query.trip != null)
    params.set("trip", String(query.trip));
  return params.toString();
};

export const toMapRange = (value: unknown): LedgerMapRange =>
  MAP_RANGES.includes(value as LedgerMapRange) ? (value as LedgerMapRange) : "all";

export type LedgerMapVisit = {
  id: number;
  date: string;
  time: string | null;
  amount: number;
  memo: string;
  categoryName: string | null;
};

export type LedgerMapPlace = {
  /** 네이버 장소 id. 없으면 지도 링크 */
  key: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  category: string;
  mapUrl: string;
  /** 대표 사진. 없으면 null */
  imageUrl: string | null;
  imageUrls: string[];
  visits: number;
  total: number;
  firstDate: string;
  lastDate: string;
  /** 최신순 */
  entries: LedgerMapVisit[];
};

export type LedgerMapPayload = {
  range: LedgerMapRange;
  /** 실제로 적용한 기간. 전체면 from이 null */
  from: string | null;
  to: string;
  /** range가 trip일 때 고른 여행 */
  trip: LedgerMapTrip | null;
  /** 여행 고르기에 쓰는 전체 여행 목록 (최근 시작 순) */
  trips: LedgerMapTrip[];
  /** 방문 많은 순, 같으면 최근 방문 순 */
  places: LedgerMapPlace[];
  /** 네이버 지도 링크는 있는데 좌표를 아직 못 읽은 지출 수 (기간 무관) */
  unresolved: number;
};
