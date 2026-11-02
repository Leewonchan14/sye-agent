"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuthStore } from "@/lib/auth-store";
import type {
  LedgerAssetKind,
  LedgerCategoryInput,
  LedgerEntryKind,
  LedgerMonthPayload,
} from "@/lib/db/ledger";
import { formatWon } from "@/lib/ledger/members";

const ASSET_KIND_LABEL: Record<LedgerAssetKind, string> = {
  cash: "현금",
  bank: "계좌",
  card: "카드",
};

const ASSET_KIND_OPTIONS: { value: LedgerAssetKind; label: string }[] = [
  { value: "cash", label: "현금" },
  { value: "bank", label: "계좌" },
  { value: "card", label: "카드" },
];

const TABS = [
  { id: "budget", label: "예산" },
  { id: "categories", label: "분류" },
  { id: "assets", label: "자산" },
] as const;

type SettingsTab = (typeof TABS)[number]["id"];

const numberDisplay = (digits: string) =>
  digits ? Number(digits).toLocaleString("ko-KR") : "";

const cleanDigits = (value: string) => value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

const readError = async (res: Response) => {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? "요청을 처리하지 못했어요.";
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledger: LedgerMonthPayload;
}

export const SettingsDialog = ({ open, onOpenChange, ledger }: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>예산·설정</DialogTitle>
        <DialogDescription>예산과 분류, 결제수단을 함께 관리해요.</DialogDescription>
      </DialogHeader>
      <SettingsBody ledger={ledger} />
    </DialogContent>
  </Dialog>
);

const SettingsBody = ({ ledger }: { ledger: LedgerMonthPayload }) => {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<SettingsTab>("budget");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["ledger"] });

  const [totalBudget, setTotalBudget] = useState(
    ledger.budget.totalBudget == null ? "" : String(ledger.budget.totalBudget)
  );
  const [note, setNote] = useState(ledger.budget.note);
  const [categoryAmounts, setCategoryAmounts] = useState<Record<string, string>>(() => {
    const saved = new Map(
      ledger.budget.byCategory.map((row) => [row.categoryId, row.amount])
    );
    return Object.fromEntries(
      ledger.categories
        .filter((category) => category.kind === "expense")
        .map((category) => [String(category.id), String(saved.get(category.id) ?? "")])
    );
  });

  const allocatedCategoryBudget = ledger.categories
    .filter((category) => category.kind === "expense")
    .reduce(
      (sum, category) => sum + Number(categoryAmounts[String(category.id)] || 0),
      0
    );
  const totalBudgetNumber = totalBudget ? Number(totalBudget) : null;

  const saveBudget = useMutation({
    mutationFn: async () => {
      const body = {
        month: ledger.month,
        totalBudget: totalBudget ? Number(totalBudget) : null,
        note,
        categories: ledger.categories
          .filter((category) => category.kind === "expense")
          .map((category) => ({
            categoryId: category.id,
            amount: Number(categoryAmounts[String(category.id)] || 0),
          }))
          .filter((row) => row.amount > 0),
      };
      const res = await fetch("/api/ledger/budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-auth-token": token },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res));
    },
    onSuccess: () => {
      toast.success("예산을 저장했어요.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [categoryDraft, setCategoryDraft] = useState<
    Record<LedgerEntryKind, { name: string; emoji: string }>
  >({
    expense: { name: "", emoji: "" },
    income: { name: "", emoji: "" },
  });

  const createCategory = useMutation({
    mutationFn: async (input: LedgerCategoryInput) => {
      const res = await fetch("/api/ledger/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": token },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await readError(res));
    },
    onSuccess: (_data, input) => {
      toast.success("분류를 추가했어요.");
      setCategoryDraft((prev) => ({
        ...prev,
        [input.kind]: { name: "", emoji: "" },
      }));
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch("/api/ledger/categories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-auth-token": token },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(await readError(res));
    },
    onSuccess: () => {
      toast.success("분류를 삭제했어요.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [assetDraft, setAssetDraft] = useState<{ name: string; kind: LedgerAssetKind }>({
    name: "",
    kind: "card",
  });

  const createAsset = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ledger/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": token },
        body: JSON.stringify(assetDraft),
      });
      if (!res.ok) throw new Error(await readError(res));
    },
    onSuccess: () => {
      toast.success("자산을 추가했어요.");
      setAssetDraft({ name: "", kind: "card" });
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteAsset = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch("/api/ledger/assets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-auth-token": token },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(await readError(res));
    },
    onSuccess: () => {
      toast.success("자산을 삭제했어요.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addCategory = (kind: LedgerEntryKind) => {
    const draft = categoryDraft[kind];
    if (!draft.name.trim()) return;
    createCategory.mutate({
      name: draft.name,
      kind,
      emoji: draft.emoji.trim() || undefined,
    });
  };

  const categorySections: { kind: LedgerEntryKind; label: string }[] = [
    { kind: "expense", label: "지출" },
    { kind: "income", label: "수입" },
  ];

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-full bg-canvas-soft p-1">
        {TABS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={tab === option.id}
            onClick={() => setTab(option.id)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
              tab === option.id
                ? "bg-surface text-ink ring-1 ring-hairline"
                : "text-muted hover:text-body"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {tab === "budget" && (
        <div className="space-y-4">
          <div>
            <label
              className="text-[12px] font-medium text-muted"
              htmlFor="ledger-total-budget"
            >
              총 예산
            </label>
            <div className="relative mt-1">
              <Input
                id="ledger-total-budget"
                value={numberDisplay(totalBudget)}
                onChange={(event) =>
                  setTotalBudget(cleanDigits(event.target.value).slice(0, 10))
                }
                inputMode="numeric"
                placeholder="0"
                className="pr-8 text-right tabular-nums"
              />
              <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px] text-muted">
                원
              </span>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-1">
              <p className="text-[12px] font-medium text-muted">분류별 예산</p>
              <span
                className={`text-[10.5px] tabular-nums ${
                  totalBudgetNumber != null && allocatedCategoryBudget > totalBudgetNumber
                    ? "text-[color:var(--color-error)]"
                    : "text-muted-soft"
                }`}
              >
                {totalBudgetNumber != null && allocatedCategoryBudget > totalBudgetNumber
                  ? `${formatWon(allocatedCategoryBudget - totalBudgetNumber)} 초과 배분`
                  : `분류 합계 ${formatWon(allocatedCategoryBudget)}${
                      totalBudgetNumber != null
                        ? ` · 미배분 ${formatWon(Math.max(totalBudgetNumber - allocatedCategoryBudget, 0))}`
                        : ""
                    }`}
              </span>
            </div>
            <div className="mt-1 divide-y divide-hairline-soft">
              {ledger.categories
                .filter((category) => category.kind === "expense")
                .map((category) => {
                  const spent =
                    ledger.byCategory.find((row) => row.categoryId === category.id)
                      ?.amount ?? 0;
                  const planned = Number(categoryAmounts[String(category.id)] || 0);
                  const remaining = planned - spent;
                  const over = planned > 0 && remaining < 0;
                  const pct = planned > 0 ? Math.min((spent / planned) * 100, 100) : 0;

                  return (
                    <div key={category.id} className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-canvas-soft text-sm">
                          {category.emoji}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] text-body">
                          {category.name}
                        </span>
                        <div className="relative w-28">
                          <Input
                            aria-label={`${category.name} 예산`}
                            value={numberDisplay(
                              categoryAmounts[String(category.id)] ?? ""
                            )}
                            onChange={(event) =>
                              setCategoryAmounts((prev) => ({
                                ...prev,
                                [String(category.id)]: cleanDigits(
                                  event.target.value
                                ).slice(0, 10),
                              }))
                            }
                            inputMode="numeric"
                            placeholder="0"
                            className="pr-6 text-right tabular-nums"
                          />
                          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] text-muted">
                            원
                          </span>
                        </div>
                      </div>
                      <div className="mt-1 pr-1 pl-9">
                        <div className="flex items-center justify-between gap-2 text-[10.5px] tabular-nums">
                          <span className="text-muted">지출 {formatWon(spent)}</span>
                          {planned > 0 ? (
                            <span
                              className={
                                over
                                  ? "text-[color:var(--color-error)]"
                                  : "text-muted-soft"
                              }
                            >
                              {over
                                ? `${formatWon(Math.abs(remaining))} 초과`
                                : `${formatWon(remaining)} 남음`}
                            </span>
                          ) : (
                            <span className="text-muted-soft">예산 미설정</span>
                          )}
                        </div>
                        {planned > 0 && (
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-canvas-strong">
                            <div
                              className={`h-full rounded-full ${
                                over ? "bg-[var(--color-error)]" : "bg-primary"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
            {ledger.budget.totalBudget != null && (
              <p className="mt-1 text-[11px] text-muted-soft">
                지금까지 {formatWon(ledger.summary.expense)} 썼어요
              </p>
            )}
          </div>

          <div>
            <label
              className="text-[12px] font-medium text-muted"
              htmlFor="ledger-budget-note"
            >
              이번 달 메모
            </label>
            <Textarea
              id="ledger-budget-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="이번 달 예산 메모"
              className="mt-1 min-h-16"
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={() => saveBudget.mutate()} disabled={saveBudget.isPending}>
              저장
            </Button>
          </div>
        </div>
      )}

      {tab === "categories" && (
        <div className="space-y-5">
          {categorySections.map((section) => {
            const categories = ledger.categories.filter(
              (category) => category.kind === section.kind
            );
            const draft = categoryDraft[section.kind];
            const isLast = categories.length <= 1;

            return (
              <section key={section.kind}>
                <div className="flex items-center justify-between">
                  <h3 className="text-[12px] font-medium text-muted">{section.label}</h3>
                  <span className="text-[11px] text-muted-soft tabular-nums">
                    {categories.length}개
                  </span>
                </div>
                <ul className="mt-1 divide-y divide-hairline-soft">
                  {categories.map((category) => (
                    <li key={category.id} className="flex items-center gap-2 py-1.5">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-canvas-soft text-sm">
                        {category.emoji}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-body">
                        {category.name}
                      </span>
                      <Tooltip>
                        <TooltipTrigger render={<span className="inline-flex" />}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`${category.name} 삭제`}
                            disabled={isLast || deleteCategory.isPending}
                            onClick={() => deleteCategory.mutate(category.id)}
                          >
                            <Trash2 />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {isLast ? "분류는 최소 하나 필요해요" : "분류 삭제"}
                        </TooltipContent>
                      </Tooltip>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-center gap-1.5">
                  <Input
                    value={draft.name}
                    onChange={(event) =>
                      setCategoryDraft((prev) => ({
                        ...prev,
                        [section.kind]: {
                          ...prev[section.kind],
                          name: event.target.value,
                        },
                      }))
                    }
                    placeholder="이름"
                    aria-label={`${section.label} 분류 이름`}
                    className="min-w-0 flex-1"
                  />
                  <Input
                    value={draft.emoji}
                    onChange={(event) =>
                      setCategoryDraft((prev) => ({
                        ...prev,
                        [section.kind]: {
                          ...prev[section.kind],
                          emoji: event.target.value,
                        },
                      }))
                    }
                    placeholder="🍚"
                    aria-label="이모지"
                    maxLength={2}
                    className="w-14 text-center"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => addCategory(section.kind)}
                    disabled={!draft.name.trim() || createCategory.isPending}
                  >
                    추가
                  </Button>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {tab === "assets" && (
        <div className="space-y-3">
          <ul className="divide-y divide-hairline-soft">
            {ledger.assets.map((asset) => (
              <li key={asset.id} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[13px] text-body">
                  {asset.name}
                </span>
                <Badge variant="secondary">{ASSET_KIND_LABEL[asset.kind]}</Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${asset.name} 삭제`}
                  disabled={deleteAsset.isPending}
                  onClick={() => deleteAsset.mutate(asset.id)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
            {!ledger.assets.length && (
              <li className="py-4 text-center text-[12px] text-muted">자산이 없어요</li>
            )}
          </ul>

          <div className="flex items-center gap-1.5">
            <Input
              value={assetDraft.name}
              onChange={(event) =>
                setAssetDraft((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="자산 이름"
              aria-label="자산 이름"
              className="min-w-0 flex-1"
            />
            <Select
              items={ASSET_KIND_OPTIONS}
              value={assetDraft.kind}
              onValueChange={(value) => {
                if (value === "cash" || value === "bank" || value === "card") {
                  setAssetDraft((prev) => ({ ...prev, kind: value }));
                }
              }}
            >
              <SelectTrigger className="w-[104px]" aria-label="자산 종류">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_KIND_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              onClick={() => createAsset.mutate()}
              disabled={!assetDraft.name.trim() || createAsset.isPending}
            >
              추가
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
