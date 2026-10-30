"use client";

import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { ReactNode } from "react";

let activeVideo: HTMLVideoElement | null = null;

const subscribeReducedMotion = (onChange: () => void) => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

export interface VideoPlayerSource {
  src: string;
  type: string;
}

interface VideoPlayerProps {
  sources: VideoPlayerSource[];
  poster?: string | null;
  width?: number | null;
  height?: number | null;
  loop: boolean;
  autoplay: boolean;
  /** 소리 토글을 보여줄지 — 아티팩트 영상은 항상 무음이라 숨긴다. */
  soundToggle?: boolean;
  /** aria-label 접두사 ("모션 재생" / "영상 재생"). */
  label: string;
  fallback: ReactNode;
}

/**
 * 모션/아티팩트 공용 비디오 플레이어.
 * - 뷰포트 안에 있을 때만 재생, 벗어나면 정지
 * - 항상 보이는 재생/정지 토글
 * - reduced-motion 이면 자동재생하지 않는다
 * - 한 번에 하나만 재생 (모듈 스코프 activeVideo)
 */
export const VideoPlayer = ({
  sources,
  poster,
  width,
  height,
  loop,
  autoplay,
  soundToggle = false,
  label,
  fallback,
}: VideoPlayerProps) => {
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
        if (autoplay && !reducedMotion) startPlayback();
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
  }, [failed, autoplay, startPlayback, reducedMotion]);

  if (failed) return <>{fallback}</>;

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
        width={width ?? undefined}
        height={height ?? undefined}
        muted={!soundOn}
        loop={loop}
        playsInline
        preload="none"
        poster={poster ?? undefined}
        controls={false}
        className="h-auto w-full"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setFailed(true)}
      >
        {sources.map((source, index) => (
          <source
            key={source.src}
            src={source.src}
            type={source.type}
            onError={index === sources.length - 1 ? () => setFailed(true) : undefined}
          />
        ))}
      </video>

      <button
        type="button"
        onClick={togglePlayback}
        aria-label={playing ? `${label} 멈추기` : `${label} 재생`}
        className="absolute bottom-2 left-2 flex size-8 items-center justify-center rounded-full border border-border/60 bg-background/85 text-foreground shadow-sm backdrop-blur transition hover:bg-background"
      >
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
      </button>

      {soundToggle && (
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
