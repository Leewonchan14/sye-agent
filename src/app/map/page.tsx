import type { Metadata } from "next";
import { Suspense } from "react";

import { DateMapPage } from "@/components/map/date-map-page";

/** 장소 사진은 네이버 이미지 서버에서 바로 받는다. 다른 사이트 리퍼러를 보내지 않는다. */
export const metadata: Metadata = { referrer: "no-referrer" };

export default function Page() {
  // 기간·장소를 주소 쿼리(?range=, ?place=)에서 읽으므로 정적 렌더링 때 Suspense 경계가 필요하다.
  return (
    <Suspense>
      <DateMapPage />
    </Suspense>
  );
}
