/**
 * 데이트 장소 카드의 게시물 미디어. 사진과 영상 주소를 한 목록(`photos`)에 함께 담고,
 * 영상은 주소의 확장자(.mp4)로 가른다. 인스타그램 CDN 영상 주소는 경로가 .mp4로 끝난다.
 */
export const isSpotVideo = (url: string): boolean => {
  try {
    return /\.mp4$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
};
