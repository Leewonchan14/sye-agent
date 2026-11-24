import { z } from "zod";

/** eat(맛집·카페·술집) | stay(숙소) | play(전시·체험 등) */
export const PLACE_KINDS = ["eat", "stay", "play"] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

/** 별점은 0.5 단위로 0.5~5 (반 개까지) */
export const RATING_STEP = 0.5;
export const MIN_RATING = RATING_STEP;
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

/**
 * 가계부 지출이 가리키는 장소 key — 네이버 장소 id, 없으면 지도 링크. 지도 링크가 없으면 빈 문자열.
 * 데이트 지도의 장소 key와 같아서, 같은 가게의 내역들에 남긴 리뷰가 한 장소로 모인다.
 */
export const toPlaceKey = (entry: { mapPlaceId: string; mapUrl: string }) =>
  entry.mapPlaceId || entry.mapUrl;

/* ───────── 리뷰 ───────── */

/** 리뷰를 쓴 사람 */
export const REVIEW_AUTHORS = ["wonchan", "yeeun"] as const;
export type ReviewAuthor = (typeof REVIEW_AUTHORS)[number];
export const REVIEW_AUTHOR_LABEL: Record<ReviewAuthor, string> = {
  wonchan: "원찬",
  yeeun: "예은",
};

const ratingField = z
  .number()
  .min(MIN_RATING, `별점은 ${MIN_RATING}~${MAX_RATING} 사이여야 해요.`)
  .max(MAX_RATING, `별점은 ${MIN_RATING}~${MAX_RATING} 사이여야 해요.`)
  .multipleOf(RATING_STEP, `별점은 ${RATING_STEP} 단위로 골라 주세요.`);
const reviewField = z
  .string()
  .trim()
  .max(MAX_REVIEW_LENGTH, `리뷰는 ${MAX_REVIEW_LENGTH}자까지 쓸 수 있어요.`);

/** 내역에 리뷰 남기기 */
export const createReviewSchema = z.object({
  entryId: z.number().int().positive(),
  author: z.enum(REVIEW_AUTHORS),
  rating: ratingField,
  review: reviewField.default(""),
});
export type CreateReviewInput = z.input<typeof createReviewSchema>;

/** 리뷰 고치기 — 보낸 값만 바꾼다. */
export const updateReviewSchema = z
  .object({
    author: z.enum(REVIEW_AUTHORS),
    rating: ratingField,
    review: reviewField,
  })
  .partial();
export type UpdateReviewInput = z.input<typeof updateReviewSchema>;

/** 내역 하나에 남긴 리뷰 */
export interface PlaceReview {
  id: number;
  entryId: number;
  /** 그 내역의 날짜 (YYYY-MM-DD) */
  entryDate: string;
  author: ReviewAuthor;
  rating: number;
  review: string;
  createdAt: string;
}

/** 한 장소의 리뷰 별점 평균 */
export interface PlaceRatingSummary {
  /** 소수 첫째 자리까지 */
  average: number;
  count: number;
}

/** 리뷰 별점 평균을 소수 첫째 자리로. 리뷰가 없으면 null */
export const summarizeRatings = (ratings: number[]): PlaceRatingSummary | null =>
  ratings.length
    ? {
        average:
          Math.round(
            (ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 10
          ) / 10,
        count: ratings.length,
      }
    : null;

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
 * 데이트 지도의 하치와레 추천 카드 한 장.
 * - ledger: 가계부 지도에 찍힌 다녀온 곳 (지금은 데이트 지도 API의 LedgerMapPlace로 따로 온다)
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
  /** 리뷰 별점 평균 (ledger). 리뷰가 없으면 null */
  rating: PlaceRatingSummary | null;
  /** 이 장소에 남긴 리뷰 (최신순) */
  reviews: PlaceReview[];
  /** 리뷰를 붙일 수 있는 간 날 — 그날 첫 결제 내역 (최신순) */
  visitEntries: { date: string; entryId: number }[];
  /** 하치와레 추천의 가격 감 (숙소면 날짜 기준 1박 가격) */
  priceHint: string | null;
  /** 하치와레 추천의 근거 페이지 (숙소면 NOL 숙소 페이지) */
  sourceUrl: string | null;
  /** 하치와레 추천(spot)의 id와 가 보고 싶어·별로·다녀왔어 표시 */
  spotId: number | null;
  reaction: "like" | "pass" | "visited" | null;
}

/**
 * 데이트 지도의 동네와 하치와레 추천 레이어 (`GET /api/places/layers?area=`).
 * 좌표가 없는 추천은 지도 핀 없이 목록에만 보인다.
 */
export interface MapLayersPayload {
  /** 저장한 동네 (고른 동네가 먼저, 그다음 최근에 연 순) */
  areas: AreaView[];
  /** 고른 동네. 없으면 전체 */
  area: AreaView | null;
  /** 가 보고 싶어로 표시한 추천 (최근에 받은 것부터) */
  want: PlaceCard[];
  /** 다녀왔어로 표시했지만 가계부 지도에는 없는 추천 */
  done: PlaceCard[];
  /** 동네를 골랐을 때 아직 표시하지 않은 최근 추천 */
  fresh: PlaceCard[];
  /** 하치와레가 지금 찾고 있는지 */
  searching: boolean;
}

/** 지역 이름 비교용: 띄어쓰기와 끝의 "역"을 뗀다. "신도림역" → "신도림" */
export const normalizeAreaName = (name: string) =>
  name.replace(/\s+/g, "").replace(/역$/, "");
