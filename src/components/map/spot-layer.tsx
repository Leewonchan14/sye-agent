"use client";

import {
  BedDouble,
  Camera,
  CircleCheck,
  ExternalLink,
  Heart,
  Sparkles,
  ThumbsDown,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { categoryChipClass } from "@/components/ledger/category-chips";
import {
  spotPinColor,
  STAY_PIN,
  VISITED_PIN,
  WANT_PIN,
} from "@/components/map/pin-colors";
import { PlacePhoto } from "@/components/map/place-photo";
import { RatingSummary, ReviewList } from "@/components/places/place-reviews";
import { Button, buttonVariants } from "@/components/ui/button";
import { pickSnippet } from "@/lib/ledger/map-filter";
import { MAP_LAYERS, type MapLayer } from "@/lib/ledger/map-layers";
import { useAreaSpotMutations } from "@/lib/places/client";
import { REVIEW_AUTHOR_LABEL, type PlaceCard } from "@/lib/places/types";
import { cn } from "@/lib/utils";

export const LAYER_LABEL: Record<MapLayer, string> = {
  visited: "다녀온 곳",
  want: "가 보고 싶은 곳",
  stay: "숙소",
};
const LAYER_COLOR: Record<MapLayer, string> = {
  visited: VISITED_PIN,
  want: WANT_PIN,
  stay: STAY_PIN,
};

/** 레이어 켜고 끄기. 칩 앞의 점이 지도 핀 색이다. */
export const LayerChips = ({
  layers,
  counts,
  onToggle,
}: {
  layers: MapLayer[];
  counts: Record<MapLayer, number>;
  onToggle: (layer: MapLayer) => void;
}) => (
  <div
    role="group"
    aria-label="지도에 보기"
    className="flex flex-wrap items-center gap-1.5"
  >
    {MAP_LAYERS.map((layer) => {
      const on = layers.includes(layer);
      return (
        <button
          key={layer}
          type="button"
          aria-pressed={on}
          onClick={() => onToggle(layer)}
          className={cn(categoryChipClass(on), "gap-1.5 px-2.5 py-1 text-[12px]")}
        >
          <span
            aria-hidden
            className={cn("size-2.5 rounded-full", !on && "opacity-40")}
            style={{ backgroundColor: LAYER_COLOR[layer] }}
          />
          {LAYER_LABEL[layer]}
          <span className="text-muted tabular-nums">{counts[layer]}</span>
        </button>
      );
    })}
  </div>
);

/** 추천 카드의 표시: 숙소 · 가 보고 싶어 · 다녀왔어 · 아직 표시 안 한 새 추천 */
const spotIconKey = (card: PlaceCard): "stay" | "like" | "visited" | "fresh" => {
  if (card.kind === "stay") return "stay";
  if (card.reaction === "like") return "like";
  if (card.reaction === "visited") return "visited";
  return "fresh";
};

const SpotIcon = ({ card, className }: { card: PlaceCard; className?: string }) => {
  const props = {
    "aria-hidden": true,
    className: cn(
      "size-4 shrink-0",
      card.reaction === "like" && "fill-current",
      className
    ),
    style: { color: spotPinColor(card) },
  };
  switch (spotIconKey(card)) {
    case "stay":
      return <BedDouble {...props} />;
    case "like":
      return <Heart {...props} />;
    case "visited":
      return <CircleCheck {...props} />;
    default:
      return <Sparkles {...props} />;
  }
};

/** 목록 줄의 한 줄 설명: 검색에 걸린 리뷰 → 최근 리뷰 → 하치와레가 고른 이유 */
const SpotLine = ({ card, query }: { card: PlaceCard; query: string }) => {
  const snippet = pickSnippet(card.reviews, query);
  if (snippet) {
    return (
      <span
        data-testid="review-snippet"
        className="mt-0.5 truncate text-[11px] text-body"
      >
        “{snippet.review}”
        <span className="text-muted"> — {REVIEW_AUTHOR_LABEL[snippet.author]}</span>
      </span>
    );
  }
  return card.reason ? (
    <span className="mt-0.5 truncate text-[11px] text-muted">{card.reason}</span>
  ) : null;
};

/** 하치와레 추천 목록. 다녀온 곳 목록과 같은 줄 모양에 표시 아이콘을 붙인다. */
export const SpotList = ({
  label,
  cards,
  query,
  selectedKey,
  onSelect,
}: {
  label: string;
  cards: PlaceCard[];
  query: string;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) => (
  <ul aria-label={label} className="flex flex-col gap-1">
    {cards.map((card) => (
      <li key={card.key}>
        <button
          type="button"
          aria-current={card.key === selectedKey || undefined}
          onClick={() => onSelect(card.key)}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-canvas-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            card.key === selectedKey && "bg-canvas-card"
          )}
        >
          <SpotIcon card={card} />
          <PlacePhoto src={card.imageUrl} className="size-11 rounded-lg" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[14px] font-medium text-ink">{card.name}</span>
            <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
              {card.rating && <RatingSummary rating={card.rating} />}
              <span className="truncate">
                {card.category || card.address || "장소"}
                {card.lat === null && " · 지도 위치 없음"}
              </span>
            </span>
            <SpotLine card={card} query={query} />
          </span>
          {card.priceHint && (
            <span className="max-w-20 shrink-0 text-right text-[11px] text-muted tabular-nums">
              {card.priceHint}
            </span>
          )}
        </button>
      </li>
    ))}
  </ul>
);

/** 아직 표시하지 않은 새 추천에 가 보고 싶어·별로 */
const SpotReactions = ({ spotId }: { spotId: number }) => {
  const { react } = useAreaSpotMutations();
  const mark = (reaction: "like" | "pass") =>
    react.mutate(
      { spotId, reaction },
      {
        onSuccess: () =>
          toast.success(
            reaction === "like"
              ? "가 보고 싶은 곳에 넣었어요."
              : "다음부터 이런 곳은 빼 볼게요."
          ),
        onError: (err) => toast.error(err.message),
      }
    );
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={react.isPending} onClick={() => mark("like")}>
        <Heart />가 보고 싶어
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={react.isPending}
        onClick={() => mark("pass")}
      >
        <ThumbsDown />
        별로
      </Button>
    </div>
  );
};

const linkClass = buttonVariants({ variant: "outline", size: "sm" });

const MARKER_LABEL = (card: PlaceCard) => {
  if (card.reaction === "like") return "가 보고 싶은 곳";
  if (card.reaction === "visited") return "다녀왔어로 표시한 곳";
  return "하치와레 새 추천";
};

/** 지도·목록에서 고른 하치와레 추천 */
export const SpotDetail = ({
  card,
  onClose,
}: {
  card: PlaceCard;
  onClose: () => void;
}) => (
  <section
    aria-label={`${card.name} 추천`}
    className="overflow-hidden rounded-2xl bg-surface ring-1 ring-hairline"
  >
    {card.imageUrl && (
      <PlacePhoto
        src={card.imageUrl}
        className="aspect-[16/9] w-full rounded-none border-0 border-b"
      />
    )}
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="flex min-w-0 items-center gap-1.5 text-base font-semibold text-ink">
            <SpotIcon card={card} />
            <span className="truncate">{card.name}</span>
          </h2>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="선택 해제"
            title="선택 해제 (Esc)"
            className="-mt-1 -mr-1.5 shrink-0 text-muted"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
        <p className="text-[12px] text-muted">
          {[MARKER_LABEL(card), card.category, card.address].filter(Boolean).join(" · ")}
        </p>
        {card.priceHint && (
          <p className="mt-1 text-[13px] font-medium text-body tabular-nums">
            {card.priceHint}
          </p>
        )}
      </div>
      {card.reason && (
        <p className="rounded-xl bg-canvas-soft px-3 py-2 text-[13px] leading-relaxed text-body">
          <span className="mr-1 font-medium text-ink">하치와레</span>
          {card.reason}
        </p>
      )}
      {card.spotId !== null && card.reaction === null && (
        <SpotReactions spotId={card.spotId} />
      )}
      {card.rating ? (
        <div aria-label="다녀와서 남긴 리뷰" className="flex flex-col gap-1.5">
          <RatingSummary rating={card.rating} />
          <ReviewList reviews={card.reviews.slice(0, 3)} showDate />
        </div>
      ) : (
        card.reaction !== null && (
          <p className="text-[12px] text-muted">
            다녀와서 가계부에 지도 링크를 남기면 리뷰를 쓸 수 있어요.
          </p>
        )
      )}
      <div className="flex flex-wrap gap-2">
        {card.mapUrl && (
          <a
            href={card.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            <ExternalLink />
            네이버 지도
          </a>
        )}
        {card.sourceUrl && (
          <a
            href={card.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            {card.kind === "stay" ? <BedDouble /> : <ExternalLink />}
            {card.kind === "stay" ? "NOL에서 보기" : "소개 페이지"}
          </a>
        )}
        {card.instagramUrl && (
          <a
            href={card.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            <Camera />
            인스타그램
          </a>
        )}
      </div>
    </div>
  </section>
);
