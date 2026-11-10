"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
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
import { useAuthStore } from "@/lib/auth-store";
import type {
  LedgerEntryKind,
  LedgerMonthPayload,
  LedgerRecurringView,
} from "@/lib/db/ledger";
import type { LedgerRecurringCandidate } from "@/lib/db/ledger-recurring";
import { kst } from "@/lib/kst";
import { ledgerKeys, ledgerRequest } from "@/lib/ledger/client";
import { formatWon, todayKst } from "@/lib/ledger/format";
import { cn } from "@/lib/utils";

const PATH = "/api/ledger/recurring";
const CARD = "rounded-2xl border border-hairline bg-surface p-4";

const useLedgerAction = () => {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  return async (
    method: "POST" | "PATCH" | "DELETE",
    body: unknown,
    success: string
  ): Promise<boolean> => {
    try {
      await ledgerRequest(token, PATH, { method, body });
      toast.success(success);
      await queryClient.invalidateQueries({ queryKey: ledgerKeys.all });
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "저장하지 못했어요.");
      return false;
    }
  };
};

const cleanDigits = (value: string) => value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

const KIND_OPTIONS: { id: LedgerEntryKind; label: string }[] = [
  { id: "expense", label: "지출" },
  { id: "income", label: "입금" },
];

const CategorySelect = ({
  value,
  options,
  onChange,
}: {
  value: number | null;
  options: { id: number; name: string }[];
  onChange: (value: number | null) => void;
}) => {
  const items = [
    { value: "none", label: "분류 없음" },
    ...options.map((option) => ({ value: String(option.id), label: option.name })),
  ];
  return (
    <Select
      items={items}
      value={value == null ? "none" : String(value)}
      onValueChange={(next) =>
        onChange(next == null || next === "none" ? null : Number(next))
      }
    >
      <SelectTrigger className="w-full" aria-label="분류">
        <SelectValue placeholder="분류" />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const RecurringForm = ({ ledger }: { ledger: LedgerMonthPayload }) => {
  const run = useLedgerAction();
  const [kind, setKind] = useState<LedgerEntryKind>("expense");
  const [memo, setMemo] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("");
  const [startDate, setStartDate] = useState(todayKst());
  const [categoryId, setCategoryId] = useState<number | null>(null);

  const categories = ledger.categories.filter((category) => category.kind === kind);
  const ready =
    memo.trim() &&
    Number(amount) > 0 &&
    Number(day) >= 1 &&
    Number(day) <= 31 &&
    startDate;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const saved = await run(
      "POST",
      {
        kind,
        memo: memo.trim(),
        amount: Number(amount),
        dayOfMonth: Number(day),
        startDate,
        categoryId,
      },
      "반복 거래를 추가했어요."
    );
    if (saved) {
      setMemo("");
      setAmount("");
      setDay("");
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="grid grid-cols-2 rounded-full bg-canvas-soft p-1">
        {KIND_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={kind === option.id}
            onClick={() => {
              setKind(option.id);
              setCategoryId(null);
            }}
            className={cn(
              "rounded-full py-1 text-[12px] font-medium transition-colors",
              kind === option.id && "bg-surface text-ink ring-1 ring-hairline",
              kind !== option.id && "text-muted hover:text-ink"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <Input
        aria-label="반복 내용"
        value={memo}
        onChange={(event) => setMemo(event.target.value)}
        placeholder="내용 (예: 넷플릭스)"
        maxLength={200}
      />
      <div className="grid grid-cols-2 gap-2">
        <Input
          aria-label="반복 금액"
          value={amount ? Number(amount).toLocaleString("ko-KR") : ""}
          onChange={(event) => setAmount(cleanDigits(event.target.value).slice(0, 10))}
          inputMode="numeric"
          placeholder="금액"
          className="text-right tabular-nums"
        />
        <Input
          aria-label="매월 반복일"
          value={day}
          onChange={(event) => setDay(cleanDigits(event.target.value).slice(0, 2))}
          inputMode="numeric"
          placeholder="매월 며칠 (1~31)"
          className="text-right tabular-nums"
        />
      </div>
      <Input
        aria-label="반복 시작일"
        type="date"
        value={startDate}
        onChange={(event) => setStartDate(event.target.value)}
      />
      <CategorySelect value={categoryId} options={categories} onChange={setCategoryId} />
      <p className="text-[11px] text-muted">
        시작일부터 오늘까지 지난 날짜가 있으면 그 달 내역도 한꺼번에 만들어져요.
      </p>
      <Button type="submit" className="w-full" disabled={!ready}>
        <Plus /> 반복 거래 추가
      </Button>
    </form>
  );
};

const ruleDetail = (rule: LedgerRecurringView, ledger: LedgerMonthPayload) =>
  [
    `매월 ${rule.dayOfMonth}일`,
    rule.kind === "income" ? "입금" : null,
    rule.categoryId == null
      ? null
      : ledger.categories.find((category) => category.id === rule.categoryId)?.name,
    rule.lastDate && `최근 ${rule.lastDate.replaceAll("-", ".")}`,
  ]
    .filter(Boolean)
    .join(" · ");

/** 매달 같은 날 자동으로 생기는 내역을 관리한다. 내역에서 찾은 추천을 바로 등록할 수 있다. */
export const RecurringTab = ({ ledger }: { ledger: LedgerMonthPayload }) => {
  const token = useAuthStore((s) => s.token);
  const run = useLedgerAction();

  const { data: candidates = [] } = useQuery({
    queryKey: ledgerKeys.recurringCandidates,
    queryFn: async () => {
      const data = await ledgerRequest<{ candidates: LedgerRecurringCandidate[] }>(
        token,
        `${PATH}/candidates`
      );
      return data.candidates;
    },
    enabled: Boolean(token),
  });

  const addCandidate = (candidate: LedgerRecurringCandidate) =>
    run(
      "POST",
      {
        kind: candidate.kind,
        memo: candidate.memo,
        amount: candidate.amount,
        dayOfMonth: candidate.dayOfMonth,
        // 이미 기록한 달을 다시 만들지 않도록 마지막 내역 다음 날부터 시작한다.
        startDate: kst(candidate.lastDate).add(1, "day").format("YYYY-MM-DD"),
        categoryId: candidate.categoryId,
      },
      "반복 거래를 추가했어요."
    );

  return (
    <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 [&>*]:min-w-0">
      <div className={cn(CARD, "space-y-4")}>
        <section>
          <h3 className="text-[12px] font-medium text-muted">등록된 반복 거래</h3>
          {ledger.recurring.length ? (
            <ul className="mt-1 divide-y divide-hairline">
              {ledger.recurring.map((rule) => (
                <li key={rule.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate text-[13px] text-ink",
                        !rule.active && "text-muted line-through"
                      )}
                    >
                      {rule.memo || "반복 거래"}{" "}
                      <span className="tabular-nums">{formatWon(rule.amount)}</span>
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      {ruleDetail(rule, ledger)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      run(
                        "PATCH",
                        { id: rule.id, active: !rule.active },
                        rule.active ? "반복을 껐어요." : "반복을 켰어요."
                      )
                    }
                  >
                    {rule.active ? "끄기" : "켜기"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${rule.memo} 반복 삭제`}
                    onClick={() =>
                      run("DELETE", { id: rule.id }, "반복 거래를 삭제했어요.")
                    }
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[12px] text-muted">
              아직 없어요. 등록하면 매달 그날 내역이 자동으로 생겨요.
            </p>
          )}
        </section>

        {candidates.length > 0 && (
          <section>
            <h3 className="text-[12px] font-medium text-muted">내역에서 찾은 추천</h3>
            <ul className="mt-1 divide-y divide-hairline">
              {candidates.map((candidate) => (
                <li
                  key={`${candidate.memo}-${candidate.amount}`}
                  className="flex items-center gap-2 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-ink">
                      {candidate.memo}{" "}
                      <span className="tabular-nums">{formatWon(candidate.amount)}</span>
                    </p>
                    <p className="text-[11px] text-muted tabular-nums">
                      매월 {candidate.dayOfMonth}일 · 최근{" "}
                      {candidate.lastDate.replaceAll("-", ".")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`${candidate.memo} 반복 등록`}
                    onClick={() => addCandidate(candidate)}
                  >
                    <Plus /> 등록
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <section className={CARD}>
        <h3 className="mb-2 text-[12px] font-medium text-muted">직접 추가</h3>
        <RecurringForm ledger={ledger} />
      </section>
    </div>
  );
};
