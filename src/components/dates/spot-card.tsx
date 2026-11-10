"use client";

import {
  Camera,
  Footprints,
  Heart,
  MapPin,
  Sparkles,
  ThumbsDown,
  Wallet,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { parseSpotMedia, type SpotMedia } from "@/lib/dates/media";
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

const usePrefersReducedMotion = () =>
  useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )[0];

/**
 * 게시물 영상. GIF처럼 소리 없이 반복 재생하되, 화면(캐러셀의 보이는 칸)에 들어왔을 때만 돌려
 * 데이터와 배터리를 아낀다. 동작 줄이기를 켠 기기에서는 표지 장면에 멈춰 둔다.
 */
const SpotVideo = ({
  src,
  poster,
  label,
  onError,
}: {
  src: string;
  poster: string | null;
  label: string;
  onError: () => void;
}) => {
  const ref = useRef<HTMLVideoElement>(null);
  const reducedMotion = usePrefersReducedMotion();

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
      poster={poster ?? undefined}
      aria-label={label}
      muted
      loop
      playsInline
      preload="metadata"
      disablePictureInPicture
      onError={onError}
      className="size-full object-cover"
    />
  );
};

type SpotSlide = { url: string; media: SpotMedia; label: string };

/** 크게 본 화면의 영상. 지금 보고 있는 칸일 때만 GIF처럼 돈다. */
const ZoomedVideo = ({
  src,
  poster,
  label,
  active,
}: {
  src: string;
  poster: string | null;
  label: string;
  active: boolean;
}) => {
  const ref = useRef<HTMLVideoElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (active && !reducedMotion) video.play().catch(() => {});
    else video.pause();
  }, [active, reducedMotion]);

  return (
    <video
      ref={ref}
      src={src}
      poster={poster ?? undefined}
      aria-label={label}
      muted
      loop
      playsInline
      preload="metadata"
      disablePictureInPicture
      className="size-full object-contain"
    />
  );
};

/**
 * 사진·영상을 화면 가득 크게 보는 갤러리. 크게 본 채로 밀거나 화살표(키보드 ←·→ 포함)로 넘긴다.
 * 넘긴 칸은 카드 캐러셀도 따라가서, 닫으면 마지막에 본 사진이 카드에 남는다.
 * 사진을 한 번 누르거나 Esc로 닫는다(밀어서 넘긴 것은 캐러셀이 누름으로 치지 않는다).
 */
const ZoomedGallery = ({
  slides,
  start,
  onSelect,
  onClose,
}: {
  slides: SpotSlide[];
  start: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}) => {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(start);
  const many = slides.length > 1;

  useEffect(() => {
    if (!api) return;
    const sync = () => {
      const index = api.selectedScrollSnap();
      setCurrent(index);
      onSelect(index);
    };
    // 포커스가 캐러셀 밖(창 자체)에 있어도 ←·→로 넘긴다. 캐러셀 안에서 이미 처리한 키는 건너뛴다.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "ArrowLeft") api.scrollPrev();
      else if (event.key === "ArrowRight") api.scrollNext();
      else return;
      event.preventDefault();
    };
    api.on("select", sync);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      api.off("select", sync);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [api, onSelect]);

  return (
    <Carousel
      setApi={setApi}
      opts={{ startIndex: start }}
      aria-label="크게 본 사진"
      className="size-full [&_[data-slot=carousel-content]]:h-full"
    >
      <CarouselContent className="ml-0 h-full">
        {slides.map(({ url, media, label }, index) => (
          <CarouselItem key={url} className="h-full pl-0">
            <div
              className="size-full cursor-zoom-out p-5 pt-14 pb-10 select-none"
              onClick={onClose}
            >
              {media.kind === "video" ? (
                <ZoomedVideo
                  src={media.src}
                  poster={media.poster}
                  label={label}
                  active={index === current}
                />
              ) : (
                // 인스타그램 CDN은 다른 사이트의 리퍼러가 붙으면 거절할 수 있다.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={media.src}
                  alt={label}
                  draggable={false}
                  referrerPolicy="no-referrer"
                  className="size-full object-contain"
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
            className="pointer-events-none absolute top-4 left-4 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white tabular-nums"
          >
            {current + 1} / {slides.length}
          </span>
          <CarouselPrevious
            aria-label="이전 사진"
            variant="secondary"
            size="icon"
            className="left-3 border-0 bg-surface/90 shadow-md hover:bg-surface disabled:opacity-0"
          />
          <CarouselNext
            aria-label="다음 사진"
            variant="secondary"
            size="icon"
            className="right-3 border-0 bg-surface/90 shadow-md hover:bg-surface disabled:opacity-0"
          />
        </>
      )}
      <DialogClose
        render={
          <Button
            variant="secondary"
            size="icon"
            className="absolute top-3 right-3 rounded-full border-0 bg-surface/90 shadow-md hover:bg-surface"
          />
        }
      >
        <X />
        <span className="sr-only">닫기</span>
      </DialogClose>
    </Carousel>
  );
};

/**
 * 게시물 사진·영상. 인스타그램 CDN에서 바로 받고, 못 받은 것은 빼고 보여 준다.
 * 누르면 화면 가득 크게 보고, 크게 본 채로도 넘길 수 있다. 영상은 GIF처럼 돈다.
 */
const SpotPhotos = ({ spot }: { spot: DateSpotView }) => {
  const [failed, setFailed] = useState<string[]>([]);
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [zoomed, setZoomed] = useState<number | null>(null);
  const photos = spot.photos.filter((url) => !failed.includes(url));
  const fail = (url: string) => setFailed((list) => [...list, url]);
  const many = photos.length > 1;
  const slides: SpotSlide[] = photos.map((url, index) => {
    const media = parseSpotMedia(url);
    const kind = media.kind === "video" ? "영상" : "사진";
    return {
      url,
      media,
      label: many ? `${spot.name} ${kind} ${index + 1}` : `${spot.name} ${kind}`,
    };
  });

  useEffect(() => {
    if (!api) return;
    // 처음엔 0번째라 따로 맞추지 않고, 넘기거나 사진 수가 바뀔 때만 따라간다.
    const sync = () => setCurrent(api.selectedScrollSnap());
    api.on("select", sync).on("reInit", sync);
    return () => {
      api.off("select", sync).off("reInit", sync);
    };
  }, [api]);

  // 크게 본 화면에서 넘기면 카드도 같은 칸으로 옮겨 둔다(가려져 있으니 바로 건너뛴다).
  const follow = useCallback((index: number) => api?.scrollTo(index, true), [api]);

  if (!photos.length) return null;

  return (
    <>
      <Carousel
        setApi={setApi}
        aria-label={`${spot.name} 사진 ${photos.length}장`}
        className="group/photos relative bg-canvas-card"
      >
        <CarouselContent className="ml-0">
          {slides.map(({ url, media, label }, index) => (
            <CarouselItem key={url} className="pl-0">
              <div className="relative aspect-[4/3] overflow-hidden">
                {media.kind === "video" ? (
                  <SpotVideo
                    src={media.src}
                    poster={media.poster}
                    label={label}
                    onError={() => fail(url)}
                  />
                ) : (
                  // 인스타그램 CDN 주소는 며칠 뒤 바뀌므로 Next 이미지 최적화를 거치지 않는다.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={media.src}
                    alt={label}
                    loading={index === 0 ? "eager" : "lazy"}
                    decoding="async"
                    draggable={false}
                    referrerPolicy="no-referrer"
                    onError={() => fail(url)}
                    className="size-full object-cover select-none"
                  />
                )}
                {/* 넘기려고 끈 것은 캐러셀이 누름으로 치지 않아 크게 보지 않는다. */}
                <button
                  type="button"
                  aria-label={`${label} 크게 보기`}
                  onClick={() => setZoomed(index)}
                  className="absolute inset-0 cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                />
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
      <Dialog open={zoomed !== null} onOpenChange={(open) => !open && setZoomed(null)}>
        <DialogContent
          showCloseButton={false}
          className="top-0 left-0 block h-dvh w-dvw max-w-none translate-x-0 translate-y-0 rounded-none bg-background p-0 ring-0 sm:max-w-none"
        >
          <DialogTitle className="sr-only">{spot.name} 사진 크게 보기</DialogTitle>
          {zoomed !== null && (
            <ZoomedGallery
              slides={slides}
              start={zoomed}
              onSelect={follow}
              onClose={() => setZoomed(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
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
