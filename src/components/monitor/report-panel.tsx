"use client";

import { Check, Copy, FileSpreadsheet, Undo2 } from "lucide-react";
import { useMemo, useRef } from "react";
import { toast } from "sonner";
import useLocalStorageState from "use-local-storage-state";

import { Button } from "@/components/ui/button";
import { kst } from "@/lib/kst";
import type { useMonitorMutations } from "@/lib/monitor/queries";
import {
  buildMonitorReport,
  buildReportCsv,
  reportLeads,
  type ReportFormat,
} from "@/lib/monitor/report";
import type {
  MonitorClientView,
  MonitorItemView,
  MonitorRunView,
} from "@/lib/monitor/types";
import { cn } from "@/lib/utils";

interface Props {
  client: MonitorClientView;
  run: MonitorRunView;
  items: MonitorItemView[];
  mutations: ReturnType<typeof useMonitorMutations>;
  onCopied: () => void;
}

/** 리포트에 넣은 기사를 엑셀에서 바로 열리는 CSV로 내려받는다. */
const downloadCsv = (
  client: MonitorClientView,
  run: MonitorRunView,
  items: MonitorItemView[]
) => {
  const blob = new Blob([buildReportCsv(client, items)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${client.name}_모니터링_${kst(run.until).format("YYYYMMDD")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const FORMATS: { id: ReportFormat; label: string }[] = [
  { id: "email", label: "메일 본문" },
  { id: "plain", label: "리포트만" },
];

export const ReportPanel = ({ client, run, items, mutations, onCopied }: Props) => {
  const [format, setFormat] = useLocalStorageState<ReportFormat>("monitor.reportFormat", {
    defaultValue: "email",
  });
  const preRef = useRef<HTMLPreElement>(null);
  const text = useMemo(
    () => buildMonitorReport({ client, run, items, format }),
    [client, run, items, format]
  );

  const leads = reportLeads(items);
  const missing = leads.filter((i) => !i.reporter || !i.publishedAt).length;
  const negative = leads.filter((i) => i.sentiment === "negative").length;
  const important = leads.filter((i) => i.importance === "high").length;
  const skipReported = client.rules.some(
    (r) => r.id === "skip-reported" && r.value === true
  );
  const exclusionNote = skipReported
    ? `포함한 ${leads.length}건은 다음 수집부터 자동으로 빠져요.`
    : '"어제 보고한 기사 제외" 규칙이 꺼져 있어서 다음 수집에도 다시 나와요.';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("리포트를 복사했어요. 보낸 뒤 '보고 완료로 표시'를 눌러 주세요.");
    } catch {
      const range = document.createRange();
      if (preRef.current) range.selectNodeContents(preRef.current);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      toast("텍스트를 선택해 뒀어요. 복사 단축키를 눌러 주세요.");
    }
    onCopied();
  };

  const markReported = () =>
    mutations.markReported.mutate(
      { runId: run.id, reportText: text },
      {
        onSuccess: () =>
          toast.success(`보고 완료로 표시했어요. ${exclusionNote}`, {
            action: {
              label: "되돌리기",
              onClick: () => mutations.unmarkReported.mutate(run.id),
            },
          }),
      }
    );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0 rounded-xl border border-border bg-card px-5 py-6 sm:px-8">
        <pre
          ref={preRef}
          className="font-sans text-[14px] leading-7 [overflow-wrap:anywhere] break-keep whitespace-pre-wrap text-foreground"
        >
          {text}
        </pre>
      </div>

      <aside className="flex flex-col gap-4 rounded-xl border border-border bg-muted p-4 lg:sticky lg:top-4">
        <h3 className="text-sm font-medium text-foreground">보내기 전에</h3>
        <div
          className="inline-flex rounded-full bg-muted p-1"
          role="radiogroup"
          aria-label="리포트 형식"
        >
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={format === f.id}
              onClick={() => setFormat(f.id)}
              className={cn(
                "flex-1 rounded-full px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground",
                format === f.id && "bg-card text-foreground ring-1 ring-border"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
          <dt className="text-muted-foreground">포함 기사</dt>
          <dd className="text-right font-mono tabular-nums">{leads.length}건</dd>
          {client.categories
            .filter((c) => c.goal !== null)
            .map((c) => (
              <div key={c.key} className="contents">
                <dt className="truncate text-muted-foreground">{c.name}</dt>
                <dd className="text-right font-mono tabular-nums">
                  {leads.filter((i) => i.category === c.key).length} / {c.goal}
                </dd>
              </div>
            ))}
          <dt className="text-muted-foreground">기자·시각 누락</dt>
          <dd
            className={cn(
              "text-right font-mono text-success tabular-nums",
              missing > 0 && "text-warning"
            )}
          >
            {missing}건
          </dd>
          <dt className="text-muted-foreground">부정 기사</dt>
          <dd
            className={cn(
              "text-right font-mono text-muted-foreground tabular-nums",
              negative > 0 && "text-destructive"
            )}
          >
            {negative}건
          </dd>
          <dt className="text-muted-foreground">중요 기사</dt>
          <dd
            className={cn(
              "text-right font-mono text-muted-foreground tabular-nums",
              important > 0 && "text-warning"
            )}
          >
            {important}건
          </dd>
        </dl>
        <Button onClick={copy} disabled={!leads.length}>
          <Copy /> 리포트 복사
        </Button>
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          {run.reportedAt ? (
            <>
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-success">
                <Check className="size-3.5" />
                {kst(run.reportedAt).format("M월 D일 HH:mm")}에 보고 완료
              </p>
              <p className="text-[12px] text-muted-foreground">{exclusionNote}</p>
              <Button
                variant="outline"
                size="sm"
                disabled={mutations.unmarkReported.isPending}
                onClick={() => mutations.unmarkReported.mutate(run.id)}
              >
                <Undo2 /> 보고 전으로 되돌리기
              </Button>
            </>
          ) : (
            <>
              <p className="text-[12px] text-muted-foreground">
                고객사에 보낸 뒤 눌러 주세요. {exclusionNote} 잘못 눌러도 되돌릴 수
                있어요.
              </p>
              <Button
                variant="outline"
                disabled={!leads.length || mutations.markReported.isPending}
                onClick={markReported}
              >
                <Check /> 보고 완료로 표시
              </Button>
            </>
          )}
        </div>
        <div className="border-t border-border pt-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={!leads.length}
            onClick={() => downloadCsv(client, run, items)}
          >
            <FileSpreadsheet /> 엑셀(CSV)로 받기
          </Button>
        </div>
      </aside>
    </div>
  );
};
