import { kst } from "@/lib/kst";
import type {
  MonitorClientView,
  MonitorItemView,
  MonitorRunView,
} from "@/lib/monitor/types";
import { getReporterGap } from "@/lib/monitor/types";

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

export type ReportFormat = "email" | "plain";

/** 같은 보도자료 묶음에 속한 기사 수 (대표 포함). */
export const dupGroupSize = (items: MonitorItemView[], group: string | null) =>
  group ? items.filter((i) => i.dupGroup === group && i.category).length : 1;

/** 리포트에 링크로 쓸 주소 — 네이버 뉴스 링크가 있으면 우선한다. */
export const preferredLink = (item: MonitorItemView, preferNaver: boolean) =>
  (preferNaver && item.naverUrl) || item.url;

export const formatItemTime = (iso: string | null) =>
  iso ? kst(iso).format("YYYY.MM.DD HH:mm") : "확인 필요";

const fillDate = (template: string, date: string) => template.replaceAll("{date}", date);

/**
 * 선택한 기사로 고객사에 보낼 리포트 텍스트를 만든다.
 * 채팅에서 쓰던 형식(①… / 매체 / 게재 일시 / 기자 / 링크)을 그대로 따른다.
 */
export const buildMonitorReport = ({
  client,
  run,
  items,
  format,
}: {
  client: MonitorClientView;
  run: MonitorRunView;
  items: MonitorItemView[];
  format: ReportFormat;
}): string => {
  const preferNaver = client.rules.some((r) => r.id === "naver-link" && r.value === true);
  const date = kst(run.until).format("YYYY.MM.DD");
  const lines: string[] = [];

  if (format === "email" && client.greeting)
    lines.push(fillDate(client.greeting, date), "");
  if (client.reportTitle) lines.push(fillDate(client.reportTitle, date));
  lines.push(
    `모니터링 기간: ${kst(run.since).format("YYYY.MM.DD HH:mm")} ~ ${kst(run.until).format("YYYY.MM.DD HH:mm")}`,
    ""
  );

  const itemLines = (item: MonitorItemView, index: number) => [
    `${CIRCLED[index] ?? `${index + 1}.`} ${item.title}`,
    `- 매체: ${item.media}`,
    `- 게재 일시: ${formatItemTime(item.publishedAt)}`,
    `- 기자: ${item.reporter || getReporterGap(item.flags)?.report || "확인 불가"}`,
    `- 링크: ${preferredLink(item, preferNaver)}`,
    ...(item.summary ? [`- 핵심 내용: ${item.summary}`] : []),
    "",
  ];

  client.categories.forEach((category, ci) => {
    const inCategory = items.filter(
      (i) => i.category === category.key && i.included && i.isLead
    );
    lines.push(`${ci + 1}. <${category.name}>`);

    if (category.goal === null) {
      const total = items.filter((i) => i.category === category.key).length;
      lines.push(
        `- 총 ${total}건 게재 확인 (동일 보도자료 전재 포함 · 대표 ${inCategory.length}건 표기)`,
        ""
      );
    }
    if (!inCategory.length) {
      lines.push("- 해당 기간 관련 보도 없음", "");
      return;
    }

    if (category.subs?.length) {
      const subs = [...category.subs, null];
      subs.forEach((sub) => {
        const bySub = inCategory.filter((i) =>
          sub === null
            ? !category.subs!.includes(i.subcategory ?? "")
            : i.subcategory === sub
        );
        if (!bySub.length) return;
        if (sub) lines.push(`[${sub}]`);
        bySub.forEach((item, i) => lines.push(...itemLines(item, i)));
      });
    } else {
      inCategory.forEach((item, i) => lines.push(...itemLines(item, i)));
    }
  });

  if (format === "email" && client.closing) lines.push(client.closing);
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};
