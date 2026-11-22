/** 데이트 지도(/map) 응답 모양. 브라우저와 서버가 함께 쓴다. */

/** 데이트 지도에서 고르는 기간 */
export const MAP_RANGES = ["all", "year", "month"] as const;
export type LedgerMapRange = (typeof MAP_RANGES)[number];

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
  from: string | null;
  to: string;
  /** 방문 많은 순, 같으면 최근 방문 순 */
  places: LedgerMapPlace[];
  /** 네이버 지도 링크는 있는데 좌표를 아직 못 읽은 지출 수 (기간 무관) */
  unresolved: number;
};
