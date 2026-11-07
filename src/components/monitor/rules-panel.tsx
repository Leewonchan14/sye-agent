"use client";

import { MessageSquareQuote, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { useMonitorMutations } from "@/lib/monitor/queries";
import type {
  MonitorCategory,
  MonitorClientView,
  MonitorRule,
} from "@/lib/monitor/types";
import { cn } from "@/lib/utils";

interface Props {
  client: MonitorClientView;
  mutations: ReturnType<typeof useMonitorMutations>;
}

const KIND_OPTIONS: { value: MonitorRule["kind"]; label: string }[] = [
  { value: "toggle", label: "켜고 끄기" },
  { value: "tags", label: "목록" },
  { value: "number", label: "숫자" },
  { value: "text", label: "문장" },
];

const defaultValue = (kind: MonitorRule["kind"]): MonitorRule["value"] =>
  kind === "toggle" ? true : kind === "tags" ? [] : kind === "number" ? 0 : "";

const Switch = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={cn(
      "relative h-[22px] w-[38px] shrink-0 rounded-full bg-canvas-strong transition-colors",
      checked && "bg-primary"
    )}
  >
    <span
      className={cn(
        "absolute top-[3px] left-[3px] size-4 rounded-full bg-surface transition-[left]",
        checked && "left-[19px]"
      )}
    />
  </button>
);

const TagsEditor = ({
  value,
  onChange,
  label,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  label: string;
}) => {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex h-7 items-center gap-1 rounded-full bg-canvas-card pr-1 pl-2.5 text-[13px]"
        >
          {tag}
          <button
            type="button"
            aria-label={`${tag} 삭제`}
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="grid size-5 place-items-center rounded-full text-muted hover:bg-canvas-strong hover:text-ink"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="추가 후 Enter"
        aria-label={`${label}에 추가`}
        className="h-7 w-28 text-[13px]"
      />
    </div>
  );
};

export const RulesPanel = ({ client, mutations }: Props) => {
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<MonitorRule["kind"]>("toggle");
  const [template, setTemplate] = useState({
    reportTitle: client.reportTitle,
    greeting: client.greeting,
    closing: client.closing,
  });

  const saveRules = (rules: MonitorRule[], message?: string) =>
    mutations.updateClient.mutate(
      { id: client.id, rules },
      { onSuccess: () => message && toast.success(message) }
    );
  const setRule = (id: string, value: MonitorRule["value"]) =>
    saveRules(client.rules.map((r) => (r.id === id ? { ...r, value } : r)));
  const saveCategories = (categories: MonitorCategory[]) =>
    mutations.updateClient.mutate({ id: client.id, categories });

  const addRule = () => {
    const title = newTitle.trim();
    if (!title) return;
    const id = `rule-${Date.now().toString(36)}`;
    saveRules(
      [
        ...client.rules,
        { id, title, quote: "", kind: newKind, value: defaultValue(newKind) },
      ],
      "규칙을 추가했어요."
    );
    setNewTitle("");
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-medium text-ink">수집 규칙</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            채팅에서 &ldquo;앞으로는~&rdquo;이라고 했던 지시를 여기서 관리해요. 하치와레는
            수집 전에 이 목록을 읽어요.
          </p>
        </div>
        {client.rules.map((rule) => (
          <div
            key={rule.id}
            className="grid items-center gap-3 rounded-xl border border-hairline bg-surface px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto]"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-medium text-ink">{rule.title}</h3>
                <button
                  type="button"
                  aria-label={`${rule.title} 규칙 삭제`}
                  onClick={() =>
                    saveRules(
                      client.rules.filter((r) => r.id !== rule.id),
                      "규칙을 지웠어요."
                    )
                  }
                  className="text-muted-soft hover:text-error"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              {rule.quote && (
                <p className="mt-1 flex items-baseline gap-1.5 text-[13px] text-muted">
                  <MessageSquareQuote className="size-3 shrink-0 translate-y-0.5 text-primary" />
                  <span>&ldquo;{rule.quote}&rdquo;</span>
                </p>
              )}
            </div>
            <div className="flex sm:justify-end">
              {rule.kind === "toggle" && (
                <Switch
                  checked={rule.value === true}
                  label={rule.title}
                  onChange={(v) => setRule(rule.id, v)}
                />
              )}
              {rule.kind === "number" && (
                <Input
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={Number(rule.value) || 0}
                  aria-label={rule.title}
                  className="h-8 w-20"
                  onBlur={(e) => setRule(rule.id, Number(e.target.value) || 0)}
                />
              )}
              {rule.kind === "text" && (
                <Input
                  defaultValue={String(rule.value ?? "")}
                  aria-label={rule.title}
                  className="h-8 w-full sm:w-56"
                  onBlur={(e) => setRule(rule.id, e.target.value)}
                />
              )}
              {rule.kind === "tags" && (
                <TagsEditor
                  value={Array.isArray(rule.value) ? rule.value : []}
                  label={rule.title}
                  onChange={(v) => setRule(rule.id, v)}
                />
              )}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-hairline px-4 py-3">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) addRule();
            }}
            placeholder="새 규칙 (예: 보도자료 전재 기사는 대표 3건만)"
            aria-label="새 규칙 이름"
            className="h-8 min-w-0 flex-1"
          />
          <Select
            items={KIND_OPTIONS}
            value={newKind}
            onValueChange={(v) => setNewKind(v as MonitorRule["kind"])}
          >
            <SelectTrigger className="w-[112px]" aria-label="규칙 종류">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={addRule} disabled={!newTitle.trim()}>
            <Plus /> 추가
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-medium text-ink">카테고리 목표</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            목표보다 적으면 &ldquo;더 찾기&rdquo; 버튼이 나와요. 비워 두면 전수 집계
            섹션이에요.
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
          {client.categories.map((c, i) => (
            <div
              key={c.key}
              className="flex items-center justify-between gap-3 border-t border-hairline/60 px-4 py-2.5 first:border-t-0"
            >
              <span className="text-sm text-ink">{c.name}</span>
              <span className="flex items-center gap-2 text-[13px] text-muted">
                최소
                <Input
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={c.goal ?? ""}
                  placeholder="전수"
                  aria-label={`${c.name} 최소 건수`}
                  className="h-8 w-20"
                  onBlur={(e) => {
                    const goal = e.target.value === "" ? null : Number(e.target.value);
                    if (goal === c.goal) return;
                    saveCategories(
                      client.categories.map((x, j) => (j === i ? { ...x, goal } : x))
                    );
                  }}
                />
                건
              </span>
            </div>
          ))}
        </div>
      </section>

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
