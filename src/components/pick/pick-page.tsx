"use client";

import {
  Check,
  Dices,
  History,
  PencilLine,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { parseAsInteger, useQueryState } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";
import useLocalStorageState from "use-local-storage-state";

import { useConfirmDialog } from "@/components/confirm-dialog";
import {
  restingRotation,
  RouletteWheel,
  spinRotation,
} from "@/components/pick/roulette-wheel";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { kst } from "@/lib/kst";
import { usePick, usePickHistory, usePickMutations } from "@/lib/picks/queries";
import {
  MAX_PICK_LABEL,
  MAX_PICK_OPTIONS,
  MAX_PICK_TITLE,
  MIN_PICK_OPTIONS,
  type PickView,
  uniqueLabels,
} from "@/lib/picks/types";
import { cn } from "@/lib/utils";

interface Draft {
  title: string;
  labels: string[];
}

const EMPTY_DRAFT: Draft = { title: "", labels: [] };

/** 지금 화면에서 돌린 결과. 다른 폰에서 바뀐 결과는 애니메이션 없이 바로 보여 준다. */
interface Spin {
  pickId: number;
  resultOptionId: number;
  rotation: number;
  spinning: boolean;
}

/**
 * 보고 있는 뽑기는 `?pick=`으로 주소에 남긴다. 새로고침하거나 링크를 다른 폰에서 열어도
 * 서버에 저장된 같은 결과가 보인다.
 */
const parseAsPickId = parseAsInteger.withOptions({ history: "push" });

const resultIndex = (pick: PickView) =>
  Math.max(
    0,
    pick.options.findIndex((o) => o.id === pick.resultOptionId)
  );

const resultLabel = (pick: PickView) =>
  pick.options.find((o) => o.id === pick.resultOptionId)?.label ?? "";

const whenLabel = (iso: string) => {
  const at = kst(iso);
  if (at.isSame(kst(), "day")) return `오늘 ${at.format("HH:mm")}`;
  return at.format(at.isSame(kst(), "year") ? "M.D (dd) HH:mm" : "YY.M.D HH:mm");
};

/** 붙여 넣은 글을 줄바꿈·쉼표로 나눠 후보 여러 개로 만든다. */
const splitLabels = (text: string) => text.split(/[\n,]/);

const OptionEditor = ({
  draft,
  setDraft,
  disabled,
}: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
  disabled: boolean;
}) => {
  const [input, setInput] = useState("");
  const full = draft.labels.length >= MAX_PICK_OPTIONS;

  /** 후보를 넣고 입력칸에는 `rest`(쉼표 뒤에 이어 쓰던 글)만 남긴다. */
  const add = (raw: string[], rest = "") => {
    const merged = uniqueLabels([...draft.labels, ...raw]);
    if (merged.length > MAX_PICK_OPTIONS) {
      toast.error(`후보는 ${MAX_PICK_OPTIONS}개까지 넣을 수 있어요.`);
    }
    setDraft({ ...draft, labels: merged.slice(0, MAX_PICK_OPTIONS) });
    setInput(rest.trimStart());
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-hairline bg-canvas-soft p-4 md:p-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-body">고민 (안 써도 돼요)</span>
        <Input
          value={draft.title}
          maxLength={MAX_PICK_TITLE}
          disabled={disabled}
          placeholder="오늘 저녁 뭐 먹지?"
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-medium text-body">후보</span>
          <span className="text-xs text-muted" aria-live="polite">
            {draft.labels.length}/{MAX_PICK_OPTIONS}
          </span>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) add(splitLabels(input));
          }}
        >
          <Input
            aria-label="후보 입력"
            value={input}
            maxLength={MAX_PICK_LABEL}
            disabled={disabled || full}
            placeholder={full ? "후보가 꽉 찼어요" : "후보를 쓰고 Enter (쉼표로 여러 개)"}
            onChange={(e) => {
              // 쉼표를 치면 그 앞까지를 후보로 넣는다. 한글 조합 중에 친 쉼표도 여기서 잡힌다.
              const value = e.target.value;
              if (!value.includes(",")) return setInput(value);
              const parts = value.split(",");
              add(parts.slice(0, -1), parts.at(-1) ?? "");
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (!/[\n,]/.test(text)) return;
              e.preventDefault();
              add(splitLabels(text));
            }}
            onKeyDown={(e) => {
              // 한글 조합 중 Enter는 글자를 확정하는 키라서 후보로 넣지 않는다.
              if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault();
            }}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={disabled || full || !input.trim()}
            aria-label="후보 추가"
          >
            <Plus />
            추가
          </Button>
        </form>
      </div>

      {draft.labels.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="넣은 후보">
          {draft.labels.map((label) => (
            <li
              key={label}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-canvas-card py-1 pr-1 pl-3 text-[13px] text-ink ring-1 ring-hairline"
            >
              <span className="truncate">{label}</span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`${label} 빼기`}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted hover:bg-canvas-strong hover:text-ink disabled:opacity-50"
                onClick={() =>
                  setDraft({ ...draft, labels: draft.labels.filter((l) => l !== label) })
                }
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">
          먹고 싶은 메뉴, 가고 싶은 곳, 하고 싶은 걸 적어 주세요. 하나를 무작위로 골라
          줘요.
        </p>
      )}

      {(draft.labels.length > 0 || draft.title) && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start text-muted"
          disabled={disabled}
          onClick={() => setDraft(EMPTY_DRAFT)}
        >
          <Trash2 />
          모두 지우기
        </Button>
      )}
    </section>
  );
};

const ResultCard = ({
  pick,
  spinning,
  busy,
  onReroll,
  onDecide,
  onEdit,
  onNew,
}: {
  pick: PickView;
  spinning: boolean;
  busy: boolean;
  onReroll: () => void;
  onDecide: () => void;
  onEdit: () => void;
  onNew: () => void;
}) => {
  const decided = pick.status === "decided";
  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border border-hairline bg-canvas-soft p-4 md:p-5"
      aria-label="뽑기 결과"
    >
      {pick.title && <p className="text-[13px] text-muted">{pick.title}</p>}
      <div aria-live="polite" className="min-h-[72px]">
        {spinning ? (
          <p className="flex items-center gap-2 py-5 text-lg font-medium text-body">
            <Spinner className="size-4" />
            두구두구…
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="text-[13px] text-muted">
              {decided ? "이걸로 정했어요" : "뽑힌 건"}
            </span>
            <p className="flex items-center gap-2 text-3xl font-semibold break-all text-ink">
              {!decided && <Sparkles className="size-6 shrink-0 text-primary" />}
              {decided && <Check className="size-6 shrink-0 text-success" />}
              <span data-testid="pick-result">{resultLabel(pick)}</span>
            </p>
          </div>
        )}
      </div>

      {!spinning && !decided && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="sm:flex-1" disabled={busy} onClick={onDecide}>
            <Check />
            이걸로 결정
          </Button>
          <Button
            variant="outline"
            className="sm:flex-1"
            disabled={busy || pick.rerollsLeft === 0}
            onClick={onReroll}
          >
            <RotateCcw />
            {pick.rerollsLeft > 0 ? "다시 돌리기 (1번 남음)" : "다시 돌리기 끝"}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-hairline pt-3">
        <Button variant="ghost" size="sm" disabled={spinning} onClick={onEdit}>
          <PencilLine />
          후보 고쳐서 다시
        </Button>
        <Button variant="ghost" size="sm" disabled={spinning} onClick={onNew}>
          <Plus />새 고민
        </Button>
      </div>
    </section>
  );
};

const HistoryList = ({
  picks,
  activeId,
  hiddenId,
  onOpen,
  onDelete,
}: {
  picks: PickView[];
  activeId: number | null;
  /** 돌림판이 아직 도는 뽑기 — 목록에서 결과를 미리 보여 주지 않는다. */
  hiddenId: number | null;
  onOpen: (id: number) => void;
  onDelete: (pick: PickView) => void;
}) => (
  <section className="flex flex-col gap-3">
    <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
      <History className="size-4 text-primary" />
      지난 뽑기
    </h2>
    {picks.length === 0 ? (
      <p className="rounded-2xl border border-dashed border-hairline px-4 py-8 text-center text-[13px] text-muted">
        아직 뽑은 게 없어요.
      </p>
    ) : (
      <ul className="flex flex-col divide-y divide-hairline-soft rounded-2xl border border-hairline">
        {picks.map((pick) => (
          <li
            key={pick.id}
            className={cn(
              "flex items-center gap-2 px-3 py-2.5 first:rounded-t-2xl last:rounded-b-2xl",
              pick.id === activeId && "bg-canvas-card"
            )}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
              onClick={() => onOpen(pick.id)}
            >
              <span className="flex max-w-full items-center gap-2">
                <span className="truncate text-[15px] font-medium text-ink">
                  {pick.id === hiddenId ? "두구두구…" : resultLabel(pick)}
                </span>
                {pick.status === "decided" && <Badge variant="secondary">결정</Badge>}
              </span>
              <span className="max-w-full truncate text-xs text-muted">
                {pick.title || "제목 없는 고민"} · 후보 {pick.options.length}개 ·{" "}
                {whenLabel(pick.createdAt)}
              </span>
            </button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`${pick.title || resultLabel(pick)} 기록 지우기`}
              className="text-muted"
              onClick={() => onDelete(pick)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
    )}
  </section>
);

export const PickPage = () => {
  const [pickId, setPickId] = useQueryState("pick", parseAsPickId);
  const [draft, setDraft] = useLocalStorageState<Draft>("pick-draft", {
    defaultValue: EMPTY_DRAFT,
  });
  const [spin, setSpin] = useState<Spin | null>(null);
  const { data: pick, isLoading: pickLoading, error: pickError } = usePick(pickId);
  const { data: history } = usePickHistory();
  const { create, reroll, decide, remove } = usePickMutations();
  const { confirm, dialog } = useConfirmDialog();

  const showingPick = pickId !== null && pick?.id === pickId ? pick : null;
  const spinMatches =
    showingPick !== null &&
    spin?.pickId === showingPick.id &&
    spin.resultOptionId === showingPick.resultOptionId;
  const spinning = spinMatches && spin.spinning;
  const rotation = showingPick
    ? spinMatches
      ? spin.rotation
      : restingRotation(resultIndex(showingPick), showingPick.options.length)
    : (spin?.rotation ?? 0);
  const wheelLabels = showingPick
    ? showingPick.options.map((o) => o.label)
    : uniqueLabels(draft.labels);
  const canSpin = wheelLabels.length >= MIN_PICK_OPTIONS && !create.isPending;

  const startSpin = (result: PickView) => {
    setSpin({
      pickId: result.id,
      resultOptionId: result.resultOptionId,
      rotation: spinRotation(rotation, resultIndex(result), result.options.length),
      spinning: true,
    });
  };

  const onSpin = () =>
    create.mutate(
      { title: draft.title, options: draft.labels },
      {
        onSuccess: (result) => {
          startSpin(result);
          void setPickId(result.id);
        },
      }
    );

  const onDelete = async (target: PickView) => {
    const ok = await confirm({
      title: "기록을 지울까요?",
      description: `${target.title || "제목 없는 고민"} → ${resultLabel(target)}`,
      confirmLabel: "지우기",
      destructive: true,
    });
    if (!ok) return;
    remove.mutate(target.id, {
      onSuccess: () => {
        if (target.id === pickId) void setPickId(null);
      },
    });
  };

  return (
    <SidebarLayout activeNav="pick">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 pt-5 pb-10 md:px-8 md:pt-8">
        <header className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
            <Dices className="size-5 text-primary" />
            골라 줘
          </h1>
          <p className="text-[13px] text-muted">
            후보를 넣고 돌리면 하나를 무작위로 골라 줘요. 결과가 마음에 안 들면 한 번만
            다시 돌릴 수 있어요.
          </p>
        </header>

        <div className="grid gap-5 md:grid-cols-2 md:items-start">
          <div className="flex flex-col items-center gap-4 md:order-2">
            <RouletteWheel
              labels={wheelLabels}
              rotation={rotation}
              spinning={spinning}
              highlightIndex={showingPick && !spinning ? resultIndex(showingPick) : null}
              onSpinEnd={() => setSpin((s) => s && { ...s, spinning: false })}
            />
            {!showingPick && (
              <Button
                size="lg"
                className="w-full max-w-[320px]"
                disabled={!canSpin || pickId !== null}
                onClick={onSpin}
              >
                {create.isPending ? <Spinner /> : <Dices />}
                돌리기
              </Button>
            )}
          </div>

          <div className="md:order-1">
            {pickId !== null && !showingPick ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-hairline px-4 py-10 text-center text-[13px] text-muted">
                {pickLoading ? (
                  <Spinner />
                ) : (
                  <>
                    <p>{pickError?.message ?? "뽑기를 찾지 못했어요."}</p>
                    <Button variant="outline" size="sm" onClick={() => setPickId(null)}>
                      새로 뽑기
                    </Button>
                  </>
                )}
              </div>
            ) : showingPick ? (
              <ResultCard
                pick={showingPick}
                spinning={spinning}
                busy={reroll.isPending || decide.isPending}
                onReroll={() => reroll.mutate(showingPick.id, { onSuccess: startSpin })}
                onDecide={() => decide.mutate(showingPick.id)}
                onEdit={() => {
                  setDraft({
                    title: showingPick.title,
                    labels: showingPick.options.map((o) => o.label),
                  });
                  void setPickId(null);
                }}
                onNew={() => {
                  setDraft(EMPTY_DRAFT);
                  void setPickId(null);
                }}
              />
            ) : (
              <OptionEditor
                draft={draft}
                setDraft={setDraft}
                disabled={create.isPending}
              />
            )}
          </div>
        </div>

        <HistoryList
          picks={history ?? []}
          activeId={pickId}
          hiddenId={spinning ? pickId : null}
          onOpen={(id) => {
            setSpin(null);
            void setPickId(id);
          }}
          onDelete={onDelete}
        />
      </main>
      {dialog}
    </SidebarLayout>
  );
};
