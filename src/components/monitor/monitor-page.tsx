"use client";

import { Newspaper, Plus, Siren } from "lucide-react";
import { useState } from "react";
import useLocalStorageState from "use-local-storage-state";

import { ClientView } from "@/components/monitor/client-view";
import { ClientWizard } from "@/components/monitor/client-wizard";
import { CreateIssueDialog } from "@/components/monitor/create-dialogs";
import { IssueView } from "@/components/monitor/issue-view";
import { TodayBoard } from "@/components/monitor/today-board";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useMonitorOverview } from "@/lib/monitor/queries";
import type { MonitorOverview } from "@/lib/monitor/types";
import { cn } from "@/lib/utils";

interface Selection {
  kind: "client" | "issue";
  id: number;
}

/** 저장된 선택이 사라졌으면 첫 고객사(없으면 첫 이슈)로 돌아간다. */
const resolveSelection = (
  selected: Selection | null,
  data: MonitorOverview | undefined
): Selection | null => {
  if (!data) return null;
  const exists =
    selected &&
    (selected.kind === "client"
      ? data.clients.some((c) => c.id === selected.id)
      : data.issues.some((i) => i.id === selected.id));
  if (exists) return selected;
  if (data.clients[0]) return { kind: "client", id: data.clients[0].id };
  if (data.issues[0]) return { kind: "issue", id: data.issues[0].id };
  return null;
};

const ChipButton = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={cn(
      "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium whitespace-nowrap text-muted-foreground ring-1 ring-transparent transition-colors hover:bg-muted hover:text-foreground",
      active && "bg-muted text-foreground ring-border"
    )}
  >
    {children}
  </button>
);

/** 고객사와 이슈를 섞이지 않게 종류별로 한 줄씩 보여 준다. */
const NavRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
    <span className="shrink-0 text-xs font-medium text-muted-foreground sm:w-[88px]">
      {label}
    </span>
    <div className="-m-1 flex min-w-0 flex-1 [scrollbar-width:none] items-center gap-1.5 overflow-x-auto p-1">
      {children}
    </div>
  </div>
);

export const MonitorPage = () => {
  const { data, isLoading, error } = useMonitorOverview();
  const [stored, setStored] = useLocalStorageState<Selection | null>("monitor.selected", {
    defaultValue: null,
  });
  const [clientDialog, setClientDialog] = useState(false);
  const [issueDialog, setIssueDialog] = useState(false);
  const [wizardKey, setWizardKey] = useState(0);
  const selected = resolveSelection(stored, data);
  const empty = data && !data.clients.length && !data.issues.length;
  const openClientWizard = () => {
    setWizardKey((k) => k + 1);
    setClientDialog(true);
  };

  return (
    <SidebarLayout activeNav="monitor">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 pt-5 md:px-8 md:pt-8">
        <nav aria-label="고객사와 이슈" className="flex flex-col gap-1.5">
          <NavRow label="데일리 모니터링">
            {data?.clients.map((c) => (
              <ChipButton
                key={`c-${c.id}`}
                active={selected?.kind === "client" && selected.id === c.id}
                onClick={() => setStored({ kind: "client", id: c.id })}
              >
                <Newspaper className="size-3.5 text-primary" />
                {c.name}
                {c.latestRun && !c.latestRun.reportedAt && (
                  <span
                    className="size-1.5 rounded-full bg-primary"
                    aria-label="보고 전"
                  />
                )}
              </ChipButton>
            ))}
            {data && (
              <Button variant="ghost" size="sm" onClick={openClientWizard}>
                <Plus /> 고객사
              </Button>
            )}
          </NavRow>
          <NavRow label="이슈 트래커">
            {data?.issues.map((i) => (
              <ChipButton
                key={`i-${i.id}`}
                active={selected?.kind === "issue" && selected.id === i.id}
                onClick={() => setStored({ kind: "issue", id: i.id })}
              >
                <Siren className="size-3.5 text-primary" />
                {i.title}
                {!i.isActive && (
                  <span className="text-[11px] text-muted-foreground">종료</span>
                )}
              </ChipButton>
            ))}
            {data && (
              <Button variant="ghost" size="sm" onClick={() => setIssueDialog(true)}>
                <Plus /> 이슈
              </Button>
            )}
          </NavRow>
        </nav>

        {data && (
          <TodayBoard
            overview={data}
            isSelected={(kind, id) => selected?.kind === kind && selected.id === id}
            onSelectClient={(id) => setStored({ kind: "client", id })}
            onSelectIssue={(id) => setStored({ kind: "issue", id })}
          />
        )}

        {isLoading && (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        )}
        {error && (
          <p className="py-10 text-center text-sm text-destructive">{error.message}</p>
        )}

        {empty && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
            <Newspaper className="size-7 text-primary" />
            <h1 className="text-xl font-medium text-foreground">
              언론 모니터링을 시작해 볼까요?
            </h1>
            <p className="max-w-md text-sm text-muted-foreground">
              고객사를 추가하면 정한 시각마다 에이전트가 기사를 모아 여기에 쌓아요. 특정
              이슈의 보도량만 따로 지켜보려면 이슈를 추가하세요.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={openClientWizard}>
                <Plus /> 고객사 추가
              </Button>
              <Button variant="outline" onClick={() => setIssueDialog(true)}>
                <Plus /> 이슈 추가
              </Button>
            </div>
          </div>
        )}

        {selected?.kind === "client" && (
          <ClientView key={selected.id} clientId={selected.id} />
        )}
        {selected?.kind === "issue" && (
          <IssueView key={selected.id} issueId={selected.id} />
        )}
        <div className="h-6" />
      </main>

      <ClientWizard
        key={wizardKey}
        open={clientDialog}
        onOpenChange={setClientDialog}
        onCreated={(id) => setStored({ kind: "client", id })}
      />
      <CreateIssueDialog
        open={issueDialog}
        onOpenChange={setIssueDialog}
        clients={data?.clients ?? []}
        onCreated={(id) => setStored({ kind: "issue", id })}
      />
    </SidebarLayout>
  );
};
