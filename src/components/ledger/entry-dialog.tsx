"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { AssetIcon, CategoryIcon } from "@/components/ledger/category-icon";
import type { LedgerEntryView } from "@/components/ledger/entry-list";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/lib/auth-store";
import type { LedgerEntryKind, LedgerMonthPayload } from "@/lib/db/ledger";
import {
  LEDGER_MEMBERS,
  memberTone,
  todayKst,
  type LedgerMember,
} from "@/lib/ledger/members";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledger: LedgerMonthPayload;
  defaultMember: LedgerMember;
  entry: LedgerEntryView | null;
}

const numberDisplay = (digits: string) =>
  digits ? Number(digits).toLocaleString("ko-KR") : "";

const cleanDigits = (value: string) => value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

const readError = async (res: Response) => {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? "요청을 처리하지 못했어요.";
};

export const EntryDialog = ({
  open,
  onOpenChange,
  ledger,
  defaultMember,
  entry,
}: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{entry ? "내역 수정" : "내역 추가"}</DialogTitle>
        <DialogDescription>
          우리 집 가계부에 {entry ? "기록을 고쳐요" : "새 기록을 남겨요"}.
        </DialogDescription>
      </DialogHeader>
      <EntryForm
        ledger={ledger}
        defaultMember={defaultMember}
        entry={entry}
        onOpenChange={onOpenChange}
      />
    </DialogContent>
  </Dialog>
);

const EntryForm = ({
  ledger,
  defaultMember,
  entry,
  onOpenChange,
}: Omit<Props, "open">) => {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<LedgerEntryKind>(entry?.kind ?? "expense");
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [entryDate, setEntryDate] = useState(entry?.entryDate ?? todayKst());
  const [categoryId, setCategoryId] = useState<number | null>(entry?.categoryId ?? null);
  const [assetId, setAssetId] = useState<number | null>(entry?.assetId ?? null);
  const [memo, setMemo] = useState(entry?.memo ?? "");
  const [tags, setTags] = useState(entry?.tags ?? "");
  const [member, setMember] = useState<LedgerMember>(entry?.member ?? defaultMember);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const categories = ledger.categories.filter((category) => category.kind === kind);

  const saveEntry = useMutation({
    mutationFn: async () => {
      const payload = {
        entryDate,
        kind,
        amount: Number(amount),
        categoryId,
        assetId: kind === "expense" ? assetId : null,
        memo: memo.trim(),
        tags: tags.trim(),
        member,
      };
      const res = await fetch("/api/ledger/entries", {
        method: entry ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": token },
        body: JSON.stringify(entry ? { id: entry.id, ...payload } : payload),
      });
      if (!res.ok) throw new Error(await readError(res));
    },
    onSuccess: () => {
      toast.success(entry ? "기록을 수정했어요." : "기록을 저장했어요.");
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeEntry = useMutation({
    mutationFn: async () => {
      if (!entry) return;
      const res = await fetch("/api/ledger/entries", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-auth-token": token },
        body: JSON.stringify({ id: entry.id }),
      });
      if (!res.ok) throw new Error(await readError(res));
    },
    onSuccess: () => {
      toast.success("기록을 지웠어요.");
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isInteger(value) || value < 1 || value > 1_000_000_000) {
      toast.error("금액을 1원 이상 10억 원 이하로 입력해 주세요.");
      return;
    }
    if (!entryDate) {
      toast.error("날짜를 선택해 주세요.");
      return;
    }
    saveEntry.mutate();
  };

  const changeKind = (next: LedgerEntryKind) => {
    if (next === kind) return;
    setKind(next);
    setCategoryId(null);
    if (next === "income") setAssetId(null);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 rounded-full bg-canvas-soft p-1">
        {(
          [
            { id: "expense", label: "지출" },
            { id: "income", label: "수입" },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={kind === option.id}
            onClick={() => changeKind(option.id)}
            className={`rounded-full py-1.5 text-[13px] font-medium transition-colors ${
              kind === option.id
                ? "bg-primary text-primary-foreground"
                : "text-muted hover:text-body"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div>
        <label className="text-[12px] font-medium text-muted" htmlFor="ledger-amount">
          금액
        </label>
        <div className="relative mt-1">
          <Input
            id="ledger-amount"
            value={numberDisplay(amount)}
            onChange={(event) => setAmount(cleanDigits(event.target.value).slice(0, 10))}
            inputMode="numeric"
            placeholder="0"
            autoComplete="off"
            className="h-14 pr-8 text-right text-2xl font-semibold tabular-nums"
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">
            원
          </span>
        </div>
      </div>

      <div>
        <label className="text-[12px] font-medium text-muted" htmlFor="ledger-date">
          날짜
        </label>
        <Input
          id="ledger-date"
          type="date"
          value={entryDate}
          onChange={(event) => setEntryDate(event.target.value)}
          className="mt-1"
        />
      </div>

      <div>
        <p className="text-[12px] font-medium text-muted">분류</p>
        {categories.length ? (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {categories.map((category) => {
              const selected = category.id === categoryId;
              return (
                <button
                  key={category.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setCategoryId(selected ? null : category.id)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                    selected
                      ? "border-primary bg-canvas-card text-ink ring-1 ring-primary"
                      : "border-hairline bg-surface text-body hover:bg-canvas-soft"
                  }`}
                >
                  <CategoryIcon icon={category.icon} color={category.color} size={20} />
                  {category.name}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mt-1 text-[12px] text-muted">
            분류가 없어요. 예산·설정에서 추가해 주세요.
          </p>
        )}
      </div>

      {kind === "expense" && (
        <div>
          <p className="text-[12px] font-medium text-muted">결제수단</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {ledger.assets.map((asset) => {
              const selected = asset.id === assetId;
              return (
                <button
                  key={asset.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setAssetId(selected ? null : asset.id)}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12px] transition-colors ${
                    selected
                      ? "border-primary bg-canvas-card text-ink ring-1 ring-primary"
                      : "border-hairline bg-surface text-body hover:bg-canvas-soft"
                  }`}
                >
                  <AssetIcon kind={asset.kind} size={20} />
                  {asset.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <label className="text-[12px] font-medium text-muted" htmlFor="ledger-memo">
          내용
        </label>
        <Input
          id="ledger-memo"
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          placeholder="예: 성수동 카페"
          maxLength={200}
          className="mt-1"
        />
      </div>

      <div>
        <label className="text-[12px] font-medium text-muted" htmlFor="ledger-tags">
          태그
        </label>
        <Input
          id="ledger-tags"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="쉼표로 구분 (예: 데이트, 생일)"
          maxLength={100}
          className="mt-1"
        />
      </div>

      <div>
        <p className="text-[12px] font-medium text-muted">기록자</p>
        <div className="mt-1 flex gap-1.5">
          {LEDGER_MEMBERS.map((option) => {
            const selected = member === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setMember(option.id)}
                className={`rounded-full px-3 py-1.5 text-[12px] ring-1 transition-colors ${
                  selected
                    ? `${memberTone(option.id)} ring-1`
                    : "text-muted ring-hairline hover:bg-canvas-soft"
                }`}
              >
                {option.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="sticky bottom-0 -mx-4 -mb-4 flex items-center justify-between gap-2 border-t border-hairline bg-popover px-4 py-3">
        {entry && confirmDelete ? (
          <div className="flex w-full items-center gap-2 text-[12px] text-destructive">
            <span className="flex-1">정말 지울까요?</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(false)}
            >
              취소
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => removeEntry.mutate()}
              disabled={removeEntry.isPending}
            >
              지우기
            </Button>
          </div>
        ) : (
          <>
            <div>
              {entry && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  삭제
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                취소
              </Button>
              <Button type="submit" disabled={saveEntry.isPending}>
                저장
              </Button>
            </div>
          </>
        )}
      </div>
    </form>
  );
};
