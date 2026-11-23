/** 데이트 지도(/map) 응답 모양. 브라우저와 서버가 함께 쓴다. */

import type { LedgerMonthPayload } from "@/lib/db/ledger";

/** 가계부 분류 칩(ExpenseCategoryChips)에 그대로 넘기는 분류. entryCount는 이 기간 지도에 찍힌 지출 수 */
export type LedgerMapCategory = LedgerMonthPayload["categories"][number];

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
  /** 가계부 분류 id. 없으면 모든 분류 */
  category?: number | null;
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
  if (query.category != null) params.set("category", String(query.category));
  return params.toString();
};

export const toMapRange = (value: unknown): LedgerMapRange =>
  MAP_RANGES.includes(value as LedgerMapRange) ? (value as LedgerMapRange) : "all";

/** 한 장소에서 한 결제 */
export type LedgerMapPayment = {
  id: number;
  time: string | null;
  amount: number;
  memo: string;
  categoryName: string | null;
};

/** 한 장소에 간 하루. 같은 날 여러 번 결제해도 한 번 간 것으로 센다. */
export type LedgerMapVisit = {
  date: string;
  /** 그날 이 장소에서 쓴 돈 */
  amount: number;
  /** 그날 먼저 한 결제부터 */
  payments: LedgerMapPayment[];
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
  /** 간 날 수. 결제 건수가 아니다. */
  visits: number;
  total: number;
  firstDate: string;
  lastDate: string;
  /** 간 날별 기록. 최신순 */
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
  /** 고른 분류 id. 없으면 null */
  category: number | null;
  /** 이 기간 지도에 찍힌 지출이 있는 지출 분류 (가계부 분류 순서). 고른 분류는 지출이 없어도 넣는다. */
  categories: LedgerMapCategory[];
  /** 방문 많은 순, 같으면 최근 방문 순 */
  places: LedgerMapPlace[];
  /** 네이버 지도 링크는 있는데 좌표를 아직 못 읽은 지출 수 (기간 무관) */
  unresolved: number;
};
