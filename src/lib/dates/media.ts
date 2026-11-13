/**
 * 데이트 추천 카드의 게시물 미디어. 사진과 영상 주소를 한 목록(`photos`)에 함께 담는다.
 *
 * 영상은 인스타그램 CDN 영상 주소(경로가 .mp4로 끝난다)에 표지 사진 주소를 `#poster=`로 붙여 둔다.
 * 표지 사진은 영상이 뜨기 전에 보여 준다.
 * 조각(#)은 서버로 가지 않으므로 영상을 받는 데 영향이 없고, DB 스키마도 그대로 둘 수 있다.
 */
export type SpotMedia =
  { kind: "photo"; src: string } | { kind: "video"; src: string; poster: string | null };

const POSTER = "#poster=";

export const toSpotVideo = (video: string, poster: string | null): string =>
  poster ? `${video}${POSTER}${encodeURIComponent(poster)}` : video;

const isVideoPath = (url: string): boolean => {
  try {
    return /\.mp4$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
};

export const isSpotVideo = (url: string): boolean => isVideoPath(url.split("#")[0]);

export const parseSpotMedia = (url: string): SpotMedia => {
  if (!isSpotVideo(url)) return { kind: "photo", src: url };
  const at = url.indexOf(POSTER);
  if (at < 0) return { kind: "video", src: url.split("#")[0], poster: null };
  return {
    kind: "video",
    src: url.slice(0, at),
    poster: decodeURIComponent(url.slice(at + POSTER.length)),
  };
};

/** 만료 시각을 따질 실제 주소들(영상이면 영상과 표지 사진 둘 다). */
export const spotMediaUrls = (url: string): string[] => {
  const media = parseSpotMedia(url);
  return media.kind === "video" && media.poster ? [media.src, media.poster] : [media.src];
};
