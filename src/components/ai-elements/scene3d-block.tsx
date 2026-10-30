"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import type { Scene3dSpec } from "@/lib/ui/spec";

const SceneSkeleton = () => (
  <div className="flex h-full w-full items-center justify-center bg-muted/30 text-[12px] text-muted-foreground">
    조립 중…!
  </div>
);

const Scene3dCanvas = dynamic(
  () => import("./scene3d-canvas").then((mod) => mod.Scene3dCanvas),
  {
    ssr: false,
    loading: SceneSkeleton,
  }
);

export const Scene3dBlock = ({ spec }: { spec: Scene3dSpec }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setVisible(entry.isIntersecting);
      },
      { threshold: 0 }
    );

    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={hostRef} className="h-[280px] w-full sm:h-[320px]">
      {visible ? <Scene3dCanvas scene={spec.scene} /> : <SceneSkeleton />}
    </div>
  );
};
