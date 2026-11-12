"use client";

import { Plus, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PeriodPicker, RuleSwitch } from "@/components/monitor/rule-value-editors";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_PERIOD, formatPeriod, parsePeriod } from "@/lib/monitor/period";
import { useSetupDraft, useSetupMutations } from "@/lib/monitor/queries";
import type { MonitorRule } from "@/lib/monitor/types";
import { cn } from "@/lib/utils";

const STEPS = ["이름", "무엇을 모을지", "언제 모을지"] as const;
const MAX_REQUEST = 400;

interface DraftCategory {
  id: number;
  name: string;
  goal: number | null;
}

let nextId = 1;
const newCategory = (name = "", goal: number | null = null): DraftCategory => ({
  id: nextId++,
  name,
  goal,
});

const buildRules = (
  period: string,
  excludeMedia: string[],
  request: string
): MonitorRule[] => [
  { id: "window", title: "모니터링 기간", quote: "", kind: "period", value: period },
  {
    id: "skip-reported",
    title: "어제 보고한 기사 제외",
    quote: "",
    kind: "toggle",
    value: true,
  },
  ...(excludeMedia.length
    ? [
        {
          id: "exclude-media",
          title: "제외 매체",
          quote: "",
          kind: "tags" as const,
          value: excludeMedia,
        },
      ]
    : []),
  ...(request
    ? [
        {
          id: "request",
          title: "요청 내용",
          quote: "",
          kind: "text" as const,
          value: request,
        },
      ]
    : []),
];

/** 고객사 등록 3단계. 열 때마다 key를 바꿔 처음부터 시작한다. */
export const ClientWizard = ({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: number) => void;
}) => {
  const { createClient, startDraft } = useSetupMutations();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [request, setRequest] = useState("");
  const [categories, setCategories] = useState<DraftCategory[]>(() => [newCategory()]);
  const [excludeMedia, setExcludeMedia] = useState<string[]>([]);
  const [period, setPeriod] = useState(formatPeriod(DEFAULT_PERIOD));
  const [weekdays, setWeekdays] = useState(true);
  const [collectNow, setCollectNow] = useState(true);
  const [draftRunId, setDraftRunId] = useState<string | null>(null);
  const [appliedRunId, setAppliedRunId] = useState<string | null>(null);

  const draft = useSetupDraft(draftRunId);
  const drafting =
    startDraft.isPending ||
    (Boolean(draftRunId) && (!draft.data || draft.data.status === "running"));
  const draftError = draft.data?.status === "failed" ? draft.data.error : null;

  // 초안이 도착하면 한 번만 채운다. 그 뒤에는 사람이 고친 값을 덮지 않는다.
  if (draft.data?.status === "done" && draftRunId && appliedRunId !== draftRunId) {
    setAppliedRunId(draftRunId);
    setCategories(draft.data.draft.categories.map((c) => newCategory(c.name, c.goal)));
    setExcludeMedia(draft.data.draft.excludeMedia);
    if (draft.data.draft.period) setPeriod(draft.data.draft.period);
  }

  const trimmedName = name.trim();
  const filled = categories.filter((c) => c.name.trim());
  const names = filled.map((c) => c.name.trim());
  const duplicate = new Set(names).size !== names.length;
  const canNext = step === 0 ? Boolean(trimmedName) : filled.length > 0 && !duplicate;
  const endTime = parsePeriod(period)?.endTime ?? DEFAULT_PERIOD.endTime;

  const patchCategory = (id: number, patch: Partial<DraftCategory>) =>
    setCategories((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const submit = () =>
    createClient.mutate(
      {
        name: trimmedName,
        categories: filled.map((c, i) => ({
          key: `cat-${i + 1}`,
          name: c.name.trim(),
          goal: c.goal,
        })),
        rules: buildRules(period, excludeMedia, request.trim().slice(0, MAX_REQUEST)),
        weekdaysOnly: weekdays,
        collectNow,
      },
      {
        onSuccess: ({ client, collectError }) => {
          if (collectError)
            toast.error(`등록했지만 수집을 시작하지 못했어요. ${collectError}`);
          else if (collectNow) toast.success("등록했어요. 몇 분 뒤 첫 기사가 쌓여요.");
          else toast.success("등록했어요.");
          onCreated(client.id);
          onOpenChange(false);
        },
      }
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>고객사 추가</DialogTitle>
          <DialogDescription>
            {step + 1}/3 · {STEPS[step]}
          </DialogDescription>
          <div className="mt-1 grid grid-cols-3 gap-1.5" aria-hidden>
            {STEPS.map((label, i) => (
              <span
                key={label}
                className={cn("h-1 rounded-full bg-muted", i <= step && "bg-primary")}
              />
            ))}
          </div>
        </DialogHeader>

        <form
          id="client-wizard"
          className="flex min-w-0 flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (step < 2) {
              if (canNext) setStep(step + 1);
            } else if (!createClient.isPending) submit();
          }}
        >
          {step === 0 && (
            <label className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
              고객사 이름
              <Input
                autoFocus
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 예시 브랜드"
              />
            </label>
          )}

          {step === 1 && (
            <>
              <label className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
                평소 모니터링을 맡길 때 하던 요청 (선택)
                <Textarea
                  rows={3}
                  maxLength={MAX_REQUEST}
                  value={request}
                  onChange={(e) => setRequest(e.target.value)}
                  placeholder="예: 전일 오전 9시부터 지금까지 게재된 기사를 카테고리별로 찾아줘"
                />
                <span className="text-xs text-muted-foreground">
                  적어 두면 수집할 때마다 에이전트가 이 요청을 함께 읽어요.
                </span>
              </label>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!request.trim() || drafting}
                  onClick={() =>
                    startDraft.mutate(
                      { name: trimmedName, request: request.trim() },
                      { onSuccess: ({ draftId }) => setDraftRunId(draftId) }
                    )
                  }
                >
                  {drafting ? <Spinner className="size-3.5" /> : <Sparkles />}
                  {drafting ? "AI가 초안을 만드는 중" : "AI로 초안 받기"}
                </Button>
                {draftError && (
                  <p className="mt-1.5 text-xs text-destructive">{draftError}</p>
                )}
              </div>

              <div className="flex flex-col gap-2 text-[13px] text-muted-foreground">
                기사를 나눌 카테고리
                {categories.map((c) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <Input
                      value={c.name}
                      maxLength={60}
                      onChange={(e) => patchCategory(c.id, { name: e.target.value })}
                      placeholder="예: 자사 뉴스"
                      aria-label="카테고리 이름"
                      className="min-w-0 flex-1"
                    />
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100}
                      value={c.goal ?? ""}
                      onChange={(e) =>
                        patchCategory(c.id, {
                          goal: e.target.value
                            ? Math.min(
                                100,
                                Math.max(0, Math.round(Number(e.target.value) || 0))
                              )
                            : null,
                        })
                      }
                      placeholder="전부"
                      aria-label={`${c.name || "카테고리"} 최소 건수`}
                      className="w-20"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${c.name || "카테고리"} 삭제`}
                      disabled={categories.length === 1}
                      onClick={() =>
                        setCategories((list) => list.filter((x) => x.id !== c.id))
                      }
                    >
                      <X />
                    </Button>
                  </div>
                ))}
                {duplicate && (
                  <span className="text-xs text-destructive">
                    같은 이름의 카테고리가 있어요.
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  오른쪽 칸은 최소 건수예요. 비우면 찾은 기사를 모두 담아요.
                </span>
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={categories.length >= 12}
                    onClick={() => setCategories((list) => [...list, newCategory()])}
                  >
                    <Plus /> 카테고리 추가
                  </Button>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
                기사를 모을 기간
                <PeriodPicker
                  value={period}
                  label="기사를 모을 기간"
                  onChange={setPeriod}
                  className="w-full"
                />
                <span className="text-xs text-muted-foreground">
                  매일 {endTime}에 이 기간의 기사를 모아요. 시각은 등록 후 바꿀 수 있어요.
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 text-[13px] text-muted-foreground">
                <span>
                  평일만 수집
                  <span className="block text-xs text-muted-foreground">
                    토·일은 쉬고, 월요일에 금요일부터 모아요.
                  </span>
                </span>
                <RuleSwitch
                  checked={weekdays}
                  label="평일만 수집"
                  onChange={setWeekdays}
                />
              </div>
              <div className="flex items-center justify-between gap-4 text-[13px] text-muted-foreground">
                <span>
                  등록하고 바로 한 번 수집
                  <span className="block text-xs text-muted-foreground">
                    몇 분 뒤 첫 결과를 볼 수 있어요.
                  </span>
                </span>
                <RuleSwitch
                  checked={collectNow}
                  label="등록하고 바로 한 번 수집"
                  onChange={setCollectNow}
                />
              </div>
            </>
          )}
        </form>

        <DialogFooter>
          {step > 0 && (
            <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}>
              이전
            </Button>
          )}
          <Button
            type="submit"
            form="client-wizard"
            disabled={step < 2 ? !canNext : createClient.isPending}
          >
            {step < 2 ? "다음" : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
