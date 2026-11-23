import type { Metadata } from "next";
import { Suspense } from "react";

import { PlacesPage } from "@/components/places/places-page";

/** 장소 사진은 네이버·인스타그램 이미지 서버에서 바로 받는다. 다른 사이트 리퍼러를 보내지 않는다. */
export const metadata: Metadata = { referrer: "no-referrer" };

export default function Page() {
  // 지역·종류를 주소 쿼리(?area=, ?kind=)에서 읽으므로 정적 렌더링 때 Suspense 경계가 필요하다.
  return (
    <Suspense>
      <PlacesPage />
    </Suspense>
  );
}
