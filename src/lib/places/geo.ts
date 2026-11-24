/** 좌표 계산. 서버(지역 수첩 묶기)와 브라우저(데이트 지도 동네 거르기)가 함께 쓴다. */

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** 두 좌표 사이의 거리(m, 하버사인) */
export const distanceM = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) => {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h)));
};

/** 위도 1도의 길이(m) */
const METERS_PER_DEG = 111_320;

/** 가운데에서 반경 radiusM인 원을 지도에 그릴 다각형 꼭짓점([lng, lat], 처음과 끝이 같다) */
export const circlePolygon = (
  center: { lat: number; lng: number },
  radiusM: number,
  steps = 64
): [number, number][] => {
  const dLat = radiusM / METERS_PER_DEG;
  const dLng = radiusM / (METERS_PER_DEG * Math.cos(toRad(center.lat)));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const angle = (i / steps) * 2 * Math.PI;
    return [center.lng + dLng * Math.cos(angle), center.lat + dLat * Math.sin(angle)];
  });
};

/** 원을 감싸는 사각형 [[서, 남], [동, 북]] — 지도를 동네에 맞출 때 쓴다. */
export const circleBounds = (
  center: { lat: number; lng: number },
  radiusM: number
): [[number, number], [number, number]] => {
  const dLat = radiusM / METERS_PER_DEG;
  const dLng = radiusM / (METERS_PER_DEG * Math.cos(toRad(center.lat)));
  return [
    [center.lng - dLng, center.lat - dLat],
    [center.lng + dLng, center.lat + dLat],
  ];
};
