"use client";

import { Pencil, Star } from "lucide-react";
import { toast } from "sonner";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useSavePlaceNote } from "@/lib/places/client";
import { MAX_RATING, MAX_REVIEW_LENGTH, type PlaceNote } from "@/lib/places/types";
import { cn } from "@/lib/utils";

const STARS = Array.from({ length: MAX_RATING }, (_, index) => index + 1);

/** 읽기 전용 별 — 목록 줄에 작게 붙인다. */
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
    className={cn("inline-flex items-center gap-px text-primary", className)}
  >
    {STARS.map((value) => (
      <Star
        key={value}
        aria-hidden
        className={cn(
          "size-3",
          value <= rating && "fill-current",
          value > rating && "text-primary-disabled"
        )}
      />
    ))}
  </span>
);

/** 별 1~5 고르기. 버튼이라 다른 폼 안에도 넣을 수 있다. */
export const StarPicker = ({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number) => void;
}) => (
  <div role="group" aria-label="별점" className="flex items-center gap-0.5">
    {STARS.map((star) => {
      const on = value !== null && star <= value;
      return (
        <button
          key={star}
          type="button"
          aria-label={`별 ${star}개`}
          aria-pressed={value === star}
          onClick={() => onChange(star)}
          className="rounded-md p-1 text-primary transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Star
            className={cn("size-6", on && "fill-current", !on && "text-primary-disabled")}
          />
        </button>
      );
    })}
  </div>
);

/**
 * 우리 별점(1~5)과 한 줄 리뷰. 데이트 지도·지역 수첩·데이트 추천 카드에서 같이 쓴다.
 * 매긴 게 없으면 "별점 남기기" 버튼만, 있으면 별과 리뷰를 보여 주고 고칠 수 있다.
 */
export const PlaceRating = ({
  placeKey,
  note,
  className,
}: {
  placeKey: string;
  note: PlaceNote | null;
  className?: string;
}) => {
  const save = useSavePlaceNote();
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState<number | null>(note?.rating ?? null);
  const [review, setReview] = useState(note?.review ?? "");

  const open = () => {
    setRating(note?.rating ?? null);
    setReview(note?.review ?? "");
    setEditing(true);
  };
  const submit = (next: { rating: number | null; review: string }) =>
    save.mutate(
      { key: placeKey, ...next },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success(next.rating === null ? "별점을 지웠어요." : "별점을 남겼어요.");
        },
        onError: (err) => toast.error(err.message),
      }
    );

  if (!editing) {
    return (
      <div
        aria-label="우리 별점"
        className={cn("flex items-start justify-between gap-2", className)}
      >
        {note?.rating ? (
          <div className="flex min-w-0 flex-col gap-0.5">
            <RatingStars rating={note.rating} className="[&_svg]:size-4" />
            {note.review && (
              <p className="text-[13px] break-words text-body">“{note.review}”</p>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-muted">아직 우리 별점이 없어요.</p>
        )}
        <Button size="sm" variant="outline" className="shrink-0" onClick={open}>
          {note?.rating ? <Pencil /> : <Star />}
          {note?.rating ? "고치기" : "별점 남기기"}
        </Button>
      </div>
    );
  }

  return (
    <form
      aria-label="별점 남기기"
      className={cn("flex flex-col gap-2", className)}
      onSubmit={(event) => {
        event.preventDefault();
        if (rating === null) return;
        submit({ rating, review: review.trim() });
      }}
    >
      <StarPicker value={rating} onChange={setRating} />
      <Input
        aria-label="한 줄 리뷰"
        placeholder="한 줄 리뷰 (안 써도 돼요)"
        maxLength={MAX_REVIEW_LENGTH}
        value={review}
        onChange={(event) => setReview(event.target.value)}
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={rating === null || save.isPending}>
          {save.isPending && <Spinner />}
          저장
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={save.isPending}
          onClick={() => setEditing(false)}
        >
          취소
        </Button>
        {note?.rating && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto text-muted"
            disabled={save.isPending}
            onClick={() => submit({ rating: null, review: "" })}
          >
            별점 지우기
          </Button>
        )}
      </div>
    </form>
  );
};
