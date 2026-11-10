import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { SharedReport } from "@/components/monitor/shared-report";
import { getSharedReport } from "@/lib/db/monitor";
import { reportSubject } from "@/lib/monitor/report";

export const dynamic = "force-dynamic";

const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

const load = cache(async (token: string) =>
  TOKEN.test(token) ? getSharedReport(token) : null
);

export const generateMetadata = async ({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> => {
  const report = await load((await params).token);
  const title = report ? reportSubject(report.client, report.run) : "모니터링 리포트";
  // 링크 미리보기에 사이트 이름 대신 리포트 제목이 보이게 하고, 검색에는 노출하지 않는다.
  return {
    title,
    description: "언론 모니터링 리포트",
    robots: { index: false, follow: false },
    openGraph: { title, description: "언론 모니터링 리포트", type: "article" },
    twitter: { card: "summary", title, description: "언론 모니터링 리포트" },
  };
};

const Page = async ({ params }: { params: Promise<{ token: string }> }) => {
  const report = await load((await params).token);
  if (!report) notFound();
  return <SharedReport {...report} />;
};

export default Page;
