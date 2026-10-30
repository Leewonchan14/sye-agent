"use client";

import { resolveMotion } from "@/lib/media/motion";
import type { MotionSpec } from "@/lib/ui/spec";
import { VideoPlayer } from "./video-player";

const MotionFallback = ({ poster, alt }: { poster?: string; alt?: string }) => (
  <div className="relative bg-muted/40">
    {poster ? (
      // eslint-disable-next-line @next/next/no-img-element -- manifest poster asset, fixed size
      <img src={poster} alt={alt ?? "모션 포스터"} className="h-auto w-full" />
    ) : (
      <div className="flex aspect-video w-full items-center justify-center px-4 text-center text-[12px] text-muted-foreground">
        이 모션은 못 불러왔어…
      </div>
    )}
  </div>
);

export const MotionBlock = ({ spec }: { spec: MotionSpec }) => {
  const asset = resolveMotion(spec.id);
  if (!asset) return <MotionFallback />;

  return (
    <VideoPlayer
      sources={[
        ...(asset.webm ? [{ src: asset.webm, type: "video/webm" }] : []),
        { src: asset.src, type: "video/mp4" },
      ]}
      poster={asset.poster}
      width={asset.width}
      height={asset.height}
      loop={spec.loop}
      autoplay={spec.autoplay}
      soundToggle={spec.sound || asset.hasAudio}
      label="모션"
      fallback={<MotionFallback poster={asset.poster} alt={asset.alt} />}
    />
  );
};
