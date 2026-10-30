"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileQuestion } from "lucide-react";
import { useState } from "react";

import type { ArtifactSpec } from "@/lib/ui/spec";
import { VideoPlayer } from "./video-player";

interface ArtifactMeta {
  id: string;
  kind: string;
  mime: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  posterUrl: string | null;
  caption: string | null;
  bytes: number;
}

const fetchArtifactMeta = async (id: string): Promise<ArtifactMeta | null> => {
  const res = await fetch(`/api/artifacts/${id}/meta`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`아티팩트 정보를 못 불러왔어 (${res.status})`);
  return (await res.json()) as ArtifactMeta;
};

const ArtifactSkeleton = () => (
  <div
    className="h-40 w-full animate-pulse bg-muted/40"
    aria-label="아티팩트 불러오는 중"
  />
);

const ArtifactCard = ({
  title,
  description,
  href,
  linkLabel,
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
}) => (
  <div className="flex min-h-28 w-full flex-col items-center justify-center gap-1 px-4 py-6 text-center">
    <FileQuestion className="mb-1 size-5 text-muted-foreground" />
    <p className="text-[13px] text-foreground">{title}</p>
    {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
    {href && linkLabel && (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1 rounded-md border border-border/60 px-2.5 py-1 text-[11px] text-foreground transition hover:bg-muted"
      >
        {linkLabel}
        <ExternalLink className="size-3" />
      </a>
    )}
  </div>
);

const ImageArtifact = ({
  src,
  alt,
  meta,
}: {
  src: string;
  alt: string;
  meta: ArtifactMeta;
}) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <ArtifactCard title="이미지를 못 불러왔어…" description="잠시 뒤 다시 열어볼게." />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- API 스트림은 Next 이미지 최적화 대상이 아니다
    <img
      src={src}
      alt={alt}
      width={meta.width ?? undefined}
      height={meta.height ?? undefined}
      loading="lazy"
      decoding="async"
      className="h-auto w-full bg-muted/40"
      onError={() => setFailed(true)}
    />
  );
};

export const ArtifactBlock = ({ spec }: { spec: ArtifactSpec }) => {
  const query = useQuery({
    queryKey: ["artifact", spec.id],
    queryFn: () => fetchArtifactMeta(spec.id),
    staleTime: Infinity,
  });

  if (query.isPending) return <ArtifactSkeleton />;
  if (query.isError) throw query.error;

  const meta = query.data;
  if (!meta) {
    return (
      <ArtifactCard
        title="이 블록은 사라졌어…"
        description="보낸 사람에게 다시 만들어 달라고 해볼까?"
      />
    );
  }

  const url = `/api/artifacts/${meta.id}`;
  const alt = spec.caption ?? meta.caption ?? "그림";

  if (meta.kind === "html" || meta.mime === "text/html") {
    return (
      <ArtifactCard
        title="미리보기를 지원하지 않아"
        description="HTML 아티팩트는 다음 단계에서 안전하게 열 수 있게 준비할게."
        href={url}
        linkLabel="새 탭에서 열기"
      />
    );
  }

  if (meta.kind === "glb" || meta.mime === "model/gltf-binary") {
    return (
      <ArtifactCard
        title="미리보기를 지원하지 않아"
        description="3D 파일은 아직 여기서 그리지 못해."
        href={url}
        linkLabel="파일 열기"
      />
    );
  }

  if (meta.kind === "video" || meta.mime.startsWith("video/")) {
    return (
      <VideoPlayer
        sources={[{ src: url, type: meta.mime }]}
        poster={meta.posterUrl}
        width={meta.width}
        height={meta.height}
        loop={spec.loop}
        autoplay={spec.autoplay}
        label="영상"
        fallback={
          <ArtifactCard
            title="이 영상을 못 불러왔어…"
            description="잠시 뒤 다시 열어볼게."
          />
        }
      />
    );
  }

  return <ImageArtifact src={url} alt={alt} meta={meta} />;
};
