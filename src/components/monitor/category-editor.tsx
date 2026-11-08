"use client";

import { ArrowDown, ArrowUp, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { RuleSwitch, TagsEditor } from "@/components/monitor/rule-value-editors";
import { SaveBar } from "@/components/monitor/schedule-editors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { MonitorCategory } from "@/lib/monitor/types";
import { cn } from "@/lib/utils";

const MAX_CATEGORIES = 12;
const newCategoryKey = () => `cat-${Date.now().toString(36)}`;

/** 빈칸이면 전수 집계(null) */
const parseGoal = (raw: string) =>
  raw.trim() === "" ? null : Math.min(100, Math.max(0, Math.round(Number(raw) || 0)));

const GoalInput = ({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (raw: string) => void;
}) => (
  <span className="flex items-center gap-2 text-[13px] text-muted">
    최소
    <Input
      type="number"
      inputMode="numeric"
      min={0}
      max={100}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="전수"
      aria-label={`${name} 최소 건수`}
      className="h-8 w-20"
    />
    건
  </span>
);

/** 카테고리 추가·수정 — 이름, 목표(최소 건수 또는 전수 집계), 세부 분류 */
const CategoryDialog = ({
  open,
  onOpenChange,
  category,
  existingNames,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: MonitorCategory | null;
  existingNames: string[];
  onSave: (category: MonitorCategory) => void;
}) => {
  const [draft, setDraft] = useState<MonitorCategory>(
    category ?? { key: newCategoryKey(), name: "", goal: 3, subs: [] }
  );
  const isNew = !category;
  const name = draft.name.trim();
  const duplicate = name !== category?.name && existingNames.includes(name);
  const canSave = name.length > 0 && !duplicate;
  const countAll = draft.goal === null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "카테고리 추가" : "카테고리 수정"}</DialogTitle>
          <DialogDescription>
            하치와레는 기사를 이 카테고리로 나눠 담고, 목표보다 적으면 더 찾아요.
          </DialogDescription>
        </DialogHeader>
        <form
          id="category-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSave) return;
            const subs = (draft.subs ?? []).filter(Boolean);
            onSave({ ...draft, name, subs: subs.length ? subs : undefined });
            onOpenChange(false);
          }}
        >
          <label className="flex flex-col gap-1.5 text-[13px] text-muted">
            이름
            <Input
              value={draft.name}
              maxLength={60}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="예: 경쟁사 동향"
              aria-invalid={duplicate || undefined}
            />
            {duplicate && (
              <span className="text-xs text-error">같은 이름의 카테고리가 있어요.</span>
            )}
          </label>
          <div className="flex flex-col gap-2 text-[13px] text-muted">
            <div className="flex items-center justify-between gap-3">
              <span>
                전수 집계
                <span className="block text-xs text-muted-soft">
                  자사 보도처럼 찾은 기사를 모두 담아요. 목표 건수가 없어요.
                </span>
              </span>
              <RuleSwitch
                checked={countAll}
                label="전수 집계"
                onChange={(v) => setDraft((d) => ({ ...d, goal: v ? null : 3 }))}
              />
            </div>
            {!countAll && (
              <label className="flex items-center justify-between gap-3">
                최소 건수
                <span className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    value={draft.goal ?? 0}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        goal: Math.min(
                          100,
                          Math.max(0, Math.round(Number(e.target.value) || 0))
                        ),
                      }))
                    }
                    aria-label="최소 건수"
                    className="h-8 w-20"
                  />
                  건
                </span>
              </label>
            )}
          </div>
          <label className="flex items-center justify-between gap-3 text-[13px] text-muted">
            <span>
              리포트 최대 건수 (선택)
              <span className="block text-xs text-muted-soft">
                넘는 기사는 관련도 낮은 순으로 체크가 해제돼요. 비우면 제한이 없어요.
              </span>
            </span>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={draft.maxItems ?? ""}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  maxItems: e.target.value
                    ? Math.min(100, Math.max(1, Math.round(Number(e.target.value) || 1)))
                    : null,
                }))
              }
              placeholder="제한 없음"
              aria-label="리포트 최대 건수"
              className="h-8 w-24"
            />
          </label>
          <div className="flex flex-col gap-1.5 text-[13px] text-muted">
            세부 분류 (선택)
            <TagsEditor
              align="start"
              value={draft.subs ?? []}
              label="세부 분류"
              onChange={(subs) => setDraft((d) => ({ ...d, subs: subs.slice(0, 12) }))}
            />
            <span className="text-xs text-muted-soft">
              리포트에서 이 순서대로 묶어 보여 줘요. 예: 여행업계, 항공업계
            </span>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="submit" form="category-form" disabled={!canSave}>
            {isNew ? "추가" : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const CategoryEditor = ({
  categories,
  onSave,
  saving,
}: {
  categories: MonitorCategory[];
  onSave: (
    next: MonitorCategory[],
    message?: string,
    undo?: MonitorCategory[],
    onSaved?: () => void
  ) => void;
  saving: boolean;
}) => {
  // 목록에서 고친 최소 건수는 저장을 누를 때까지 여기에만 둔다.
  const [goals, setGoals] = useState<Record<string, string>>({});
  const dirty = categories.filter((c) => c.key in goals);
  const setGoal = (category: MonitorCategory, raw: string) =>
    setGoals((current) => {
      const next = { ...current, [category.key]: raw };
      if (parseGoal(raw) === category.goal) delete next[category.key];
      return next;
    });
  const clearGoal = (key: string) =>
    setGoals((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  const [dialog, setDialog] = useState<{
    open: boolean;
    category: MonitorCategory | null;
    key: number;
  }>({ open: false, category: null, key: 0 });

  const openDialog = (category: MonitorCategory | null) =>
    setDialog((d) => ({ open: true, category, key: d.key + 1 }));
  const save = (category: MonitorCategory) => {
    clearGoal(category.key);
    const exists = categories.some((c) => c.key === category.key);
    onSave(
      exists
        ? categories.map((c) => (c.key === category.key ? category : c))
        : [...categories, category],
      exists ? "카테고리를 고쳤어요." : "카테고리를 추가했어요."
    );
  };
  const move = (index: number, delta: number) => {
    const next = [...categories];
    const [c] = next.splice(index, 1);
    next.splice(index + delta, 0, c);
    onSave(next);
  };
  const remove = (category: MonitorCategory) => {
    if (categories.length <= 1) {
      toast.error("카테고리는 하나 이상 있어야 해요.");
      return;
    }
    onSave(
      categories.filter((c) => c.key !== category.key),
      `'${category.name}' 카테고리를 지웠어요. 담겨 있던 기사는 '제외한 후보'로 옮겨져요.`,
      categories
    );
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-medium text-ink">카테고리 목표</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            목표보다 적으면 &ldquo;더 찾기&rdquo; 버튼이 나와요. 비워 두면 전수 집계
            섹션이에요. 리포트도 이 순서를 따라요.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={categories.length >= MAX_CATEGORIES}
          onClick={() => openDialog(null)}
        >
          <Plus /> 카테고리 추가
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
        {categories.map((c, i) => (
          <div
            key={c.key}
            data-category-key={c.key}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-t border-hairline/60 py-2.5 pr-2 pl-4 first:border-t-0 sm:gap-3",
              c.key in goals && "bg-primary/5"
            )}
          >
            <div className="min-w-0">
              <p className="text-sm text-ink">{c.name}</p>
              {c.subs?.length || c.maxItems ? (
                <p className="mt-0.5 truncate text-xs text-muted">
                  {[c.maxItems && `최대 ${c.maxItems}건`, ...(c.subs ?? [])]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
            </div>
            <GoalInput
              name={c.name}
              value={goals[c.key] ?? String(c.goal ?? "")}
              onChange={(raw) => setGoal(c, raw)}
            />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${c.name} 카테고리 관리`}
                    className="text-muted"
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => openDialog(c)}>
                  <Pencil /> 수정
                </DropdownMenuItem>
                <DropdownMenuItem disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp /> 위로
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={i === categories.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown /> 아래로
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => remove(c)}>
                  <Trash2 /> 삭제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
      <SaveBar
        count={dirty.length}
        saving={saving}
        onCancel={() => setGoals({})}
        onSave={() =>
          onSave(
            categories.map((c) =>
              c.key in goals ? { ...c, goal: parseGoal(goals[c.key]) } : c
            ),
            "카테고리 목표를 저장했어요.",
            undefined,
            () => setGoals({})
          )
        }
      />
      <CategoryDialog
        key={dialog.key}
        open={dialog.open}
        category={dialog.category}
        existingNames={categories.map((c) => c.name)}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        onSave={save}
      />
    </section>
  );
};
