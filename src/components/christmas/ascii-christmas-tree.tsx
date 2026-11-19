"use client";

import { useEffect, useRef } from "react";

import { createGlyphPainter } from "@/lib/christmas/glyph-painter";
import { buildTreeModel, type TreeModel } from "@/lib/christmas/tree-model";
import {
  createFrameBuffer,
  createSky,
  renderTreeFrame,
  stepSnow,
  type FrameBuffer,
  type Sky,
} from "@/lib/christmas/tree-renderer";

interface Props {
  playing: boolean;
  className?: string;
}

/** 원본처럼 초당 30프레임으로 그린다 */
const FRAME_MS = 1000 / 30;

/** 점 구름은 한 번만 만든다 (페이지를 다시 열어도 재사용) */
let cachedModel: TreeModel | null = null;
const getModel = () => (cachedModel ??= buildTreeModel());

/**
 * 빙글빙글 도는 ASCII 크리스마스 트리.
 * 계산은 `tree-renderer`, 칠하기는 `glyph-painter`가 하고, 여기서는 크기와 시간만 관리한다.
 */
export const AsciiChristmasTree = ({ playing, className }: Props) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playingRef = useRef(playing);
  const redrawRef = useRef<() => void>(() => {});

  useEffect(() => {
    playingRef.current = playing;
    if (!playing) redrawRef.current();
  }, [playing]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const painter = createGlyphPainter(canvas);
    if (!painter) return;
    const model = getModel();

    let grid = painter.resize(1, 1);
    let fb: FrameBuffer = createFrameBuffer(1, 1);
    let sky: Sky = createSky(1);
    let time = 0;
    let last = performance.now();
    let sinceDraw = FRAME_MS;
    let raf = 0;

    const draw = () => {
      renderTreeFrame(model, fb, { cellW: grid.cellW, cellH: grid.cellH, time, sky });
      painter.paint(fb);
    };
    redrawRef.current = draw;

    const resize = () => {
      const { width, height } = wrap.getBoundingClientRect();
      if (width < 1 || height < 1) return;
      grid = painter.resize(width, height);
      fb = createFrameBuffer(grid.cols, grid.rows);
      sky = createSky(grid.cols * grid.rows);
      draw();
    };

    const tick = (now: number) => {
      // 탭을 오래 비웠다 돌아와도 한 번에 크게 튀지 않게 한다
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (playingRef.current) {
        time += dt;
        stepSnow(sky, dt);
        sinceDraw += dt * 1000;
        if (sinceDraw >= FRAME_MS) {
          sinceDraw = 0;
          draw();
        }
      }
      raf = requestAnimationFrame(tick);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      redrawRef.current = () => {};
    };
  }, []);

  return (
    <div ref={wrapRef} className={className}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="눈 내리는 밤, 빙글빙글 도는 ASCII 크리스마스 트리"
        className="block"
      />
    </div>
  );
};
