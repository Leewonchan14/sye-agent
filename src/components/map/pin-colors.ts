/**
 * 지도 핀 색. 핀은 캔버스에 그려 CSS 변수를 못 쓰므로 값을 그대로 둔다.
 * 레이어마다 색 계열을 달리해 한눈에 구분한다: 다녀온 곳은 장미, 가 보고 싶은 곳은 라벤더, 숙소는 호박.
 */
/** 다녀온 곳 — 장미색(--color-primary) */
export const VISITED_PIN = "#d96c75";
/** 가 보고 싶은 곳 — 라벤더 */
export const WANT_PIN = "#8b7fd4";
/** 숙소 — 따뜻한 호박색 */
export const STAY_PIN = "#c9893f";
/** 하치와레 새 추천 — 연한 라벤더 (가 보고 싶은 곳 레이어 안에서 아직 표시 안 한 것) */
export const FRESH_PIN = "#b8b0e3";
/** 여러 핀이 모인 묶음 — 종류가 섞여 있어 특정 레이어 색을 쓰지 않는다. */
export const CLUSTER_PIN = "#8f8083";
/** 고른 핀의 테두리 */
export const SELECTED_STROKE = "#3a2a2c";

/** 하치와레 추천의 핀 색: 숙소 · 가 보고 싶어 · 다녀왔어 · 아직 표시 안 한 새 추천 */
export const spotPinColor = (card: { kind: string; reaction: string | null }) => {
  if (card.kind === "stay") return STAY_PIN;
  if (card.reaction === "like") return WANT_PIN;
  if (card.reaction === "visited") return VISITED_PIN;
  return FRESH_PIN;
};
