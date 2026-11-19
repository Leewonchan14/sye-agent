/**
 * 글자 격자(FrameBuffer)를 캔버스에 칠한다.
 *
 * 프레임마다 글자 만 개 가까이를 fillText로 그리면 느리므로, (글자, 색) 조합마다 한 번만
 * 글자 아틀라스에 그려두고 drawImage로 찍는다. 색은 채널당 5비트로 묶어 조합 수를 줄인다.
 * 마지막으로 작게 줄였다 키운 사본을 더해(lighter) 원본처럼 은은하게 번지는 빛을 낸다.
 */
import { GLYPHS, type FrameBuffer } from "@/lib/christmas/tree-renderer";

export const BACKGROUND = "#010611";

const FONT_FAMILY = 'ui-monospace, "JetBrains Mono", "SFMono-Regular", Menlo, monospace';
/** 원본처럼 가로로 160칸 안팎이 되게 글자 크기를 정한다 */
const TARGET_COLS = 160;
const LINE_HEIGHT = 1.08;
const ATLAS_SLOTS = 64;

export interface GridSize {
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
}

const makeCanvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
};

export const createGlyphPainter = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  let dpr = 1;
  let grid: GridSize = { cols: 1, rows: 1, cellW: 1, cellH: 1 };
  let font = "";
  let slotW = 1;
  let slotH = 1;
  let atlas = makeCanvas(1, 1);
  let atlasCtx = atlas.getContext("2d");
  let slots = new Map<number, number>();
  let sharp = makeCanvas(1, 1);
  let sharpCtx = sharp.getContext("2d");
  let bloomA = makeCanvas(1, 1);
  let bloomB = makeCanvas(1, 1);

  const resetAtlas = () => {
    atlas = makeCanvas(slotW * ATLAS_SLOTS, slotH * ATLAS_SLOTS);
    atlasCtx = atlas.getContext("2d");
    slots = new Map();
  };

  /** 캔버스 CSS 크기에 맞춰 격자를 다시 잡는다 */
  const resize = (width: number, height: number): GridSize => {
    dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.font = `600 100px ${FONT_FAMILY}`;
    const ratio = ctx.measureText("M").width / 100 || 0.6;
    const cellW = width / TARGET_COLS;
    const fontSize = cellW / ratio;
    const cellH = fontSize * LINE_HEIGHT;
    font = `600 ${fontSize * dpr}px ${FONT_FAMILY}`;
    grid = {
      cols: TARGET_COLS,
      rows: Math.max(1, Math.floor(height / cellH)),
      cellW,
      cellH,
    };
    slotW = Math.ceil(cellW * dpr) + 1;
    slotH = Math.ceil(cellH * dpr) + 1;
    resetAtlas();

    sharp = makeCanvas(canvas.width, canvas.height);
    sharpCtx = sharp.getContext("2d");
    bloomA = makeCanvas(Math.ceil(canvas.width / 4), Math.ceil(canvas.height / 4));
    bloomB = makeCanvas(Math.ceil(canvas.width / 10), Math.ceil(canvas.height / 10));
    return grid;
  };

  /** (글자, 색)을 아틀라스에 올리고 칸 번호를 돌려준다 */
  const slotFor = (g: number, rgb: number) => {
    const q = (((rgb >> 19) & 31) << 10) | (((rgb >> 11) & 31) << 5) | ((rgb >> 3) & 31);
    const key = (g << 15) | q;
    const found = slots.get(key);
    if (found !== undefined) return found;
    if (slots.size >= ATLAS_SLOTS * ATLAS_SLOTS) resetAtlas();
    const slot = slots.size;
    slots.set(key, slot);
    if (atlasCtx) {
      const sx = (slot % ATLAS_SLOTS) * slotW;
      const sy = Math.floor(slot / ATLAS_SLOTS) * slotH;
      const r = ((q >> 10) & 31) * 8 + 4;
      const gg = ((q >> 5) & 31) * 8 + 4;
      const b = (q & 31) * 8 + 4;
      atlasCtx.font = font;
      atlasCtx.textAlign = "center";
      atlasCtx.textBaseline = "middle";
      atlasCtx.fillStyle = `rgb(${r},${gg},${b})`;
      atlasCtx.fillText(GLYPHS[g], sx + slotW / 2, sy + slotH / 2);
    }
    return slot;
  };

  const paint = (fb: FrameBuffer) => {
    if (!sharpCtx) return;
    const { cols, rows, glyph, color } = fb;
    const w = canvas.width;
    const h = canvas.height;
    const cellW = grid.cellW * dpr;
    const cellH = grid.cellH * dpr;
    const offX = (w - cols * cellW) / 2;
    const offY = (h - rows * cellH) / 2;

    sharpCtx.clearRect(0, 0, w, h);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const g = glyph[idx];
        if (g === 0) continue;
        const slot = slotFor(g, color[idx]);
        sharpCtx.drawImage(
          atlas,
          (slot % ATLAS_SLOTS) * slotW,
          Math.floor(slot / ATLAS_SLOTS) * slotH,
          slotW,
          slotH,
          offX + c * cellW + (cellW - slotW) / 2,
          offY + r * cellH + (cellH - slotH) / 2,
          slotW,
          slotH
        );
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(sharp, 0, 0);

    // 번지는 빛: 작게 줄인 사본 두 개를 키워서 더한다
    const aCtx = bloomA.getContext("2d");
    const bCtx = bloomB.getContext("2d");
    if (aCtx && bCtx) {
      aCtx.clearRect(0, 0, bloomA.width, bloomA.height);
      aCtx.drawImage(sharp, 0, 0, bloomA.width, bloomA.height);
      bCtx.clearRect(0, 0, bloomB.width, bloomB.height);
      bCtx.drawImage(bloomA, 0, 0, bloomB.width, bloomB.height);
      ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.6;
      ctx.drawImage(bloomA, 0, 0, w, h);
      ctx.globalAlpha = 0.55;
      ctx.drawImage(bloomB, 0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  };

  return { resize, paint };
};
