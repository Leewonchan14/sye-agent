"use client";

import { Copy, FileSpreadsheet, Link2, Link2Off, Mail, Send, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { kst } from "@/lib/kst";
import { shareReportPath } from "@/lib/monitor/origin";
import type { useMonitorMutations } from "@/lib/monitor/queries";
import { buildReportCsv, reportLeads, reportSubject } from "@/lib/monitor/report";
import type {
  MonitorClientView,
  MonitorItemView,
  MonitorRunView,
} from "@/lib/monitor/types";

interface Props {
  client: MonitorClientView;
  run: MonitorRunView;
  items: MonitorItemView[];
  mutations: ReturnType<typeof useMonitorMutations>;
  mailReady: boolean;
}

const emailSchema = z.email();

const SectionTitle = ({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: string;
}) => (
  <h4 className="flex items-center gap-1.5 text-[13px] font-medium text-ink [&_svg]:size-3.5 [&_svg]:text-primary">
    {icon}
    {children}
  </h4>
);

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

const ShareLink = ({ run, mutations }: Pick<Props, "run" | "mutations">) => {
  const url = run.shareToken
    ? `${window.location.origin}${shareReportPath(run.shareToken)}`
    : null;
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("공유 링크를 복사했어요.");
    } catch {
      toast("링크를 직접 선택해 복사해 주세요.");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <SectionTitle icon={<Link2 />}>공유 링크</SectionTitle>
      {url ? (
        <>
          <Input
            readOnly
            value={url}
            aria-label="공유 링크 주소"
            onFocus={(e) => e.currentTarget.select()}
            className="h-8 font-mono text-[12px]"
          />
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="flex-1" onClick={copy}>
              <Copy /> 링크 복사
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={mutations.shareLink.isPending}
              onClick={() => mutations.shareLink.mutate({ runId: run.id, on: false })}
            >
              <Link2Off /> 끄기
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[12px] text-muted">
            로그인 없이 열리는 읽기 전용 페이지예요. 리포트에 넣은 기사만 보여요.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={mutations.shareLink.isPending}
            onClick={() => mutations.shareLink.mutate({ runId: run.id, on: true })}
          >
            <Link2 /> 공유 링크 만들기
          </Button>
        </>
      )}
    </div>
  );
};

const Recipients = ({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) => {
  const [draft, setDraft] = useState("");
  const add = () => {
    const entries = draft
      .split(/[,\s;]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (!entries.length) return;
    const invalid = entries.filter((e) => !emailSchema.safeParse(e).success);
    if (invalid.length) {
      toast.error(`메일 주소 형식이 아니에요: ${invalid.join(", ")}`);
      return;
    }
    const next = [...new Set([...value, ...entries])];
    if (next.length !== value.length) onChange(next);
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-1.5">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="받는 사람">
          {value.map((email) => (
            <li
              key={email}
              className="inline-flex h-6 max-w-full items-center gap-0.5 rounded-full bg-canvas-card pr-0.5 pl-2 text-[12px]"
            >
              <span className="truncate">{email}</span>
              <button
                type="button"
                aria-label={`${email} 빼기`}
                onClick={() => onChange(value.filter((e) => e !== email))}
                className="grid size-5 shrink-0 place-items-center rounded-full text-muted hover:bg-canvas-strong hover:text-ink"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        type="email"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="받는 사람 메일 입력 후 Enter"
        aria-label="받는 사람 메일 추가"
        className="h-8 text-[13px]"
      />
    </div>
  );
};

const MailSender = ({ client, run, items, mutations, mailReady }: Props) => {
  const [open, setOpen] = useState(false);
  const [includeLink, setIncludeLink] = useState(true);
  const leads = reportLeads(items);
  const recipients = client.reportEmails;

  const send = () =>
    mutations.sendMail.mutate(
      { runId: run.id, includeLink },
      {
        onSuccess: ({ to }) => {
          setOpen(false);
          toast.success(`${to.length}명에게 보냈고 보고 완료로 표시했어요.`, {
            action: {
              label: "보고 되돌리기",
              onClick: () => mutations.unmarkReported.mutate(run.id),
            },
          });
        },
      }
    );

  return (
    <div className="flex flex-col gap-2">
      <SectionTitle icon={<Mail />}>메일로 보내기</SectionTitle>
      <Recipients
        value={recipients}
        onChange={(reportEmails) =>
          mutations.updateClient.mutate({ id: client.id, reportEmails })
        }
      />
      {run.mailedAt && (
        <p className="text-[12px] text-success">
          {kst(run.mailedAt).format("M월 D일 HH:mm")}에 {run.mailedTo[0]}
          {run.mailedTo.length > 1 && ` 외 ${run.mailedTo.length - 1}명`}에게 보냄
        </p>
      )}
      {!mailReady && (
        <p className="text-[12px] text-muted">
          서버에 메일 발송 설정(MONITOR_SMTP_URL)이 없어서 보낼 수 없어요.
        </p>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={!mailReady || !recipients.length || !leads.length}
        onClick={() => setOpen(true)}
      >
        <Send /> {run.mailedAt ? "다시 보내기" : "메일 보내기"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>리포트를 메일로 보낼까요?</DialogTitle>
            <DialogDescription>
              보내면 보고 완료로 표시돼요. 본문은 &lsquo;메일 본문&rsquo; 형식과 같아요.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
            <dt className="text-muted">받는 사람</dt>
            <dd className="break-all">{recipients.join(", ")}</dd>
            <dt className="text-muted">제목</dt>
            <dd className="break-words">{reportSubject(client, run)}</dd>
            <dt className="text-muted">기사</dt>
            <dd>{leads.length}건</dd>
          </dl>
          <label className="flex items-center gap-2 text-[13px] text-body">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-primary)]"
              checked={includeLink && Boolean(run.shareToken)}
              disabled={!run.shareToken}
              onChange={(e) => setIncludeLink(e.target.checked)}
            />
            {run.shareToken
              ? "메일 끝에 공유 링크(웹에서 보기) 넣기"
              : "공유 링크를 만들면 메일에 함께 넣을 수 있어요"}
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button disabled={mutations.sendMail.isPending} onClick={send}>
              <Send /> {mutations.sendMail.isPending ? "보내는 중…" : "보내기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/** 리포트를 링크·엑셀·메일로 내보낸다. */
export const ReportShare = (props: Props) => (
  <div className="flex flex-col gap-4 border-t border-hairline pt-3">
    <ShareLink run={props.run} mutations={props.mutations} />
    <div className="flex flex-col gap-2">
      <SectionTitle icon={<FileSpreadsheet />}>엑셀로 받기</SectionTitle>
      <Button
        size="sm"
        variant="outline"
        disabled={!reportLeads(props.items).length}
        onClick={() => downloadCsv(props.client, props.run, props.items)}
      >
        <FileSpreadsheet /> CSV 내려받기
      </Button>
    </div>
    <MailSender {...props} />
  </div>
);
