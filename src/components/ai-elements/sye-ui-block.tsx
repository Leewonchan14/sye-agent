"use client";

import { Component, type ReactNode } from "react";

import type { SyeUiSpec } from "@/lib/ui/spec";
import { ArtifactBlock } from "./artifact-block";
import { MotionBlock } from "./motion-block";
import { Scene3dBlock } from "./scene3d-block";
import { SvgBlock } from "./svg-block";

const KIND_LABEL: Record<SyeUiSpec["kind"], string> = {
  svg: "SVG",
  motion: "MOTION",
  scene3d: "3D",
  artifact: "ARTIFACT",
};

class BlockErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 bg-muted/40 px-4 text-center">
          <p className="text-[13px] text-foreground">이 블록은 못 그렸어…</p>
          <p className="text-[11px] text-muted-foreground">다음에 다시 시도해볼게!</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export const SyeUiBlock = ({ spec }: { spec: SyeUiSpec }) => (
  <figure className="relative my-3 w-full overflow-hidden rounded-xl border border-border/60 bg-card">
    <span className="pointer-events-none absolute top-2 right-2 z-10 rounded-full border border-border/60 bg-background/85 px-2 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground backdrop-blur">
      {KIND_LABEL[spec.kind]}
    </span>
    <BlockErrorBoundary>
      {spec.kind === "svg" && <SvgBlock spec={spec} />}
      {spec.kind === "motion" && <MotionBlock spec={spec} />}
      {spec.kind === "scene3d" && <Scene3dBlock spec={spec} />}
      {spec.kind === "artifact" && <ArtifactBlock spec={spec} />}
    </BlockErrorBoundary>
    {spec.caption && (
      <figcaption className="line-clamp-2 border-t border-border/60 px-3 py-2 text-[12px] leading-snug text-muted-foreground">
        {spec.caption}
      </figcaption>
    )}
  </figure>
);
