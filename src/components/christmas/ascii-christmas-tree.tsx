"use client";

import { useEffect, useRef } from "react";

import { createSnow, renderTreeFrame, stepSnow } from "@/lib/christmas/ascii-tree";

interface Props {
  playing: boolean;
  snowing: boolean;
  className?: string;
}

const FONT_FAMILY = '"JetBrains Mono", "Geist Mono", ui-monospace, Menlo, monospace';
const LINE_HEIGHT = 1.15;
const SNOW_PER_CELL = 1 / 55;

/** 화면 폭에 따라 글자 크기를 고른다. 좁은 화면에서도 트리가 40줄 안팎으로 보이게 한다. */
const pickFontSize = (width: number) => (width < 420 ? 9 : width < 720 ? 11 : 13);

/**
 * 회전하는 ASCII 크리스마스 트리를 캔버스에 그린다.
 * 프레임 계산은 `renderTreeFrame`이 하고, 여기서는 크기 맞추기와 글자 칠하기만 한다.
 */
export const AsciiChristmasTree = ({ playing, snowing, className }: Props) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playingRef = useRef(playing);
  const snowingRef = useRef(snowing);
  const redrawRef = useRef<() => void>(() => {});

  useEffect(() => {
    playingRef.current = playing;
    snowingRef.current = snowing;
  }, [playing, snowing]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!wrap || !canvas || !ctx) return;

    let cols = 0;
    let rows = 0;
    let fontSize = 13;
    let cellW = 8;
    let cellH = 15;
    let snow = createSnow(0);
    let time = 0;
    let last = performance.now();
    let raf = 0;

    const resize = () => {
      const { width, height } = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      fontSize = pickFontSize(width);
      ctx.font = `${fontSize}px ${FONT_FAMILY}`;
      cellW = ctx.measureText("M").width;
      cellH = fontSize * LINE_HEIGHT;
      cols = Math.max(1, Math.floor(width / cellW));
      rows = Math.max(1, Math.floor(height / cellH));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      snow = createSnow(Math.round(cols * rows * SNOW_PER_CELL));
      draw();
    };

    const draw = () => {
      const frame = renderTreeFrame({
        cols,
        rows,
        time,
        cellAspect: cellH / cellW,
        snow: snowingRef.current ? snow : [],
      });
      const { width, height } = wrap.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);
      ctx.font = `${fontSize}px ${FONT_FAMILY}`;
      ctx.textBaseline = "top";
      // 글자 묶음 전체를 가운데에 둔다
      const offsetX = (width - cols * cellW) / 2;
      const offsetY = (height - rows * cellH) / 2;
      let currentColor = "";
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const idx = y * cols + x;
          const color = frame.colors[idx];
          if (!color) continue;
          if (color !== currentColor) {
            ctx.fillStyle = color;
            currentColor = color;
          }
          ctx.fillText(frame.chars[idx], offsetX + x * cellW, offsetY + y * cellH);
        }
      }
    };

    redrawRef.current = draw;

    const tick = (now: number) => {
      // 탭을 오래 비웠다 돌아와도 한 번에 크게 튀지 않게 한다
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (playingRef.current) {
        time += dt;
        if (snowingRef.current) stepSnow(snow, dt);
        draw();
      }
      raf = requestAnimationFrame(tick);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    // 웹폰트가 늦게 오면 글자 폭이 바뀌므로 다시 잰다
    void document.fonts?.ready.then(resize);
    resize();
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  // 멈춘 상태에서 눈 토글을 바꾸면 바로 반영되도록 한 번 다시 그린다
  useEffect(() => {
    if (!playing) redrawRef.current();
  }, [playing, snowing]);

  return (
    <div ref={wrapRef} className={className}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="빙글빙글 도는 ASCII 크리스마스 트리"
        className="block"
      />
    </div>
  );
};
