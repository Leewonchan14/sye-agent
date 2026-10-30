"use client";

import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { resolveMotion, type MotionAsset } from "@/lib/media/motion";
import type { MotionSpec } from "@/lib/ui/spec";

let activeVideo: HTMLVideoElement | null = null;

const subscribeReducedMotion = (onChange: () => void) => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

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

const MotionPlayer = ({ spec, asset }: { spec: MotionSpec; asset: MotionAsset }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );
  const [playing, setPlaying] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [failed, setFailed] = useState(false);

  const startPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (activeVideo && activeVideo !== video) activeVideo.pause();
    activeVideo = video;
    // 자동재생이 막히거나 디코더가 없으면 paused가 그대로다 — 버튼이 항상 보이므로 사용자가 직접 누를 수 있다.
    void video.play().catch(() => {});
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || failed) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (!entry.isIntersecting) {
          video.pause();
          return;
        }
        if (spec.autoplay && !reducedMotion) startPlayback();
      },
      { threshold: 0.35 }
    );

    observer.observe(video);
    return () => {
      observer.disconnect();
      if (activeVideo === video) {
        video.pause();
        activeVideo = null;
      }
    };
  }, [failed, spec.autoplay, startPlayback, reducedMotion]);

  if (failed) {
    return <MotionFallback poster={asset.poster} alt={asset.alt} />;
  }

  const showSound = spec.sound || asset.hasAudio;
  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) startPlayback();
    else video.pause();
  };

  return (
    <div className="relative bg-muted/40">
      <video
        ref={videoRef}
        width={asset.width}
        height={asset.height}
        muted={!soundOn}
        loop={spec.loop}
        playsInline
        preload="none"
        poster={asset.poster}
        controls={false}
        className="h-auto w-full"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setFailed(true)}
      >
        {asset.webm && <source src={asset.webm} type="video/webm" />}
        <source src={asset.src} type="video/mp4" onError={() => setFailed(true)} />
      </video>

      <button
        type="button"
        onClick={togglePlayback}
        aria-label={playing ? "모션 멈추기" : "모션 재생"}
        className="absolute bottom-2 left-2 flex size-8 items-center justify-center rounded-full border border-border/60 bg-background/85 text-foreground shadow-sm backdrop-blur transition hover:bg-background"
      >
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
      </button>

      {showSound && (
        <button
          type="button"
          onClick={() => setSoundOn((on) => !on)}
          aria-label={soundOn ? "소리 끄기" : "소리 켜기"}
          className="absolute right-2 bottom-2 flex size-8 items-center justify-center rounded-full border border-border/60 bg-background/85 text-foreground shadow-sm backdrop-blur transition hover:bg-background"
        >
          {soundOn ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
        </button>
      )}
    </div>
  );
};

export const MotionBlock = ({ spec }: { spec: MotionSpec }) => {
  const asset = resolveMotion(spec.id);
  if (!asset) return <MotionFallback />;
  return <MotionPlayer spec={spec} asset={asset} />;
};
