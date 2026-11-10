import Papa from "papaparse";

import { kst } from "@/lib/kst";
import type {
  MonitorClientView,
  MonitorItemView,
  MonitorRunView,
} from "@/lib/monitor/types";
import { getReporterGap, IMPORTANCE_LABEL, SENTIMENT_LABEL } from "@/lib/monitor/types";

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

/** 화면용 기자 표기. 이미 "기자"·"특파원" 등이 붙어 오면 다시 붙이지 않는다. */
export const reporterLabel = (reporter: string) =>
  /(기자|특파원|에디터|칼럼니스트|PD)(\s|\(|$)/.test(reporter)
    ? reporter
    : `${reporter} 기자`;

/** 리포트에 들어가는 기사 — 포함으로 체크한 대표 기사 */
export const reportLeads = (items: MonitorItemView[]) =>
  items.filter((i) => i.category && i.included && (i.isLead || !i.dupGroup));

/** 메일 제목. 리포트 제목 서식이 없으면 고객사 이름으로 만든다. */
export const reportSubject = (client: MonitorClientView, run: MonitorRunView) => {
  const date = kst(run.until).format("YYYY.MM.DD");
  return client.reportTitle
    ? fillDate(client.reportTitle, date)
    : `[${client.name}] 모니터링 리포트 ${date}`;
};

/**
 * 엑셀에서 바로 열리는 CSV. 한글이 깨지지 않게 BOM을 붙인다.
 * 리포트에 넣은 기사(같은 보도자료 전재 포함)를 카테고리 순서대로 담는다.
 */
export const buildReportCsv = (client: MonitorClientView, items: MonitorItemView[]) => {
  const preferNaver = client.rules.some((r) => r.id === "naver-link" && r.value === true);
  const rows = client.categories.flatMap((category) =>
    items
      .filter((i) => {
        if (i.category !== category.key) return false;
        if (i.isLead || !i.dupGroup) return i.included;
        // 전재 기사는 대표 기사가 리포트에 들어갔을 때만 담는다.
        return items.some(
          (l) =>
            l.dupGroup === i.dupGroup &&
            l.isLead &&
            l.included &&
            l.category === category.key
        );
      })
      .map((i) => ({
        카테고리: category.name,
        세부분류: i.subcategory ?? "",
        구분: i.isLead || !i.dupGroup ? "대표" : "전재",
        제목: i.title,
        매체: i.media,
        기자: i.reporter || getReporterGap(i.flags)?.report || "",
        게재일시: i.publishedAt ? kst(i.publishedAt).format("YYYY-MM-DD HH:mm") : "",
        논조: i.sentiment ? SENTIMENT_LABEL[i.sentiment] : "",
        중요도: i.importance ? IMPORTANCE_LABEL[i.importance] : "",
        링크: preferredLink(i, preferNaver),
        핵심내용: i.summary ?? "",
      }))
  );
  return `\uFEFF${Papa.unparse(rows, { newline: "\r\n" })}`;
};

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
