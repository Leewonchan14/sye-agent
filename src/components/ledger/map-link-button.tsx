"use client";

import { WheelGesturesPlugin } from "embla-carousel-wheel-gestures";
import { Images, MapPin } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";

/** 못 받은 사진은 빼고 보여 준다. */
const useWorkingPhotos = (urls: string[]) => {
  const [failed, setFailed] = useState<string[]>([]);
  return {
    photos: urls.filter((url) => !failed.includes(url)),
    fail: (url: string) => setFailed((list) => [...list, url]),
  };
};

interface Props {
  url: string;
  /** 어떤 내역의 지도인지 화면 읽기 프로그램에 알려 준다. */
  label: string;
  /** 네이버 지도에서 읽은 장소 사진들. 있으면 핀 대신 첫 사진을 보여 준다. */
  imageUrls?: string[];
  /** 사진이 여러 장이면 장수를 작게 띄운다. 넓은 목록에서만 쓴다. */
  showCount?: boolean;
  className?: string;
}

/** 내역 줄 옆에서 지도 링크를 바로 새 탭으로 연다. */
export const MapLinkButton = ({
  url,
  label,
  imageUrls = [],
  showCount,
  className,
}: Props) => {
  // 사진 주소가 막히면 다음 사진, 다 막히면 핀으로 돌아간다.
  const { photos, fail } = useWorkingPhotos(imageUrls);
  const cover = photos[0];

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} 지도 열기`}
      title="지도 열기"
      className={cn(
        "relative inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg text-muted transition-colors hover:bg-canvas-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:bg-canvas-soft",
        cover && "bg-canvas-soft ring-1 ring-hairline",
        className
      )}
    >
      {cover ? (
        <>
          {/* 네이버 이미지 서버에서 바로 받는다. next/image 최적화를 거치지 않는다. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={cover}
            src={cover}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => fail(cover)}
            className="size-full object-cover"
          />
          {showCount && photos.length > 1 && (
            <span
              aria-hidden
              className="absolute right-0.5 bottom-0.5 flex items-center gap-0.5 rounded-[4px] bg-black/60 px-1 text-[9px] leading-[14px] font-medium text-white tabular-nums"
            >
              <Images className="size-2.5" />
              {photos.length}
            </span>
          )}
        </>
      ) : (
        <MapPin className="size-4" />
      )}
    </a>
  );
};

interface PlaceCardProps {
  url: string;
  placeName: string;
  imageUrls: string[];
}

/** 수정 화면에서 네이버 지도 장소 사진을 넘겨 보며 크게 보여 준다. 장소 이름을 누르면 지도를 연다. */
export const MapPlaceCard = ({ url, placeName, imageUrls }: PlaceCardProps) => {
  const { photos, fail } = useWorkingPhotos(imageUrls);
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const name = placeName || "장소";
  const many = photos.length > 1;

  useEffect(() => {
    if (!api) return;
    // 사진을 못 받아 빠지면 칸 수가 바뀌므로 reInit에도 맞춘다.
    const sync = () => setCurrent(api.selectedScrollSnap());
    api.on("select", sync).on("reInit", sync);
    return () => {
      api.off("select", sync).off("reInit", sync);
    };
  }, [api]);

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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo}
                  alt={many ? `${name} 사진 ${index + 1}` : `${name} 사진`}
                  loading={index === 0 ? "eager" : "lazy"}
                  decoding="async"
                  draggable={false}
                  referrerPolicy="no-referrer"
                  onError={() => fail(photo)}
                  className="aspect-[16/9] w-full object-cover select-none"
                />
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
                className="left-2 border-0 bg-white/85 shadow-sm hover:bg-white disabled:opacity-0 md:opacity-0 md:group-hover/photos:opacity-100 md:disabled:group-hover/photos:opacity-0"
              />
              <CarouselNext
                type="button"
                aria-label="다음 사진"
                variant="secondary"
                className="right-2 border-0 bg-white/85 shadow-sm hover:bg-white disabled:opacity-0 md:opacity-0 md:group-hover/photos:opacity-100 md:disabled:group-hover/photos:opacity-0"
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
    </div>
  );
};
