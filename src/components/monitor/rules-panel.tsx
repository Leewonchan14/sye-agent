"use client";

import {
  ArrowDown,
  ArrowUp,
  Copy,
  MessageSquareQuote,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CategoryEditor } from "@/components/monitor/category-editor";
import { RuleDialog } from "@/components/monitor/rule-dialog";
import { RuleValueEditor } from "@/components/monitor/rule-value-editors";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { useMonitorMutations } from "@/lib/monitor/queries";
import { newRuleId, ruleKindLabel } from "@/lib/monitor/rules";
import type {
  MonitorCategory,
  MonitorClientView,
  MonitorRule,
} from "@/lib/monitor/types";

interface Props {
  client: MonitorClientView;
  mutations: ReturnType<typeof useMonitorMutations>;
}

const RuleRow = ({
  rule,
  index,
  count,
  onValue,
  onEdit,
  onMove,
  onDuplicate,
  onDelete,
}: {
  rule: MonitorRule;
  index: number;
  count: number;
  onValue: (value: MonitorRule["value"]) => void;
  onEdit: () => void;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) => (
  <div
    data-rule-id={rule.id}
    className="grid items-center gap-3 rounded-xl border border-hairline bg-surface py-3.5 pr-2 pl-4 sm:grid-cols-[minmax(180px,1fr)_auto_auto]"
  >
    <div className="flex min-w-0 items-start justify-between gap-2 pr-8 sm:pr-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="text-[15px] font-medium text-ink">{rule.title}</h3>
          <span className="rounded-full bg-canvas-card px-2 py-0.5 text-[11px] text-muted">
            {ruleKindLabel(rule.kind)}
          </span>
        </div>
        {rule.quote && (
          <p className="mt-1 flex items-baseline gap-1.5 text-[13px] text-muted">
            <MessageSquareQuote className="size-3 shrink-0 translate-y-0.5 text-primary" />
            <span className="min-w-0 break-words">&ldquo;{rule.quote}&rdquo;</span>
          </p>
        )}
      </div>
    </div>
    <div className="flex min-w-0 sm:max-w-[440px] sm:justify-end">
      <RuleValueEditor
        key={`${rule.kind}:${JSON.stringify(rule.value)}`}
        rule={rule}
        onChange={onValue}
      />
    </div>
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${rule.title} 규칙 관리`}
            className="absolute top-2.5 right-2 text-muted sm:static"
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil /> 수정
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDuplicate}>
          <Copy /> 복제
        </DropdownMenuItem>
        <DropdownMenuItem disabled={index === 0} onClick={() => onMove(-1)}>
          <ArrowUp /> 위로
        </DropdownMenuItem>
        <DropdownMenuItem disabled={index === count - 1} onClick={() => onMove(1)}>
          <ArrowDown /> 아래로
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 /> 삭제
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);

export const RulesPanel = ({ client, mutations }: Props) => {
  const [dialog, setDialog] = useState<{
    open: boolean;
    rule: MonitorRule | null;
    key: number;
  }>({ open: false, rule: null, key: 0 });
  const [template, setTemplate] = useState({
    reportTitle: client.reportTitle,
    greeting: client.greeting,
    closing: client.closing,
  });

  const rules = client.rules;
  const saveRules = (next: MonitorRule[], message?: string, undo?: MonitorRule[]) =>
    mutations.updateClient.mutate(
      { id: client.id, rules: next },
      {
        onSuccess: () => {
          if (!message) return;
          if (undo)
            toast.success(message, {
              action: { label: "되돌리기", onClick: () => saveRules(undo) },
            });
          else toast.success(message);
        },
      }
    );
  const setValue = (id: string, value: MonitorRule["value"]) =>
    saveRules(rules.map((r) => (r.id === id ? { ...r, value } : r)));
  const saveCategories = (
    categories: MonitorCategory[],
    message?: string,
    undo?: MonitorCategory[]
  ) =>
    mutations.updateClient.mutate(
      { id: client.id, categories },
      {
        onSuccess: () => {
          if (!message) return;
          if (undo)
            toast.success(message, {
              action: { label: "되돌리기", onClick: () => saveCategories(undo) },
            });
          else toast.success(message);
        },
      }
    );

  const openDialog = (rule: MonitorRule | null) =>
    setDialog((d) => ({ open: true, rule, key: d.key + 1 }));
  const onSave = (rule: MonitorRule) => {
    const exists = rules.some((r) => r.id === rule.id);
    saveRules(
      exists ? rules.map((r) => (r.id === rule.id ? rule : r)) : [...rules, rule],
      exists ? "규칙을 고쳤어요." : "규칙을 추가했어요."
    );
  };
  const move = (index: number, delta: number) => {
    const next = [...rules];
    const [rule] = next.splice(index, 1);
    next.splice(index + delta, 0, rule);
    saveRules(next);
  };
  const duplicate = (index: number) => {
    const source = rules[index];
    const copy = {
      ...source,
      id: newRuleId(),
      title: `${source.title} (복사본)`.slice(0, 80),
    };
    saveRules(
      [...rules.slice(0, index + 1), copy, ...rules.slice(index + 1)],
      "규칙을 복제했어요."
    );
  };
  const remove = (rule: MonitorRule) =>
    saveRules(
      rules.filter((r) => r.id !== rule.id),
      `'${rule.title}' 규칙을 지웠어요.`,
      rules
    );

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-lg font-medium text-ink">수집 규칙</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              채팅에서 &ldquo;앞으로는~&rdquo;이라고 했던 지시를 여기서 관리해요.
              하치와레는 수집 전에 이 목록을 위에서부터 읽어요.
            </p>
          </div>
          <Button variant="outline" onClick={() => openDialog(null)}>
            <Plus /> 규칙 추가
          </Button>
        </div>
        {rules.length === 0 && (
          <div className="rounded-xl border border-dashed border-hairline px-4 py-6 text-center text-[13px] text-muted">
            아직 규칙이 없어요. 모니터링 기간, 제외 매체처럼 매번 지켜야 할 것을 추가해
            보세요.
          </div>
        )}
        {rules.map((rule, i) => (
          <div key={rule.id} className="relative">
            <RuleRow
              rule={rule}
              index={i}
              count={rules.length}
              onValue={(value) => setValue(rule.id, value)}
              onEdit={() => openDialog(rule)}
              onMove={(delta) => move(i, delta)}
              onDuplicate={() => duplicate(i)}
              onDelete={() => remove(rule)}
            />
          </div>
        ))}
        <RuleDialog
          key={dialog.key}
          open={dialog.open}
          rule={dialog.rule}
          onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
          onSave={onSave}
        />
      </section>

      <CategoryEditor categories={client.categories} onSave={saveCategories} />

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-medium text-ink">리포트 서식</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            <code className="font-mono">{"{date}"}</code> 자리에 수집 날짜가 들어가요.
          </p>
        </div>
        <label className="flex flex-col gap-1.5 text-[13px] text-muted">
          제목
          <Input
            value={template.reportTitle}
            onChange={(e) => setTemplate((t) => ({ ...t, reportTitle: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-muted">
          인사말
          <Textarea
            rows={3}
            value={template.greeting}
            onChange={(e) => setTemplate((t) => ({ ...t, greeting: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-muted">
          맺음말
          <Textarea
            rows={2}
            value={template.closing}
            onChange={(e) => setTemplate((t) => ({ ...t, closing: e.target.value }))}
          />
        </label>
        <div>
          <Button
            variant="outline"
            onClick={() =>
              mutations.updateClient.mutate(
                { id: client.id, ...template },
                { onSuccess: () => toast.success("리포트 서식을 저장했어요.") }
              )
            }
          >
            서식 저장
          </Button>
        </div>
      </section>
    </div>
  );
};
