"use client";

import { MapPin } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

interface Props {
  url: string;
  /** 어떤 내역의 지도인지 화면 읽기 프로그램에 알려 준다. */
  label: string;
  /** 네이버 지도에서 읽은 장소 사진. 있으면 핀 대신 사진을 보여 준다. */
  imageUrl?: string;
  className?: string;
}

/** 내역 줄 옆에서 지도 링크를 바로 새 탭으로 연다. */
export const MapLinkButton = ({ url, label, imageUrl, className }: Props) => {
  // 사진 주소가 만료되거나 막히면 핀으로 돌아간다.
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(imageUrl) && !broken;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} 지도 열기`}
      title="지도 열기"
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg text-muted transition-colors hover:bg-canvas-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:bg-canvas-soft",
        showImage && "bg-canvas-soft ring-1 ring-hairline",
        className
      )}
    >
      {showImage ? (
        // 네이버 이미지 서버에서 바로 받는다. next/image 최적화를 거치지 않는다.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="size-full object-cover"
        />
      ) : (
        <MapPin className="size-4" />
      )}
    </a>
  );
};

interface PlaceCardProps {
  url: string;
  placeName: string;
  imageUrl: string;
}

/** 수정 화면에서 네이버 지도 장소 사진을 크게 보여 준다. 누르면 지도를 연다. */
export const MapPlaceCard = ({ url, placeName, imageUrl }: PlaceCardProps) => {
  const [broken, setBroken] = useState(false);
  const name = placeName || "장소";

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${name} 지도 열기`}
      className="mt-2 block overflow-hidden rounded-xl border border-hairline bg-canvas-soft transition-colors hover:bg-canvas-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {imageUrl && !broken && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={`${name} 사진`}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="aspect-[16/9] w-full object-cover"
        />
      )}
      <span className="flex items-center gap-1.5 px-3 py-2 text-[12px] text-body">
        <MapPin className="size-3.5 shrink-0 text-muted" />
        <span className="min-w-0 truncate">{name}</span>
      </span>
    </a>
  );
};
