import type { Metadata } from "next";

import { DateSpotsPage } from "@/components/dates/date-spots-page";

/**
 * 추천 카드 사진·영상은 인스타그램 CDN에서 바로 받는다. CDN은 다른 사이트의 리퍼러가 붙으면
 * 거절할 수 있는데, Image Zoom이 확대할 크기를 재려고 사진을 다시 받을 때는 img의
 * referrerPolicy를 따르지 않으므로 페이지 전체에서 리퍼러를 보내지 않는다.
 */
export const metadata: Metadata = { referrer: "no-referrer" };

export default function Page() {
  return <DateSpotsPage />;
}
