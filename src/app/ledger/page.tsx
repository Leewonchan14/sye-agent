import { Suspense } from "react";

import { LedgerPage } from "@/components/ledger/ledger-page";

export default function Page() {
  // 탭·여행·리포트 기간을 주소 쿼리에서 읽으므로 정적 렌더링 때 Suspense 경계가 필요하다.
  return (
    <Suspense>
      <LedgerPage />
    </Suspense>
  );
}
