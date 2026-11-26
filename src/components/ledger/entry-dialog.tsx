"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CategoryIcon } from "@/components/ledger/category-icon";
import type { LedgerEntryView } from "@/components/ledger/entry-list";
import { MapPlaceCard } from "@/components/ledger/place-photos";
import {
  EntryReviews,
  newReviewDraft,
  type ReviewDraft,
  ReviewFields,
} from "@/components/places/place-reviews";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/lib/auth-store";
import type { LedgerEntryKind, LedgerMonthPayload } from "@/lib/db/ledger";
import type { LedgerSuggestion } from "@/lib/db/ledger-suggestions";
import { ledgerKeys, ledgerRequest } from "@/lib/ledger/client";
import { formatWon, nowTimeKst, todayKst } from "@/lib/ledger/format";
import {
  extractMapUrl,
  isHttpUrl,
  isNaverMapUrl,
  MAX_MAP_URL_LENGTH,
} from "@/lib/ledger/map-url";
import { useEntryReviews, useReviewMutations } from "@/lib/places/client";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledger: LedgerMonthPayload;
  defaultDate: string;
  entry: LedgerEntryView | null;
}

const numberDisplay = (digits: string) =>
  digits ? Number(digits).toLocaleString("ko-KR") : "";

const cleanDigits = (value: string) => value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

const MAX_SUGGESTION_CHIPS = 8;

/** 예매·예약으로 미리 결제한 내용이면 방문일을 바로 펼친다. */
const BOOKING_MEMO_RE = /예매|예약|티켓|입장권|종일권|대실|숙박/;

export const EntryDialog = ({
  open,
  onOpenChange,
  ledger,
  defaultDate,
  entry,
}: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{entry ? "내역 수정" : "내역 추가"}</DialogTitle>
        <DialogDescription>
          모임통장 가계부에 {entry ? "기록을 고쳐요" : "새 기록을 남겨요"}.
        </DialogDescription>
      </DialogHeader>
      <EntryForm
        ledger={ledger}
        defaultDate={defaultDate}
        entry={entry}
        onOpenChange={onOpenChange}
      />
    </DialogContent>
  </Dialog>
);

const EntryForm = ({ ledger, defaultDate, entry, onOpenChange }: Omit<Props, "open">) => {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<LedgerEntryKind>(entry?.kind ?? "expense");
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [entryDate, setEntryDate] = useState(entry?.entryDate ?? defaultDate);
  const [entryTime, setEntryTime] = useState(
    entry ? (entry.entryTime ?? "") : defaultDate === todayKst() ? nowTimeKst() : ""
  );
  const [categoryId, setCategoryId] = useState<number | null>(entry?.categoryId ?? null);
  const [visitDate, setVisitDate] = useState(entry?.visitDate ?? "");
  // 방문일 줄은 기본으로 접어 두고, 예매 메모가 보이면 한 번만 펼친다.
  const [visitOpen, setVisitOpen] = useState(Boolean(entry?.visitDate));
  const [visitCollapsed, setVisitCollapsed] = useState(false);
  const [memo, setMemo] = useState(entry?.memo ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [mapUrl, setMapUrl] = useState(entry?.mapUrl ?? "");
  // 저장된 링크 그대로일 때만 저장해 둔 장소 사진을 보여 준다.
  const savedPlace =
    entry != null &&
    entry.mapUrl !== "" &&
    extractMapUrl(mapUrl) === entry.mapUrl &&
    Boolean(entry.mapImageUrls.length || entry.mapPlaceName);
  /**
   * 리뷰는 내역마다 원찬·예은이 각자 여러 개 남긴다.
   * 지도 링크가 저장된 내역이면 리뷰를 바로 쓰고 고치고, 새 내역이면 하나를 적어 두었다가 내역을 저장한 뒤 남긴다.
   */
  const reviewEntryId = entry?.placeKey ? entry.id : null;
  const { data: entryReviews = entry?.reviews ?? [] } = useEntryReviews(reviewEntryId);
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft>(newReviewDraft);
  const { create: createReview } = useReviewMutations();
  const [tags, setTags] = useState(entry?.tags ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // undefined면 아직 고르지 않은 상태라 날짜로 여행을 추천한다.
  const [tripChoice, setTripChoice] = useState<number | null | undefined>(
    entry ? entry.tripId : undefined
  );

  const tripsOnDate = ledger.trips.filter(
    (trip) => trip.startDate <= entryDate && entryDate <= trip.endDate
  );
  const selectedTripId =
    tripChoice !== undefined
      ? tripChoice
      : tripsOnDate.length === 1
        ? tripsOnDate[0].id
        : null;

  const categories = ledger.categories.filter((category) => category.kind === kind);
  // 메모에 예매·예약이 보이면 방문일 줄을 자동으로 펼친다. 사용자가 접은 뒤에는 다시 열지 않는다.
  const showVisitDate = visitOpen || (BOOKING_MEMO_RE.test(memo) && !visitCollapsed);
  const toggleVisitDate = () => {
    if (showVisitDate) {
      setVisitOpen(false);
      setVisitCollapsed(true);
      return;
    }
    setVisitOpen(true);
    setVisitCollapsed(false);
  };

  // 새 기록을 쓸 때만 자주 쓰는 내역을 칩으로 보여 준다.
  const { data: suggestions = [] } = useQuery({
    queryKey: ledgerKeys.suggestions,
    queryFn: async () =>
      (
        await ledgerRequest<{ suggestions: LedgerSuggestion[] }>(
          token,
          "/api/ledger/suggestions"
        )
      ).suggestions,
    enabled: Boolean(token) && !entry,
  });

  const query = memo.trim().toLowerCase();
  const suggestionChips = entry
    ? []
    : suggestions
        .filter(
          (item) =>
            item.memo !== memo.trim() &&
            (!query || item.memo.toLowerCase().includes(query))
        )
        .slice(0, MAX_SUGGESTION_CHIPS);

  const applySuggestion = (item: LedgerSuggestion) => {
    setKind(item.kind);
    setMemo(item.memo);
    setAmount(String(item.amount));
    setCategoryId(item.categoryId);
  };

  /** 예전에 쓴 내용과 똑같이 입력하면 분류를 채운다. 직접 고른 분류는 덮지 않는다. */
  const changeMemo = (value: string) => {
    setMemo(value);
    if (entry || categoryId != null) return;
    const match = suggestions.find(
      (item) => item.memo === value.trim() && item.kind === kind
    );
    if (match) setCategoryId(match.categoryId);
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ledgerKeys.all });

  const saveEntry = useMutation({
    mutationFn: () => {
      const payload = {
        entryDate,
        entryTime: entryTime || null,
        kind,
        amount: Number(amount),
        categoryId,
        // 예매(결제)일과 실제로 간 날이 다를 때만 채운다. 입금에는 방문일이 없다.
        visitDate: kind === "expense" ? visitDate : "",
        memo: memo.trim(),
        note: note.trim(),
        // 지도 링크는 지출에만 둔다.
        mapUrl: kind === "expense" ? extractMapUrl(mapUrl) : "",
        tags: tags.trim(),
        tripId: kind === "expense" ? selectedTripId : (entry?.tripId ?? null),
      };
      return ledgerRequest<{
        entry: { id: number; kind: string; mapUrl: string };
      }>(token, "/api/ledger/entries", {
        method: entry ? "PATCH" : "POST",
        body: entry ? { id: entry.id, ...payload } : payload,
      });
    },
    onSuccess: async ({ entry: saved }) => {
      toast.success(entry ? "기록을 수정했어요." : "기록을 저장했어요.");
      invalidate();
      onOpenChange(false);
      // 새로 적어 둔 리뷰는 지도 링크가 있는 지출로 저장됐을 때 남긴다.
      if (reviewEntryId || reviewDraft.rating === null) return;
      if (saved.kind !== "expense" || !saved.mapUrl) return;
      try {
        await createReview.mutateAsync({
          entryId: saved.id,
          author: reviewDraft.author,
          rating: reviewDraft.rating,
          review: reviewDraft.review.trim(),
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "리뷰를 남기지 못했어요.");
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const restoreEntry = async (id: number) => {
    try {
      await ledgerRequest(token, "/api/ledger/entries/restore", {
        method: "POST",
        body: { id },
      });
      toast.success("기록을 되돌렸어요.");
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "되돌리지 못했어요.");
    }
  };

  const removeEntry = useMutation({
    mutationFn: async () => {
      if (!entry) return null;
      await ledgerRequest(token, "/api/ledger/entries", {
        method: "DELETE",
        body: { id: entry.id },
      });
      return entry.id;
    },
    onSuccess: (id) => {
      toast.success("기록을 지웠어요.", {
        duration: 8000,
        ...(id == null
          ? {}
          : { action: { label: "되돌리기", onClick: () => void restoreEntry(id) } }),
      });
      invalidate();
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
    if (!reviewEntryId && reviewDraft.rating === null && reviewDraft.review.trim()) {
      toast.error("리뷰를 남기려면 별점도 골라 주세요.");
      return;
    }
    saveEntry.mutate();
  };

  const changeKind = (next: LedgerEntryKind) => {
    if (next === kind) return;
    setKind(next);
    setCategoryId(null);
  };

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="-mx-4 min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        <div className="grid grid-cols-2 rounded-full bg-canvas-soft p-1">
          {(
            [
              { id: "expense", label: "지출" },
              { id: "income", label: "입금" },
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
              onChange={(event) =>
                setAmount(cleanDigits(event.target.value).slice(0, 10))
              }
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

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="min-w-0">
            <label
              className="block text-[12px] font-medium text-muted"
              htmlFor="ledger-date"
            >
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
            <label
              className="block text-[12px] font-medium text-muted"
              htmlFor="ledger-time"
            >
              시각
            </label>
            <Input
              id="ledger-time"
              type="time"
              value={entryTime}
              onChange={(event) => setEntryTime(event.target.value)}
              className="mt-1 w-36"
            />
          </div>
        </div>

        {kind === "expense" && (
          <div>
            <button
              type="button"
              aria-expanded={showVisitDate}
              aria-controls="ledger-visit-date-panel"
              onClick={toggleVisitDate}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "-ml-2 h-7 px-2 text-[12px] font-normal text-muted"
              )}
            >
              예매했어요 (간 날이 달라요)
            </button>
            {showVisitDate && (
              <div
                id="ledger-visit-date-panel"
                className="mt-1 rounded-xl bg-canvas-soft p-3"
              >
                <label
                  className="block text-[12px] font-medium text-muted"
                  htmlFor="ledger-visit-date"
                >
                  방문일
                </label>
                <Input
                  id="ledger-visit-date"
                  type="date"
                  value={visitDate}
                  onChange={(event) => setVisitDate(event.target.value)}
                  className="mt-1"
                />
                <p className="mt-1 text-[11px] text-muted">비우면 결제일과 같아요.</p>
              </div>
            )}
          </div>
        )}

        {kind === "expense" && (
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
                      <CategoryIcon
                        icon={category.icon}
                        color={category.color}
                        size={20}
                      />
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
        )}

        {kind === "expense" && ledger.trips.length > 0 && (
          <div>
            <p className="text-[12px] font-medium text-muted">여행</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {ledger.trips.map((trip) => {
                const selected = trip.id === selectedTripId;
                return (
                  <button
                    key={trip.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setTripChoice(selected ? null : trip.id)}
                    className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                      selected
                        ? "border-primary bg-canvas-card text-ink ring-1 ring-primary"
                        : "border-hairline bg-surface text-body hover:bg-canvas-soft"
                    }`}
                  >
                    {trip.name}
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
            onChange={(event) => changeMemo(event.target.value)}
            placeholder="예: 성수동 카페"
            maxLength={200}
            autoComplete="off"
            className="mt-1"
          />
          {suggestionChips.length > 0 && (
            <div
              className="mt-1.5 flex flex-wrap gap-1"
              role="group"
              aria-label="자주 쓰는 내역"
            >
              {suggestionChips.map((item) => (
                <button
                  key={item.memo}
                  type="button"
                  onClick={() => applySuggestion(item)}
                  className="rounded-md bg-canvas-soft px-2 py-1 text-[11px] text-body transition-colors hover:bg-canvas-card"
                >
                  {item.memo}{" "}
                  <span className="text-muted tabular-nums">
                    {formatWon(item.amount)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {kind === "expense" && (
          <div>
            <label
              className="text-[12px] font-medium text-muted"
              htmlFor="ledger-map-url"
            >
              지도 링크
            </label>
            <div className="mt-1 flex gap-2">
              <Input
                id="ledger-map-url"
                inputMode="url"
                value={mapUrl}
                onChange={(event) => setMapUrl(event.target.value)}
                // 지도 앱의 공유 문구를 통째로 붙여도 링크만 남긴다.
                onBlur={() => setMapUrl(extractMapUrl(mapUrl))}
                onPaste={(event) => {
                  const pasted = event.clipboardData.getData("text");
                  const url = extractMapUrl(pasted);
                  if (url === pasted.trim()) return;
                  event.preventDefault();
                  setMapUrl(url);
                }}
                placeholder="네이버·카카오·구글 지도 공유 링크"
                maxLength={MAX_MAP_URL_LENGTH}
                autoComplete="off"
                className="min-w-0 flex-1"
              />
              {isHttpUrl(mapUrl) && (
                <a
                  href={extractMapUrl(mapUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="지도 열기"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "icon" }),
                    "border-input"
                  )}
                >
                  <ExternalLink />
                </a>
              )}
            </div>
            {entry && savedPlace ? (
              <MapPlaceCard
                url={entry.mapUrl}
                placeName={entry.mapPlaceName}
                imageUrls={entry.mapImageUrls}
              />
            ) : (
              isNaverMapUrl(extractMapUrl(mapUrl)) && (
                <p className="mt-1 text-[11px] text-muted">
                  {entry?.mapUrl === extractMapUrl(mapUrl)
                    ? "네이버 지도에서 장소 사진을 찾지 못했어요. 다시 저장하면 한 번 더 불러와요."
                    : "저장하면 네이버 지도의 장소 사진을 함께 보여 줘요."}
                </p>
              )
            )}
            {reviewEntryId ? (
              <section
                aria-label="리뷰"
                className="mt-2 flex flex-col gap-1.5 rounded-xl bg-canvas-soft p-3"
              >
                <span className="text-[12px] font-medium text-muted">
                  리뷰 · 쓰거나 고치면 바로 저장돼요
                </span>
                <EntryReviews entryId={reviewEntryId} reviews={entryReviews} />
              </section>
            ) : (
              isHttpUrl(extractMapUrl(mapUrl)) && (
                <fieldset
                  aria-label="리뷰"
                  className="mt-2 flex flex-col gap-1.5 rounded-xl bg-canvas-soft p-3"
                >
                  <span className="text-[12px] font-medium text-muted">
                    리뷰 (안 남겨도 돼요)
                  </span>
                  <ReviewFields draft={reviewDraft} onChange={setReviewDraft} />
                </fieldset>
              )
            )}
          </div>
        )}

        <div>
          <label className="text-[12px] font-medium text-muted" htmlFor="ledger-note">
            메모
          </label>
          <Textarea
            id="ledger-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="자세히 남기고 싶은 내용"
            maxLength={2000}
            rows={2}
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
      </div>

      <div className="-mx-4 -mb-4 flex shrink-0 items-center justify-between gap-2 border-t border-hairline bg-popover px-4 py-3">
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
