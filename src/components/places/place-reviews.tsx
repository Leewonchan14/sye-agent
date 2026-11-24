"use client";

import { Pencil, Plus, Star, StarHalf } from "lucide-react";
import { toast } from "sonner";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { kst } from "@/lib/kst";
import { useReviewMutations } from "@/lib/places/client";
import {
  MAX_RATING,
  MAX_REVIEW_LENGTH,
  type PlaceRatingSummary,
  type PlaceReview,
  RATING_STEP,
  REVIEW_AUTHOR_LABEL,
  REVIEW_AUTHORS,
  type ReviewAuthor,
} from "@/lib/places/types";
import { cn } from "@/lib/utils";

const STARS = Array.from({ length: MAX_RATING }, (_, index) => index + 1);

/* ───────── 별 ───────── */

type StarFill = "full" | "half" | "empty";

/** `star`번째 별을 얼마나 채울지. 0.5 단위 별점이라 반 개까지 있다. */
const starFill = (rating: number, star: number): StarFill =>
  rating >= star ? "full" : rating >= star - 0.5 ? "half" : "empty";

/** 별 하나 — 빈 별 위에 꽉 찬 별이나 왼쪽 반 별을 겹친다. */
const StarIcon = ({ fill, className }: { fill: StarFill; className?: string }) => (
  <span aria-hidden className="relative inline-flex">
    <Star className={cn("text-primary-disabled", className)} />
    {fill === "full" && (
      <Star className={cn("absolute inset-0 fill-current", className)} />
    )}
    {fill === "half" && (
      <StarHalf className={cn("absolute inset-0 fill-current", className)} />
    )}
  </span>
);

/** 읽기 전용 별 — 리뷰 줄에 작게 붙인다. */
export const RatingStars = ({
  rating,
  className,
}: {
  rating: number;
  className?: string;
}) => (
  <span
    role="img"
    aria-label={`별 ${rating}개`}
    className={cn("inline-flex shrink-0 items-center gap-px text-primary", className)}
  >
    {STARS.map((star) => (
      <StarIcon key={star} fill={starFill(rating, star)} className="size-3" />
    ))}
  </span>
);

/** 장소 별점 평균 — "★ 4.5 · 리뷰 3" */
export const RatingSummary = ({
  rating,
  className,
}: {
  rating: PlaceRatingSummary;
  className?: string;
}) => (
  <span
    role="img"
    aria-label={`별점 평균 ${rating.average}, 리뷰 ${rating.count}개`}
    className={cn(
      "inline-flex shrink-0 items-center gap-1 text-[12px] text-body tabular-nums",
      className
    )}
  >
    <Star aria-hidden className="size-3.5 fill-current text-primary" />
    <span className="font-medium text-ink">{rating.average.toFixed(1)}</span>
    <span className="text-muted">· 리뷰 {rating.count}</span>
  </span>
);

/**
 * 별 0.5~5 고르기. 별 하나를 왼쪽 반(0.5)·오른쪽 반(1)으로 나눈 라디오라
 * 방향키로도 반 개씩 움직인다. 다른 폼 안에 있어도 Enter가 그 폼을 보내지 않고 `onEnter`를 부른다.
 */
export const StarPicker = ({
  value,
  onChange,
  onEnter,
}: {
  value: number | null;
  onChange: (value: number) => void;
  onEnter?: () => void;
}) => {
  const name = useId();
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;
  return (
    <div
      role="radiogroup"
      aria-label="별점"
      className="flex items-center gap-2"
      onMouseLeave={() => setHover(null)}
    >
      <div className="flex items-center">
        {STARS.map((star) => (
          <span
            key={star}
            className="relative rounded-md p-1 text-primary has-focus-visible:ring-2 has-focus-visible:ring-ring"
          >
            <StarIcon
              fill={shown === null ? "empty" : starFill(shown, star)}
              className="size-7"
            />
            {[star - RATING_STEP, star].map((option, index) => (
              <input
                key={option}
                type="radio"
                name={name}
                value={option}
                aria-label={`별 ${option}개`}
                checked={value === option}
                onChange={() => onChange(option)}
                onMouseEnter={() => setHover(option)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  onEnter?.();
                }}
                className={cn(
                  "absolute inset-y-0 m-0 w-1/2 cursor-pointer appearance-none opacity-0",
                  index === 0 && "left-0",
                  index === 1 && "right-0"
                )}
              />
            ))}
          </span>
        ))}
      </div>
      <span aria-hidden className="w-7 text-[13px] font-medium text-ink tabular-nums">
        {shown?.toFixed(1)}
      </span>
    </div>
  );
};

/* ───────── 쓴 사람 ───────── */

const AUTHOR_STORAGE_KEY = "place-review-author";

/** 마지막으로 고른 사람을 이 브라우저에 기억한다. 저장소를 못 쓰면 원찬으로 시작한다. */
const readLastAuthor = (): ReviewAuthor => {
  try {
    const saved = localStorage.getItem(AUTHOR_STORAGE_KEY);
    return REVIEW_AUTHORS.includes(saved as ReviewAuthor)
      ? (saved as ReviewAuthor)
      : "wonchan";
  } catch {
    return "wonchan";
  }
};

const rememberAuthor = (author: ReviewAuthor) => {
  try {
    localStorage.setItem(AUTHOR_STORAGE_KEY, author);
  } catch {
    // 저장하지 못해도 이번 리뷰는 남긴다.
  }
};

export const AuthorPicker = ({
  value,
  onChange,
}: {
  value: ReviewAuthor;
  onChange: (value: ReviewAuthor) => void;
}) => (
  <div role="group" aria-label="쓴 사람" className="flex gap-1">
    {REVIEW_AUTHORS.map((author) => (
      <button
        key={author}
        type="button"
        aria-pressed={value === author}
        onClick={() => onChange(author)}
        className={cn(
          "rounded-full px-2.5 py-0.5 text-[12px] text-body ring-1 ring-hairline transition-colors hover:bg-canvas-soft",
          value === author && "bg-ink text-canvas ring-ink hover:bg-ink"
        )}
      >
        {REVIEW_AUTHOR_LABEL[author]}
      </button>
    ))}
  </div>
);

/* ───────── 쓰기 ───────── */

export interface ReviewDraft {
  author: ReviewAuthor;
  rating: number | null;
  review: string;
}

export const newReviewDraft = (): ReviewDraft => ({
  author: readLastAuthor(),
  rating: null,
  review: "",
});

/** 쓴 사람·별·한 줄 리뷰 입력칸. 저장은 부르는 쪽이 한다. */
export const ReviewFields = ({
  draft,
  onChange,
  onEnter,
}: {
  draft: ReviewDraft;
  onChange: (draft: ReviewDraft) => void;
  onEnter?: () => void;
}) => (
  <>
    <AuthorPicker
      value={draft.author}
      onChange={(author) => {
        rememberAuthor(author);
        onChange({ ...draft, author });
      }}
    />
    <StarPicker
      value={draft.rating}
      onChange={(rating) => onChange({ ...draft, rating })}
      onEnter={onEnter}
    />
    <Input
      aria-label="한 줄 리뷰"
      placeholder="한 줄 리뷰 (안 써도 돼요)"
      maxLength={MAX_REVIEW_LENGTH}
      value={draft.review}
      onChange={(event) => onChange({ ...draft, review: event.target.value })}
      onKeyDown={(event) => {
        // 가계부 내역 창처럼 바깥 폼 안에 있어도 Enter가 바깥 폼을 저장하지 않게 한다.
        if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
        event.preventDefault();
        onEnter?.();
      }}
    />
  </>
);

/**
 * 리뷰 하나 쓰기·고치기. 폼 대신 그룹으로 두어 가계부 내역 창(폼) 안에도 넣을 수 있다.
 * `review`가 있으면 고치기, 없으면 `entryId` 내역에 새로 쓴다.
 */
const ReviewEditor = ({
  entryId,
  review,
  onDone,
}: {
  entryId: number;
  review?: PlaceReview;
  onDone: () => void;
}) => {
  const { create, update, remove } = useReviewMutations();
  const [draft, setDraft] = useState<ReviewDraft>(() =>
    review
      ? { author: review.author, rating: review.rating, review: review.review }
      : newReviewDraft()
  );
  const pending = create.isPending || update.isPending || remove.isPending;
  const onError = (err: Error) => toast.error(err.message);

  const save = () => {
    if (draft.rating === null || pending) return;
    const values = {
      author: draft.author,
      rating: draft.rating,
      review: draft.review.trim(),
    };
    if (review) {
      update.mutate({ id: review.id, ...values }, { onSuccess: onDone, onError });
    } else {
      create.mutate(
        { entryId, ...values },
        {
          onSuccess: () => {
            toast.success("리뷰를 남겼어요.");
            onDone();
          },
          onError,
        }
      );
    }
  };

  return (
    <div
      role="group"
      aria-label={review ? "리뷰 고치기" : "리뷰 쓰기"}
      className="flex flex-col gap-2 rounded-xl bg-canvas-soft p-3"
    >
      <ReviewFields draft={draft} onChange={setDraft} onEnter={save} />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={draft.rating === null || pending}
          onClick={save}
        >
          {(create.isPending || update.isPending) && <Spinner />}
          저장
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={onDone}
        >
          취소
        </Button>
        {review && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto text-muted"
            disabled={pending}
            onClick={() =>
              remove.mutate(review.id, {
                onSuccess: () => {
                  toast.success("리뷰를 지웠어요.");
                  onDone();
                },
                onError,
              })
            }
          >
            지우기
          </Button>
        )}
      </div>
    </div>
  );
};

/* ───────── 목록 ───────── */

const reviewDate = (date: string) => {
  const day = kst(date);
  return day.format(day.isSame(kst(), "year") ? "M.D" : "YY.M.D");
};

const ReviewItem = ({ review, showDate }: { review: PlaceReview; showDate: boolean }) => {
  const [editing, setEditing] = useState(false);
  const author = REVIEW_AUTHOR_LABEL[review.author];
  if (editing) {
    return (
      <li>
        <ReviewEditor
          entryId={review.entryId}
          review={review}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }
  return (
    <li
      aria-label={`${author} 리뷰`}
      className="flex items-start gap-2 text-[13px] leading-snug"
    >
      <span className="shrink-0 font-medium text-ink">{author}</span>
      <RatingStars rating={review.rating} className="mt-0.5" />
      <span className="min-w-0 flex-1 break-words text-body">
        {review.review}
        {showDate && (
          <span className="ml-1.5 text-[11px] text-muted tabular-nums">
            {reviewDate(review.entryDate)}
          </span>
        )}
      </span>
      <button
        type="button"
        aria-label={`${author} 리뷰 고치기`}
        onClick={() => setEditing(true)}
        className="-mt-0.5 shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-canvas-soft hover:text-ink"
      >
        <Pencil className="size-3.5" />
      </button>
    </li>
  );
};

export const ReviewList = ({
  reviews,
  showDate = false,
  className,
}: {
  reviews: PlaceReview[];
  showDate?: boolean;
  className?: string;
}) =>
  reviews.length ? (
    <ul aria-label="리뷰" className={cn("flex flex-col gap-1.5", className)}>
      {reviews.map((review) => (
        <ReviewItem key={review.id} review={review} showDate={showDate} />
      ))}
    </ul>
  ) : null;

/** 내역 하나의 리뷰와 "리뷰 쓰기". 데이트 지도의 간 날, 가계부 내역 창에서 쓴다. */
export const EntryReviews = ({
  entryId,
  reviews,
  className,
}: {
  entryId: number;
  reviews: PlaceReview[];
  className?: string;
}) => {
  const [writing, setWriting] = useState(false);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <ReviewList reviews={reviews} />
      {writing ? (
        <ReviewEditor entryId={entryId} onDone={() => setWriting(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setWriting(true)}
          className="inline-flex w-fit items-center gap-1 rounded-md text-[12px] text-primary hover:underline"
        >
          <Plus className="size-3.5" />
          리뷰 쓰기
        </button>
      )}
    </div>
  );
};

/**
 * 장소의 리뷰 전체와 "리뷰 쓰기". 지역 수첩 카드에서 쓴다.
 * 리뷰는 간 날(그날 첫 결제 내역)에 붙이므로 쓸 때 간 날을 고른다(기본은 가장 최근).
 */
export const PlaceReviews = ({
  rating,
  reviews,
  visits,
  className,
}: {
  rating: PlaceRatingSummary | null;
  reviews: PlaceReview[];
  visits: { date: string; entryId: number }[];
  className?: string;
}) => {
  const [writing, setWriting] = useState(false);
  const [entryId, setEntryId] = useState<number | null>(visits[0]?.entryId ?? null);
  const visitOptions = visits.map((visit) => ({
    value: String(visit.entryId),
    label: `${kst(visit.date).format("YY.M.D (dd)")}에 간 날`,
  }));

  return (
    <div className={cn("flex flex-col gap-2 rounded-xl bg-canvas-soft p-3", className)}>
      <div className="flex items-center justify-between gap-2">
        {rating ? (
          <RatingSummary rating={rating} />
        ) : (
          <span className="text-[12px] text-muted">아직 리뷰가 없어요.</span>
        )}
        {!writing && entryId !== null && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setWriting(true)}
          >
            <Plus />
            리뷰 쓰기
          </Button>
        )}
      </div>
      <ReviewList reviews={reviews} showDate />
      {writing && entryId !== null && (
        <div className="flex flex-col gap-2">
          {visits.length > 1 && (
            <Select
              items={visitOptions}
              value={String(entryId)}
              onValueChange={(value) => setEntryId(Number(value))}
            >
              <SelectTrigger aria-label="간 날" size="sm" className="w-fit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {visitOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <ReviewEditor
            key={entryId}
            entryId={entryId}
            onDone={() => setWriting(false)}
          />
        </div>
      )}
    </div>
  );
};
