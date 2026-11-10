"use client";

import {
  Camera,
  Footprints,
  Heart,
  MapPin,
  Sparkles,
  ThumbsDown,
  Wallet,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import type { DateReaction, DateSpotView } from "@/lib/dates/types";
import { kst } from "@/lib/kst";
import { cn } from "@/lib/utils";

const REACTIONS: {
  value: DateReaction;
  label: string;
  icon: typeof Heart;
  active: string;
}[] = [
  {
    value: "like",
    label: "가 보고 싶어",
    icon: Heart,
    active: "text-primary [&_svg]:fill-current",
  },
  { value: "visited", label: "다녀왔어", icon: Footprints, active: "text-success" },
  {
    value: "pass",
    label: "별로",
    icon: ThumbsDown,
    active: "text-muted-soft [&_svg]:fill-current",
  },
];

/** 네이버 지도 검색 — 주소가 있으면 같이 넣어 동명 가게를 피한다. */
const mapUrl = (spot: DateSpotView) =>
  `https://map.naver.com/p/search/${encodeURIComponent(
    [spot.name, spot.address?.split(" ").slice(0, 3).join(" ")].filter(Boolean).join(" ")
  )}`;

export const SpotCard = ({
  spot,
  onReact,
  showDay = false,
}: {
  spot: DateSpotView;
  onReact: (reaction: DateReaction | null) => void;
  showDay?: boolean;
}) => (
  <article
    aria-label={spot.name}
    className={cn(
      "flex flex-col gap-3 rounded-2xl border border-hairline bg-surface p-4 transition-opacity",
      spot.reaction === "pass" && "opacity-55"
    )}
  >
    <header className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        {spot.category && (
          <span className="rounded-full bg-canvas-card px-2 py-0.5 font-medium text-body">
            {spot.category}
          </span>
        )}
        {spot.area && <span>{spot.area}</span>}
        {showDay && (
          <span className="text-muted-soft">· {kst(spot.dayKey).format("M.D")} 추천</span>
        )}
      </div>
      <h3 className="text-[17px] leading-snug font-semibold text-ink">{spot.name}</h3>
    </header>

    {spot.summary && <p className="text-sm leading-relaxed text-body">{spot.summary}</p>}
    {spot.reason && (
      <p className="flex gap-1.5 rounded-xl bg-canvas-soft px-3 py-2 text-[13px] leading-relaxed text-body">
        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
        {spot.reason}
      </p>
    )}

    {(spot.address || spot.priceHint) && (
      <dl className="flex flex-col gap-1 text-[13px] text-muted">
        {spot.address && (
          <div className="flex gap-1.5">
            <dt className="sr-only">주소</dt>
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <dd>{spot.address}</dd>
          </div>
        )}
        {spot.priceHint && (
          <div className="flex gap-1.5">
            <dt className="sr-only">가격</dt>
            <Wallet className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <dd>{spot.priceHint}</dd>
          </div>
        )}
      </dl>
    )}

    {spot.tags.length > 0 && (
      <ul className="flex flex-wrap gap-1" aria-label="키워드">
        {spot.tags.map((tag) => (
          <li key={tag} className="text-xs text-muted">
            #{tag}
          </li>
        ))}
      </ul>
    )}

    <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
      <div className="flex gap-1">
        <a
          href={spot.instagramUrl}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Camera />
          인스타
          {spot.instagramAuthor && (
            <span className="max-w-[96px] truncate text-muted">
              @{spot.instagramAuthor}
            </span>
          )}
        </a>
        <a
          href={mapUrl(spot)}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <MapPin />
          지도
        </a>
      </div>
      <div className="flex gap-0.5" role="group" aria-label="우리 반응">
        {REACTIONS.map(({ value, label, icon: Icon, active }) => {
          const on = spot.reaction === value;
          return (
            <Button
              key={value}
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              aria-pressed={on}
              title={label}
              onClick={() => onReact(on ? null : value)}
              className={cn("text-muted", on && active)}
            >
              <Icon />
            </Button>
          );
        })}
      </div>
    </footer>
  </article>
);
