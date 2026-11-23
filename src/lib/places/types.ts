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
