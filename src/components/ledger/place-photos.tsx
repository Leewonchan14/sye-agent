"use client";

import { WheelGesturesPlugin } from "embla-carousel-wheel-gestures";
import { ExternalLink, MapPin, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toLargePlacePhotoUrl } from "@/lib/ledger/map-url";
import { cn } from "@/lib/utils";

/*
 * 네이버 지도 장소 사진. 사진 파일은 저장하지 않고 네이버 이미지 서버에서 바로 받으므로
 * next/image 최적화를 거치지 않는다(<img>를 쓴다).
 */

/** 못 받은 사진은 빼고 보여 준다. */
const useWorkingPhotos = (urls: string[]) => {
  const [failed, setFailed] = useState<string[]>([]);
  return {
    photos: urls.filter((url) => !failed.includes(url)),
    fail: (url: string) => setFailed((list) => [...list, url]),
  };
};

/** 캐러셀이 지금 보여 주는 칸. 사진이 빠져 칸 수가 바뀌어도(reInit) 맞춘다. */
const useCarouselIndex = (api: CarouselApi, start = 0) => {
  const [current, setCurrent] = useState(start);
  useEffect(() => {
    if (!api) return;
    const sync = () => setCurrent(api.selectedScrollSnap());
    api.on("select", sync).on("reInit", sync);
    return () => {
      api.off("select", sync).off("reInit", sync);
    };
  }, [api]);
  return current;
};

const photoLabel = (name: string, index: number, total: number) =>
  total > 1 ? `${name} 사진 ${index + 1}` : `${name} 사진`;

const NAV_BUTTON_CLASS =
  "border-0 bg-white/85 shadow-sm hover:bg-white disabled:opacity-0 md:opacity-0 md:group-hover/photos:opacity-100 md:disabled:group-hover/photos:opacity-0";

/** 사진 여러 장을 화면 가득 크게 보고 넘긴다. 키보드 ←·→, Esc도 된다. */
const PhotoViewer = ({
  photos,
  name,
  mapUrl,
  start,
  onClose,
}: {
  photos: string[];
  name: string;
  mapUrl: string;
  start: number | null;
  onClose: () => void;
}) => (
  <Dialog open={start !== null} onOpenChange={(open) => !open && onClose()}>
    <DialogContent
      showCloseButton={false}
      className="top-0 left-0 block h-dvh w-dvw max-w-none translate-x-0 translate-y-0 rounded-none bg-background p-0 ring-0 sm:max-w-none"
    >
      <DialogTitle className="sr-only">{name} 사진 크게 보기</DialogTitle>
      {start !== null && (
        <ViewerCarousel photos={photos} name={name} mapUrl={mapUrl} start={start} />
      )}
    </DialogContent>
  </Dialog>
);

const ViewerCarousel = ({
  photos,
  name,
  mapUrl,
  start,
}: {
  photos: string[];
  name: string;
  mapUrl: string;
  start: number;
}) => {
  const [api, setApi] = useState<CarouselApi>();
  const current = useCarouselIndex(api, start);
  // 큰 사진을 못 받으면 목록에서 쓰던 작은 사진으로 돌아간다.
  const [smallOnly, setSmallOnly] = useState<string[]>([]);
  const many = photos.length > 1;

  useEffect(() => {
    if (!api) return;
    // 포커스가 캐러셀 밖에 있어도 ←·→로 넘긴다. 캐러셀 안에서 이미 처리한 키는 건너뛴다.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "ArrowLeft") api.scrollPrev();
      else if (event.key === "ArrowRight") api.scrollNext();
      else return;
      event.preventDefault();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [api]);

  return (
    <Carousel
      setApi={setApi}
      opts={{ startIndex: start }}
      plugins={[WheelGesturesPlugin()]}
      aria-label={`${name} 사진 ${photos.length}장 크게 보기`}
      className="group/photos size-full [&_[data-slot=carousel-content]]:h-full"
    >
      <CarouselContent className="ml-0 h-full">
        {photos.map((photo, index) => (
          <CarouselItem key={photo} className="h-full pl-0">
            <div className="size-full p-4 pt-16 pb-10 select-none sm:p-10 sm:pt-16">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={smallOnly.includes(photo) ? photo : toLargePlacePhotoUrl(photo)}
                alt={photoLabel(name, index, photos.length)}
                draggable={false}
                referrerPolicy="no-referrer"
                onError={() =>
                  setSmallOnly((list) => (list.includes(photo) ? list : [...list, photo]))
                }
                className="size-full object-contain"
              />
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <div className="absolute inset-x-0 top-0 flex items-center gap-2 px-3 py-3">
        {many && (
          <span
            aria-live="polite"
            className="shrink-0 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white tabular-nums"
          >
            {current + 1} / {photos.length}
          </span>
        )}
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-0 items-center gap-1 rounded-full bg-surface/90 px-3 py-1 text-xs text-body shadow-sm hover:bg-surface"
        >
          <MapPin className="size-3.5 shrink-0 text-muted" />
          <span className="truncate">{name}</span>
          <ExternalLink className="size-3 shrink-0 text-muted" />
        </a>
        <DialogClose
          render={
            <Button
              variant="secondary"
              size="icon"
              className="ml-auto shrink-0 rounded-full border-0 bg-surface/90 shadow-md hover:bg-surface"
            />
          }
        >
          <X />
          <span className="sr-only">닫기</span>
        </DialogClose>
      </div>
      {many && (
        <>
          <CarouselPrevious
            type="button"
            aria-label="이전 사진"
            variant="secondary"
            size="icon"
            className={cn("left-3", NAV_BUTTON_CLASS)}
          />
          <CarouselNext
            type="button"
            aria-label="다음 사진"
            variant="secondary"
            size="icon"
            className={cn("right-3", NAV_BUTTON_CLASS)}
          />
        </>
      )}
    </Carousel>
  );
};

interface StripProps {
  /** 내역 이름. 지도 버튼 이름에 쓴다. */
  title: string;
  mapUrl: string;
  placeName: string;
  imageUrls: string[];
  /** 좁은 목록(통계·펼친 내역)은 sm */
  size?: "sm" | "md";
  className?: string;
}

/** 넓은 화면의 md에서 크게 보여 주는 사진 수. 나머지는 "+N" 칸으로 묶는다. */
const WIDE_PHOTO_COUNT = 3;

/**
 * 내역 줄 아래에 붙는 장소 줄: 📍 장소 이름(누르면 지도) 아래에 사진(누르면 크게 보기).
 * - 좁은 화면, sm(좁은 목록): 작은 사진 띠. 넘치는 사진은 가로로 밀어 본다.
 * - 넓은 화면의 md(내역 탭): 큰 사진 3장 + "+N" 칸. 장소 이름은 테두리 없는 글자 링크.
 */
export const PlacePhotoStrip = ({
  title,
  mapUrl,
  placeName,
  imageUrls,
  size = "md",
  className,
}: StripProps) => {
  const { photos, fail } = useWorkingPhotos(imageUrls);
  const [viewing, setViewing] = useState<number | null>(null);
  const name = placeName || title;
  const wide = size === "md";
  const more = photos.length - WIDE_PHOTO_COUNT;

  return (
    <div className={cn("flex flex-col items-start gap-1.5", className)}>
      <a
        href={mapUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${title} 지도 열기`}
        title="지도 열기"
        className={cn(
          "flex max-w-full shrink-0 items-center gap-1 rounded-md border border-hairline bg-surface px-2 text-[11px] text-muted transition-colors hover:bg-canvas-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          wide
            ? "h-7 sm:h-auto sm:border-0 sm:bg-transparent sm:px-0 sm:hover:bg-transparent sm:hover:underline"
            : "h-6"
        )}
      >
        <MapPin className="size-3 shrink-0" />
        <span className="truncate">{placeName || "지도"}</span>
      </a>
      {photos.length > 0 && (
        <div
          className={cn(
            "flex w-full min-w-0 [scrollbar-width:none] gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden",
            wide && "sm:gap-2 sm:overflow-visible"
          )}
        >
          {photos.map((photo, index) => (
            <button
              key={photo}
              type="button"
              aria-label={`${photoLabel(name, index, photos.length)} 크게 보기`}
              onClick={() => setViewing(index)}
              className={cn(
                "shrink-0 cursor-zoom-in overflow-hidden rounded-md bg-canvas-soft ring-1 ring-hairline transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                wide ? "h-12 w-20 sm:h-24 sm:w-40 sm:rounded-lg" : "h-10 w-16",
                wide && index >= WIDE_PHOTO_COUNT && "sm:hidden"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                referrerPolicy="no-referrer"
                onError={() => fail(photo)}
                className="size-full object-cover"
              />
            </button>
          ))}
          {wide && more > 0 && (
            <button
              type="button"
              aria-label={`${name} 사진 ${more}장 더 보기`}
              onClick={() => setViewing(WIDE_PHOTO_COUNT)}
              className="relative hidden h-24 w-24 shrink-0 cursor-zoom-in overflow-hidden rounded-lg bg-canvas-soft ring-1 ring-hairline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photos[WIDE_PHOTO_COUNT]}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                referrerPolicy="no-referrer"
                // 못 받으면 그 사진을 빼고, 다음 사진이 "+N" 칸을 채운다.
                onError={() => fail(photos[WIDE_PHOTO_COUNT])}
                className="size-full object-cover"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-medium text-white tabular-nums transition-colors hover:bg-black/40">
                +{more}
              </span>
            </button>
          )}
        </div>
      )}
      <PhotoViewer
        photos={photos}
        name={name}
        mapUrl={mapUrl}
        start={viewing}
        onClose={() => setViewing(null)}
      />
    </div>
  );
};

interface PlaceCardProps {
  url: string;
  placeName: string;
  imageUrls: string[];
}

/**
 * 수정 화면에서 네이버 지도 장소 사진을 넘겨 본다. 사진을 누르면 크게 보고,
 * 장소 이름을 누르면 지도를 연다.
 */
export const MapPlaceCard = ({ url, placeName, imageUrls }: PlaceCardProps) => {
  const { photos, fail } = useWorkingPhotos(imageUrls);
  const [api, setApi] = useState<CarouselApi>();
  const current = useCarouselIndex(api);
  const [viewing, setViewing] = useState<number | null>(null);
  const name = placeName || "장소";
  const many = photos.length > 1;

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-hairline bg-canvas-soft">
      {photos.length > 0 && (
        <Carousel
          setApi={setApi}
          // 트랙패드·가로 휠로 좌우로 밀면 넘어간다.
          plugins={[WheelGesturesPlugin()]}
          aria-label={`${name} 사진 ${photos.length}장`}
          className="group/photos relative bg-canvas-card"
        >
          <CarouselContent className="ml-0">
            {photos.map((photo, index) => (
              <CarouselItem key={photo} className="pl-0">
                {/* 밀어서 넘긴 것은 캐러셀이 누름으로 치지 않아 크게 보지 않는다. */}
                <button
                  type="button"
                  aria-label={`${photoLabel(name, index, photos.length)} 크게 보기`}
                  onClick={() => setViewing(index)}
                  className="block w-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo}
                    alt={photoLabel(name, index, photos.length)}
                    loading={index === 0 ? "eager" : "lazy"}
                    decoding="async"
                    draggable={false}
                    referrerPolicy="no-referrer"
                    onError={() => fail(photo)}
                    className="aspect-[16/9] w-full object-cover select-none"
                  />
                </button>
              </CarouselItem>
            ))}
          </CarouselContent>
          {many && (
            <>
              <span
                aria-live="polite"
                className="pointer-events-none absolute top-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white tabular-nums"
              >
                {current + 1} / {photos.length}
              </span>
              <CarouselPrevious
                type="button"
                aria-label="이전 사진"
                variant="secondary"
                className={cn("left-2", NAV_BUTTON_CLASS)}
              />
              <CarouselNext
                type="button"
                aria-label="다음 사진"
                variant="secondary"
                className={cn("right-2", NAV_BUTTON_CLASS)}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1"
              >
                {photos.map((photo, index) => (
                  <span
                    key={photo}
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
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${name} 지도 열기`}
        className="flex items-center gap-1.5 px-3 py-2 text-[12px] text-body transition-colors hover:bg-canvas-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
      >
        <MapPin className="size-3.5 shrink-0 text-muted" />
        <span className="min-w-0 truncate">{name}</span>
      </a>
      <PhotoViewer
        photos={photos}
        name={name}
        mapUrl={url}
        start={viewing}
        onClose={() => setViewing(null)}
      />
    </div>
  );
};
