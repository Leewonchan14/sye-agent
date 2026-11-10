"use client";

import { cn } from "@/lib/utils";
import type React from "react";
import Zoom, { type UncontrolledProps } from "react-medium-image-zoom";

export interface ImageZoomProps extends Omit<React.ComponentProps<"img">, "children"> {
  /**
   * Custom trigger. Zoom finds the first `img`, `svg`, `[role="img"]`, or `[data-zoom]`.
   */
  children?: React.ReactNode;
  /**
   * Props for `react-medium-image-zoom`.
   */
  rmiz?: Omit<UncontrolledProps, "children" | "zoomImg">;
  /**
   * Image props when zoomed. Defaults to the trigger `src`.
   */
  zoomInProps?: React.ComponentProps<"img">;
}

export const ImageZoom = (props: ImageZoomProps) => {
  const {
    alt = "",
    children,
    className,
    height,
    rmiz,
    width,
    zoomInProps,
    ...rest
  } = props;
  const src = typeof rest.src === "string" ? rest.src : undefined;
  const zoomImg =
    src === undefined && zoomInProps === undefined ? undefined : { src, ...zoomInProps };

  return (
    <Zoom wrapElement="span" zoomMargin={20} {...rmiz} zoomImg={zoomImg}>
      {children ?? (
        <img
          alt={alt}
          className={cn("h-auto w-full", className)}
          height={height}
          width={width}
          {...rest}
        />
      )}
    </Zoom>
  );
};
