"use client";

import { useCallback, useRef } from "react";

import type { SvgSpec } from "@/lib/ui/spec";

export const SvgBlock = ({ spec }: { spec: SvgSpec }) => {
  const objectUrlRef = useRef<string | null>(null);

  const attachImage = useCallback(
    (image: HTMLImageElement | null) => {
      if (!image) {
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
        return;
      }

      // Blob URL keeps the model-authored SVG in an image context: scripts and
      // event handlers inside it never execute, so no sanitizer is needed.
      const blob = new Blob([spec.svg], { type: "image/svg+xml" });
      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;
      image.src = objectUrl;
    },
    [spec.svg]
  );

  return (
    // eslint-disable-next-line @next/next/no-img-element -- blob URL, not a remote asset
    <img
      ref={attachImage}
      alt={spec.alt ?? spec.caption ?? "그림"}
      className="h-auto w-full"
    />
  );
};
