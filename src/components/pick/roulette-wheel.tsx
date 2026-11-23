"use client";

import { motion, useReducedMotion } from "motion/react";

/** 칸 색 — DESIGN.md 팔레트에서 진한 색과 옅은 색을 번갈아 쓴다. */
const SLICE_COLORS = [
  { fill: "#d96c75", text: "#fdf6f5" },
  { fill: "#f7e8e5", text: "#141312" },
  { fill: "#b85d65", text: "#fdf6f5" },
  { fill: "#f0b7b9", text: "#141312" },
  { fill: "#c25660", text: "#fdf6f5" },
  { fill: "#f0dbd7", text: "#141312" },
] as const;

const SPIN_SECONDS = 4.2;
const REDUCED_SPIN_SECONDS = 0.3;
/** 한 번 돌릴 때 최소 몇 바퀴를 도는지 */
const FULL_TURNS = 6;
const RADIUS = 100;
const LABEL_RADIUS = 60;

/** 이웃한 칸이 같은 색이 되지 않게 — 마지막 칸이 첫 칸과 겹치면 다른 색을 고른다. */
const sliceColors = (count: number) => {
  const colors = Array.from(
    { length: count },
    (_, i) => SLICE_COLORS[i % SLICE_COLORS.length]
  );
  if (count > 2 && colors[count - 1] === colors[0]) {
    colors[count - 1] =
      SLICE_COLORS.find((c) => c !== colors[0] && c !== colors[count - 2]) ??
      colors[count - 1];
  }
  return colors;
};

/** 위쪽(12시)에서 시계 방향으로 잰 각도의 원 위 점 */
const point = (deg: number, r = RADIUS) => {
  const rad = (deg * Math.PI) / 180;
  return `${(r * Math.sin(rad)).toFixed(3)} ${(-r * Math.cos(rad)).toFixed(3)}`;
};

const slicePath = (start: number, end: number) =>
  `M 0 0 L ${point(start)} A ${RADIUS} ${RADIUS} 0 ${end - start > 180 ? 1 : 0} 1 ${point(end)} Z`;

const shortLabel = (label: string, count: number) => {
  const max = count <= 4 ? 9 : count <= 8 ? 7 : 5;
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
};

/**
 * 바늘(12시)이 `index`번째 칸 안을 가리키게 하는 회전 각도.
 * 칸 가운데에서 조금 비켜 멈춰야 진짜 돌림판처럼 보인다. `jitter`는 -1~1.
 */
export const restingRotation = (index: number, count: number, jitter = 0) => {
  const slice = 360 / count;
  const target = index * slice + slice / 2 + jitter * slice * 0.35;
  return (360 - target) % 360;
};

/** 지금 각도에서 시계 방향으로 몇 바퀴 더 돌아 `index`번째 칸에 멈추는 각도 */
export const spinRotation = (from: number, index: number, count: number) => {
  const rest = restingRotation(index, count, Math.random() * 2 - 1);
  const delta = (((rest - from) % 360) + 360) % 360;
  return from + FULL_TURNS * 360 + delta;
};

interface Props {
  labels: string[];
  rotation: number;
  /** true면 rotation까지 돌아가는 애니메이션을 보여 준다. false면 바로 그 각도에 둔다. */
  spinning: boolean;
  onSpinEnd?: () => void;
  highlightIndex?: number | null;
}

export const RouletteWheel = ({
  labels,
  rotation,
  spinning,
  onSpinEnd,
  highlightIndex = null,
}: Props) => {
  const reduceMotion = useReducedMotion();
  const count = labels.length;
  const colors = sliceColors(count);
  const slice = count > 0 ? 360 / count : 360;
  const fontSize = count <= 4 ? 11 : count <= 8 ? 9.5 : 8;

  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[320px]"
      role="img"
      aria-label={count >= 2 ? `룰렛: 후보 ${count}개` : "룰렛: 후보를 기다리는 중"}
    >
      {/* 바늘 */}
      <div className="absolute top-0 left-1/2 z-10 -translate-x-1/2 -translate-y-1">
        <div className="size-0 border-x-[11px] border-t-[18px] border-x-transparent border-t-ink drop-shadow" />
      </div>
      {/*
       * SVG 안의 <g>를 돌리면 브라우저마다 회전 중심(transform-box)이 달라 판이 밀려난다.
       * 그래서 판 전체를 HTML 요소로 감싸 가운데를 축으로 돌린다.
       */}
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={{ rotate: rotation }}
        transition={
          spinning
            ? {
                duration: reduceMotion ? REDUCED_SPIN_SECONDS : SPIN_SECONDS,
                ease: [0.15, 0.6, 0.12, 1],
              }
            : { duration: 0 }
        }
        onAnimationComplete={() => spinning && onSpinEnd?.()}
      >
        <svg viewBox="-104 -104 208 208" className="size-full drop-shadow-sm">
          <circle r={103} className="fill-canvas-strong" />
          {count < 2 ? (
            <circle r={RADIUS} fill="#f7e8e5" />
          ) : (
            labels.map((label, i) => {
              const start = i * slice;
              const mid = start + slice / 2;
              const dim = highlightIndex !== null && highlightIndex !== i;
              return (
                <g key={`${i}-${label}`} data-slice={label} opacity={dim ? 0.45 : 1}>
                  <path
                    d={slicePath(start, start + slice)}
                    fill={colors[i].fill}
                    stroke="#fdf6f5"
                    strokeWidth={1.2}
                  />
                  {/* 글자는 반지름을 따라 쓰고, 왼쪽 절반은 뒤집혀 보이지 않게 반대로 돌린다. */}
                  <g
                    transform={`rotate(${mid}) translate(0 ${-LABEL_RADIUS}) rotate(${mid > 180 ? 90 : -90})`}
                  >
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={colors[i].text}
                      fontSize={fontSize}
                      fontWeight={600}
                    >
                      {shortLabel(label, count)}
                    </text>
                  </g>
                </g>
              );
            })
          )}
        </svg>
      </motion.div>
      {count >= 2 && (
        <svg
          viewBox="-104 -104 208 208"
          className="pointer-events-none absolute inset-0 size-full"
          aria-hidden
        >
          <circle r={13} fill="#fdf6f5" stroke="#e8d6d3" strokeWidth={1.5} />
          <circle r={4.5} fill="#d96c75" />
        </svg>
      )}
      {count < 2 && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-16 text-center text-[13px] text-muted">
          후보를 2개 이상 넣으면 돌릴 수 있어요
        </p>
      )}
    </div>
  );
};
