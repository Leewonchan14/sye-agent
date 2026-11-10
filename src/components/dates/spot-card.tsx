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
import { useEffect, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { ImageZoom } from "@/components/ui/image-zoom";
import { isSpotVideo } from "@/lib/dates/media";
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

/**
 * 게시물 영상. GIF처럼 소리 없이 반복 재생하되, 화면(캐러셀의 보이는 칸)에 들어왔을 때만 돌려
 * 데이터와 배터리를 아낀다. 동작 줄이기를 켠 기기에서는 멈춰 두고 재생 버튼을 보여 준다.
 */
const SpotVideo = ({
  src,
  label,
  onError,
}: {
  src: string;
  label: string;
  onError: () => void;
}) => {
  const ref = useRef<HTMLVideoElement>(null);
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const video = ref.current;
    if (!video || reducedMotion) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // 자동 재생이 막힌 브라우저에서는 첫 장면만 보인다.
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [reducedMotion]);

  return (
    <video
      ref={ref}
      src={src}
      aria-label={label}
      muted
      loop
      playsInline
      preload="metadata"
      disablePictureInPicture
      controls={reducedMotion}
      onError={onError}
      className="size-full object-cover"
    />
  );
};

/**
 * 게시물 사진·영상. 인스타그램 CDN에서 바로 받고, 못 받은 것은 빼고 보여 준다.
 * 사진은 누르면 그 자리에서 화면 가득 커지고(다시 누르거나 Esc로 닫기), 영상은 GIF처럼 돈다.
 */
const SpotPhotos = ({ spot }: { spot: DateSpotView }) => {
  const [failed, setFailed] = useState<string[]>([]);
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const photos = spot.photos.filter((url) => !failed.includes(url));
  const fail = (url: string) => setFailed((list) => [...list, url]);

  useEffect(() => {
    if (!api) return;
    // 처음엔 0번째라 따로 맞추지 않고, 넘기거나 사진 수가 바뀔 때만 따라간다.
    const sync = () => setCurrent(api.selectedScrollSnap());
    api.on("select", sync).on("reInit", sync);
    return () => {
      api.off("select", sync).off("reInit", sync);
    };
  }, [api]);

  if (!photos.length) return null;
  const many = photos.length > 1;

  return (
    <Carousel
      setApi={setApi}
      aria-label={`${spot.name} 사진 ${photos.length}장`}
      className="group/photos relative bg-canvas-card"
    >
      <CarouselContent className="ml-0">
        {photos.map((url, index) => (
          <CarouselItem key={url} className="pl-0">
            <div className="aspect-[4/3] overflow-hidden [&_[data-rmiz-content]]:size-full [&_[data-rmiz]]:size-full">
              {isSpotVideo(url) ? (
                <SpotVideo
                  src={url}
                  label={many ? `${spot.name} 영상 ${index + 1}` : `${spot.name} 영상`}
                  onError={() => fail(url)}
                />
              ) : (
                // 넘기려고 끈 것은 캐러셀이 클릭으로 치지 않아 확대되지 않는다.
                // 인스타그램 CDN 주소는 며칠 뒤 바뀌므로 Next 이미지 최적화를 거치지 않는다.
                <ImageZoom
                  src={url}
                  alt={many ? `${spot.name} 사진 ${index + 1}` : `${spot.name} 사진`}
                  loading={index === 0 ? "eager" : "lazy"}
                  decoding="async"
                  draggable={false}
                  referrerPolicy="no-referrer"
                  onError={() => fail(url)}
                  className="size-full object-cover select-none"
                  // 확대한 사진도 같은 CDN에서 받으므로 리퍼러를 빼야 한다.
                  zoomInProps={{ referrerPolicy: "no-referrer" }}
                  rmiz={{
                    a11yNameButtonZoom: "사진 크게 보기",
                    a11yNameButtonUnzoom: "사진 작게 보기",
                  }}
                />
              )}
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      {many && (
        <>
          <span
            aria-live="polite"
            className="pointer-events-none absolute top-2.5 right-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white tabular-nums"
          >
            {current + 1} / {photos.length}
          </span>
          <CarouselPrevious
            aria-label="이전 사진"
            variant="secondary"
            className="left-2 border-0 bg-white/85 shadow-sm hover:bg-white disabled:opacity-0 md:opacity-0 md:group-hover/photos:opacity-100 md:disabled:group-hover/photos:opacity-0"
          />
          <CarouselNext
            aria-label="다음 사진"
            variant="secondary"
            className="right-2 border-0 bg-white/85 shadow-sm hover:bg-white disabled:opacity-0 md:opacity-0 md:group-hover/photos:opacity-100 md:disabled:group-hover/photos:opacity-0"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1"
          >
            {photos.map((url, index) => (
              <span
                key={url}
                className={cn(
                  "size-1.5 rounded-full bg-white/55 transition-colors",
                  index === current && "bg-white"
                )}
              />
            ))}
          </div>
        </>
      )}
    </Carousel>
  );
};

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
      "flex flex-col overflow-hidden rounded-2xl border border-hairline bg-surface transition-opacity",
      spot.reaction === "pass" && "opacity-55"
    )}
  >
    <SpotPhotos spot={spot} />
    <div className="flex flex-1 flex-col gap-3 p-4">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {spot.category && (
            <span className="rounded-full bg-canvas-card px-2 py-0.5 font-medium text-body">
              {spot.category}
            </span>
          )}
          {spot.area && <span>{spot.area}</span>}
          {showDay && (
            <span className="text-muted-soft">
              · {kst(spot.dayKey).format("M.D")} 추천
            </span>
          )}
        </div>
        <h3 className="text-[17px] leading-snug font-semibold text-ink">{spot.name}</h3>
      </header>

      {spot.summary && (
        <p className="text-sm leading-relaxed text-body">{spot.summary}</p>
      )}
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
    </div>
  </article>
);
