"use client";

import { useCallback, useState, type PointerEvent, type ReactNode } from "react";

import { formatCompactWon } from "@/lib/ledger/format";
import { cn } from "@/lib/utils";

export type TrendPoint = { date: string; value: number };

interface Props {
  title: string;
  ariaLabel: string;
  points: TrendPoint[];
  /** 선 위에 찍을 점. title은 마우스를 올렸을 때 보인다. */
  dots?: { index: number; title: string }[];
  /** 제목 옆에 놓는 보기 전환 버튼 */
  controls?: ReactNode;
  /** 아무 지점도 고르지 않았을 때 오른쪽에 보이는 문구 */
  idleText: string;
  formatPoint: (point: TrendPoint) => string;
}

const HEIGHT = 200;
const LEFT = 44;
const RIGHT = 10;
const TOP = 12;
const BOTTOM = 22;

/** 22,000 → 2.2만, 음수는 -2.2만 */
export const compactWon = (value: number): string => {
  const rounded = Math.round(value);
  return rounded < 0
    ? `-${formatCompactWon(Math.abs(rounded))}`
    : formatCompactWon(rounded);
};

export const shortDate = (date: string): string => date.slice(5).replace("-", ".");

/** 0을 포함하는 눈금. 간격은 1·2·5 단위로 맞춘다. */
const buildScale = (values: number[]) => {
  const rawMin = Math.min(...values, 0);
  const rawMax = Math.max(...values, 0);
  const roughStep = Math.max(rawMax - rawMin, 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const step =
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const yMin = Math.floor(rawMin / step) * step;
  const yMax = Math.max(Math.ceil(rawMax / step) * step, yMin + step);
  const tickCount = Math.round((yMax - yMin) / step);
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => yMax - index * step);
  return { yMin, yMax, ticks };
};

/**
 * 원 단위 값을 그리는 선 그래프. 글자가 휴대폰에서 줄어들지 않도록 카드 폭을 재서
 * 실제 픽셀 크기로 그린다.
 */
export const TrendChart = ({
  title,
  ariaLabel,
  points,
  dots = [],
  controls,
  idleText,
  formatPoint,
}: Props) => {
  const [width, setWidth] = useState(640);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const measure = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const plotWidth = Math.max(width - LEFT - RIGHT, 1);
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const baseline = TOP + plotHeight;
  const { yMin, yMax, ticks } = buildScale(points.map((point) => point.value));

  const xAt = (index: number) =>
    points.length <= 1
      ? LEFT + plotWidth / 2
      : LEFT + (index / (points.length - 1)) * plotWidth;
  const yAt = (value: number) => TOP + ((yMax - value) / (yMax - yMin)) * plotHeight;

  const coords = points.map((point, index) => `${xAt(index)},${yAt(point.value)}`);
  const onlyY = yAt(points[0]?.value ?? 0);
  const linePath =
    points.length <= 1
      ? `M ${LEFT} ${onlyY} L ${LEFT + plotWidth} ${onlyY}`
      : `M ${coords.join(" L ")}`;
  const areaPath = `${linePath} L ${LEFT + plotWidth} ${baseline} L ${LEFT} ${baseline} Z`;

  const labelIndices = Array.from(
    new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])
  );

  const selectAt = (event: PointerEvent<SVGSVGElement>) => {
    if (!points.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = (x - LEFT) / plotWidth;
    const index = Math.round(ratio * (points.length - 1));
    setActiveIndex(Math.min(Math.max(index, 0), points.length - 1));
  };

  // 터치는 손을 떼면 바로 leave가 오므로, 읽을 수 있게 고른 지점을 남겨 둔다.
  const clearOnMouseLeave = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "mouse") setActiveIndex(null);
  };

  const activePoint = activeIndex == null ? null : (points[activeIndex] ?? null);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex items-center gap-2">
          <p className="text-[12px] font-medium text-muted">{title}</p>
          {controls}
        </div>
        <p
          className={cn(
            "text-[11px] whitespace-nowrap tabular-nums",
            activePoint && "font-medium text-ink",
            !activePoint && "text-muted-soft"
          )}
        >
          {activePoint ? formatPoint(activePoint) : idleText}
        </p>
      </div>

      <div ref={measure} className="mt-2">
        <svg
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="block w-full touch-pan-y"
          role="img"
          aria-label={ariaLabel}
          onPointerDown={selectAt}
          onPointerMove={selectAt}
          onPointerLeave={clearOnMouseLeave}
        >
          <title>{ariaLabel}</title>
          {ticks.map((value) => {
            const y = yAt(value);
            return (
              <g key={value}>
                <line
                  x1={LEFT}
                  x2={LEFT + plotWidth}
                  y1={y}
                  y2={y}
                  stroke="var(--color-hairline-soft)"
                  strokeWidth={1}
                />
                <text
                  x={LEFT - 6}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={10}
                  fill="var(--color-muted-soft)"
                >
                  {compactWon(value)}
                </text>
              </g>
            );
          })}

          <path d={areaPath} fill="var(--color-primary)" opacity={0.12} />
          <path
            d={linePath}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {dots.map((dot) => {
            const point = points[dot.index];
            if (!point) return null;
            return (
              <circle
                key={point.date}
                cx={xAt(dot.index)}
                cy={yAt(point.value)}
                r={3.5}
                fill="var(--color-primary)"
                stroke="var(--color-surface)"
                strokeWidth={1.5}
              >
                <title>{dot.title}</title>
              </circle>
            );
          })}

          {labelIndices.map((index) => {
            const point = points[index];
            if (!point) return null;
            return (
              <text
                key={`label-${point.date}`}
                x={xAt(index)}
                y={HEIGHT - 6}
                textAnchor={
                  index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"
                }
                fontSize={10}
                fill="var(--color-muted-soft)"
              >
                {shortDate(point.date)}
              </text>
            );
          })}

          {activePoint && activeIndex != null && (
            <>
              <line
                x1={xAt(activeIndex)}
                x2={xAt(activeIndex)}
                y1={TOP}
                y2={baseline}
                stroke="var(--color-muted-soft)"
                strokeWidth={1}
              />
              <circle
                cx={xAt(activeIndex)}
                cy={yAt(activePoint.value)}
                r={4.5}
                fill="var(--color-primary)"
                stroke="var(--color-surface)"
                strokeWidth={2}
              />
            </>
          )}
        </svg>
      </div>
    </>
  );
};
