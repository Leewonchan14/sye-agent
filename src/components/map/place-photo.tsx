import { MapPin } from "lucide-react";

import { cn } from "@/lib/utils";

/** 장소 대표 사진. 없으면 핀 아이콘. 네이버·인스타그램 이미지 서버에서 바로 받는다. */
export const PlacePhoto = ({
  src,
  className,
}: {
  src: string | null;
  className?: string;
}) => (
  <div
    className={cn(
      // 흰 바탕 사진도 테두리가 보이게 한다.
      "flex shrink-0 items-center justify-center overflow-hidden border border-hairline bg-canvas-soft",
      className
    )}
  >
    {src ? (
      // next/image 최적화를 거치지 않는다.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="size-full object-cover"
      />
    ) : (
      <MapPin className="size-5 text-muted-soft" />
    )}
  </div>
);
