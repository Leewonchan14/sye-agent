import { Suspense } from "react";

import { PickPage } from "@/components/pick/pick-page";

export default function Page() {
  // 보고 있는 뽑기를 주소 쿼리(?pick=)에서 읽으므로 정적 렌더링 때 Suspense 경계가 필요하다.
  return (
    <Suspense>
      <PickPage />
    </Suspense>
  );
}
