import type { RatedPlace } from "@/lib/db/places";
import { DISLIKED_RATING } from "@/lib/places/types";

/** 이름 비교용: 띄어쓰기를 빼고 소문자로 */
export const compactName = (name: string) => name.replace(/\s+/g, "").toLowerCase();

/**
 * 하치와레 추천이 우리가 다녀와서 리뷰를 남긴 장소인지 찾는다.
 * 네이버 장소 id가 같으면 같은 곳이고, id가 없으면 이름이 같은 곳으로 본다.
 */
export const findRatedPlace = (
  spot: { naverPlaceId: string | null; name: string },
  rated: RatedPlace[]
): RatedPlace | null => {
  if (spot.naverPlaceId) {
    const byId = rated.find((place) => place.key === spot.naverPlaceId);
    if (byId) return byId;
  }
  const name = compactName(spot.name);
  return rated.find((place) => place.name && compactName(place.name) === name) ?? null;
};

/** 리뷰 별점 평균이 낮아 다시 추천하지 않을 곳 */
export const isDislikedPlace = (place: RatedPlace | null) =>
  place !== null && place.rating.average <= DISLIKED_RATING;
