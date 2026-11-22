"use client";

import { MapPin } from "lucide-react";

import { cn } from "@/lib/utils";

interface Props {
  url: string;
  /** 어떤 내역의 지도인지 화면 읽기 프로그램에 알려 준다. */
  label: string;
  className?: string;
}

/** 내역 줄 옆에서 지도 링크를 바로 새 탭으로 연다. */
export const MapLinkButton = ({ url, label, className }: Props) => (
  <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={`${label} 지도 열기`}
    title="지도 열기"
    className={cn(
      "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:bg-canvas-soft",
      className
    )}
  >
    <MapPin className="size-4" />
  </a>
);
