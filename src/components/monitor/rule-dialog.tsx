"use client";

import { useState } from "react";

import { RuleValueEditor } from "@/components/monitor/rule-value-editors";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  defaultRuleValue,
  newRuleId,
  RULE_KIND_OPTIONS,
  ruleValueError,
} from "@/lib/monitor/rules";
import type { MonitorRule, MonitorRuleKind } from "@/lib/monitor/types";

const blankRule = (): MonitorRule => ({
  id: newRuleId(),
  title: "",
  quote: "",
  kind: "toggle",
  value: true,
});

/**
 * 수집 규칙 추가·수정. 이름, 출처(채팅 원문·메모), 종류, 값을 모두 고칠 수 있다.
 * 부모가 열 때마다 key를 바꿔 주면 초기값으로 다시 시작한다.
 */
export const RuleDialog = ({
  open,
  onOpenChange,
  rule,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null이면 새 규칙 */
  rule: MonitorRule | null;
  onSave: (rule: MonitorRule) => void;
}) => {
  const [draft, setDraft] = useState<MonitorRule>(rule ?? blankRule);
  const isNew = !rule;
  const kindHint = RULE_KIND_OPTIONS.find((o) => o.value === draft.kind)?.hint;
  const valueError = ruleValueError(draft);
  const canSave = draft.title.trim().length > 0 && !valueError;

  const setKind = (kind: MonitorRuleKind) =>
    setDraft((d) =>
      d.kind === kind
        ? d
        : {
            ...d,
            kind,
            // 원래 종류로 돌아오면 원래 값을 되살린다.
            value: rule?.kind === kind ? rule.value : defaultRuleValue(kind),
          }
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "수집 규칙 추가" : "수집 규칙 수정"}</DialogTitle>
          <DialogDescription>
            에이전트는 수집할 때마다 이 규칙의 이름과 값을 그대로 읽어요.
          </DialogDescription>
        </DialogHeader>
        <form
          id="rule-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSave) return;
            onSave({ ...draft, title: draft.title.trim(), quote: draft.quote.trim() });
            onOpenChange(false);
          }}
        >
          <label className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
            규칙 이름
            <Input
              value={draft.title}
              maxLength={80}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="예: 보도자료 전재 기사는 대표 3건만"
              autoFocus
            />
          </label>
          <div className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
            <span id="rule-kind-label">종류</span>
            <Select
              items={RULE_KIND_OPTIONS}
              value={draft.kind}
              onValueChange={(v) => setKind(v as MonitorRuleKind)}
            >
              <SelectTrigger className="w-full" aria-labelledby="rule-kind-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RULE_KIND_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {kindHint && (
              <span className="text-xs text-muted-foreground">{kindHint}</span>
            )}
          </div>
          <div className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
            값
            <div className="flex min-h-8 items-center">
              <RuleValueEditor
                live
                align="start"
                rule={draft}
                onChange={(value) => setDraft((d) => ({ ...d, value }))}
              />
            </div>
            {valueError && <span className="text-xs text-destructive">{valueError}</span>}
          </div>
          <label className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
            출처 · 메모 (선택)
            <Textarea
              rows={2}
              maxLength={400}
              value={draft.quote}
              onChange={(e) => setDraft((d) => ({ ...d, quote: e.target.value }))}
              placeholder="채팅에서 했던 말을 그대로 붙여 두면 나중에 왜 생긴 규칙인지 알 수 있어요."
            />
          </label>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="submit" form="rule-form" disabled={!canSave}>
            {isNew ? "추가" : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
