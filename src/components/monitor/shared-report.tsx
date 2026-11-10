import { ExternalLink } from "lucide-react";

import { kst } from "@/lib/kst";
import {
  formatItemTime,
  preferredLink,
  reporterLabel,
  reportLeads,
  reportSubject,
} from "@/lib/monitor/report";
import type {
  MonitorClientView,
  MonitorItemView,
  MonitorRunView,
} from "@/lib/monitor/types";
import { getReporterGap } from "@/lib/monitor/types";

interface Props {
  client: MonitorClientView;
  run: MonitorRunView;
  items: MonitorItemView[];
}

const ArticleCard = ({
  item,
  copies,
  preferNaver,
}: {
  item: MonitorItemView;
  copies: MonitorItemView[];
  preferNaver: boolean;
}) => (
  <li className="flex flex-col gap-1.5 border-t border-hairline/60 px-5 py-4 first:border-t-0">
    <a
      href={preferredLink(item, preferNaver)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[16px] leading-snug font-medium break-words text-ink hover:underline hover:underline-offset-4"
    >
      {item.title}
    </a>
    <p className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[13px] text-muted">
      <span className="font-medium text-body">{item.media}</span>
      <span>
        {item.reporter
          ? reporterLabel(item.reporter)
          : (getReporterGap(item.flags)?.report ?? "기자 확인 불가")}
      </span>
      <span className="font-mono tabular-nums">{formatItemTime(item.publishedAt)}</span>
    </p>
    {item.summary && (
      <p className="text-[14px] leading-relaxed break-keep text-body">{item.summary}</p>
    )}
    {copies.length > 0 && (
      <details className="group text-[13px]">
        <summary className="cursor-pointer text-primary marker:text-primary">
          같은 보도자료를 실은 매체 {copies.length}곳
        </summary>
        <ul className="mt-2 grid gap-1">
          {copies.map((c) => (
            <li key={c.id} className="flex min-w-0 items-baseline gap-2 text-body">
              <span className="shrink-0">{c.media}</span>
              <a
                href={preferredLink(c, preferNaver)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate text-muted hover:underline"
                title={c.title}
              >
                {c.title}
              </a>
              <ExternalLink className="size-3 shrink-0 text-muted-soft" />
            </li>
          ))}
        </ul>
      </details>
    )}
  </li>
);

/** 공유 링크(/r/{token})로 여는 읽기 전용 리포트. 리포트에 넣은 대표 기사만 보여 준다. */
export const SharedReport = ({ client, run, items }: Props) => {
  const preferNaver = client.rules.some((r) => r.id === "naver-link" && r.value === true);
  const leads = reportLeads(items);

  return (
    <main className="h-full overflow-y-auto bg-canvas">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6">
        <header className="flex flex-col gap-2">
          <p className="text-[12px] font-medium tracking-[0.12em] text-primary uppercase">
            Media Monitoring · {client.name}
          </p>
          <h1 className="text-2xl font-medium tracking-tight text-balance text-ink">
            {reportSubject(client, run)}
          </h1>
          <p className="text-[13px] text-muted">
            모니터링 기간 {kst(run.since).format("YYYY.MM.DD HH:mm")} ~{" "}
            {kst(run.until).format("YYYY.MM.DD HH:mm")} · 기사 {leads.length}건
          </p>
        </header>

        {client.categories.map((category, ci) => {
          const inCategory = leads.filter((i) => i.category === category.key);
          const total = items.filter((i) => i.category === category.key).length;
          return (
            <section key={category.key} className="flex flex-col gap-2.5">
              <h2 className="flex flex-wrap items-baseline gap-x-3 text-lg font-medium text-ink">
                <span>
                  {ci + 1}. {category.name}
                </span>
                {category.goal === null && total > 0 && (
                  <span className="text-[13px] font-normal text-muted">
                    총 {total}건 게재 (전재 포함)
                  </span>
                )}
              </h2>
              {inCategory.length ? (
                <ol className="overflow-hidden rounded-xl border border-hairline bg-surface">
                  {inCategory.map((item) => (
                    <ArticleCard
                      key={item.id}
                      item={item}
                      preferNaver={preferNaver}
                      copies={
                        item.dupGroup
                          ? items.filter(
                              (g) =>
                                g.dupGroup === item.dupGroup &&
                                g.id !== item.id &&
                                g.category === category.key
                            )
                          : []
                      }
                    />
                  ))}
                </ol>
              ) : (
                <p className="rounded-xl border border-dashed border-hairline px-5 py-5 text-sm text-muted">
                  해당 기간 관련 보도 없음
                </p>
              )}
            </section>
          );
        })}

        <footer className="border-t border-hairline pt-4 text-[12px] text-muted-soft">
          {kst().format("YYYY.MM.DD HH:mm")} 기준 · 공유 링크로만 열리는 페이지예요.
        </footer>
      </div>
    </main>
  );
};
