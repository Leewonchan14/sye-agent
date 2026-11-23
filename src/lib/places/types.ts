import { z } from "zod";

/** eat(맛집·카페·술집) | stay(숙소) | play(전시·체험 등) */
export const PLACE_KINDS = ["eat", "stay", "play"] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export const MIN_RATING = 1;
export const MAX_RATING = 5;
export const MAX_REVIEW_LENGTH = 100;

/** 이 별점 이상이면 "좋았던 곳", 이하이면 "다시 추천하지 않을 곳"이다. */
export const LIKED_RATING = 4;
export const DISLIKED_RATING = 2;

const STAY_RE =
  /호텔|모텔|펜션|게스트하우스|리조트|숙박|민박|글램핑|캠핑장|한옥스테이|스테이|호스텔|레지던스/;
const PLAY_RE =
  /전시|미술관|박물관|갤러리|공방|체험|테마파크|놀이|공연|극장|영화관|방탈출|보드게임|스포츠|볼링|노래방|공원|산책|전망|관광/;

/** 네이버 업종 이름으로 장소 종류를 짐작한다. 모르면 맛집으로 본다. */
export const inferPlaceKind = (category: string): PlaceKind => {
  if (STAY_RE.test(category)) return "stay";
  if (PLAY_RE.test(category)) return "play";
  return "eat";
};

/** 별점·리뷰 저장. 별점을 null로 보내고 리뷰도 비우면 지운다. */
export const placeNoteInputSchema = z.object({
  key: z.string().trim().min(1).max(500),
  rating: z.number().int().min(MIN_RATING).max(MAX_RATING).nullable(),
  review: z
    .string()
    .trim()
    .max(MAX_REVIEW_LENGTH, `리뷰는 ${MAX_REVIEW_LENGTH}자까지 쓸 수 있어요.`)
    .default(""),
});
export type PlaceNoteInput = z.input<typeof placeNoteInputSchema>;

/** 우리가 남긴 별점·한 줄 리뷰 */
export interface PlaceNote {
  rating: number | null;
  review: string;
  /** 마지막으로 매긴 시각 (ISO) */
  ratedAt: string | null;
}

/* ───────── 지역 ───────── */

/** 지역 반경으로 고를 수 있는 값(미터) */
export const AREA_RADII = [500, 1000, 1500, 2000, 3000] as const;
export const DEFAULT_AREA_RADIUS = 1500;

const radiusField = z
  .number()
  .int()
  .refine(
    (v) => (AREA_RADII as readonly number[]).includes(v),
    "반경 값이 올바르지 않아요."
  );

export const createAreaSchema = z.object({
  name: z.string().trim().min(1, "지역 이름을 써 주세요.").max(20),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().trim().max(160).default(""),
  radiusM: radiusField.default(DEFAULT_AREA_RADIUS),
});
export type CreateAreaInput = z.input<typeof createAreaSchema>;

export const updateAreaSchema = z.object({ radiusM: radiusField });

export interface AreaView {
  id: number;
  name: string;
  lat: number;
  lng: number;
  address: string;
  radiusM: number;
}

/** 지역 이름으로 네이버에서 찾은 중심 후보 */
export interface AreaCandidate {
  name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
}

/* ───────── 지역 수첩 화면 ───────── */

/**
 * 지역 수첩 카드 한 장.
 * - ledger: 가계부 지도에 찍힌 다녀온 곳 (별점을 매길 수 있다)
 * - spot: 하치와레 데이트 추천에서 가 보고 싶어·다녀왔어로 표시한 곳
 */
export interface PlaceCard {
  /** ledger면 장소 key(별점 저장에 쓴다), spot이면 `spot:<id>` */
  key: string;
  source: "ledger" | "spot";
  name: string;
  kind: PlaceKind;
  category: string;
  address: string;
  lat: number | null;
  lng: number | null;
  /** 지역 중심에서 떨어진 거리(m). 좌표가 없으면 null */
  distanceM: number | null;
  imageUrl: string | null;
  /** 네이버 지도 장소 페이지 */
  mapUrl: string | null;
  instagramUrl: string | null;
  /** 하치와레가 고른 이유 (spot) */
  reason: string;
  /** 간 날 수와 쓴 돈 (ledger) */
  visits: number;
  total: number;
  lastDate: string | null;
  note: PlaceNote | null;
}

export interface PlacesPayload {
  /** 저장한 지역 (최근에 연 순) */
  areas: AreaView[];
  /** 고른 지역. 없으면 지역 없이 전체 개수만 */
  area: AreaView | null;
  want: PlaceCard[];
  visited: PlaceCard[];
  stays: PlaceCard[];
}

/** 지역 이름 비교용: 띄어쓰기와 끝의 "역"을 뗀다. "신도림역" → "신도림" */
export const normalizeAreaName = (name: string) =>
  name.replace(/\s+/g, "").replace(/역$/, "");
