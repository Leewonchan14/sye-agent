/**
 * 점 구름(`tree-model.ts`)을 글자 격자로 그린다.
 *
 * 매 프레임 트리를 y축으로 돌리고, 살짝 내려다보는 카메라로 투영한 뒤 칸마다 가장 가까운 점만
 * 남긴다(z-buffer). 빛을 받는 정도로 ` .:-=+*%@` 중 글자를 고르고, 색은 점의 색에 밝기를 곱한다.
 * 꼭대기 별과 빛줄기, 하늘의 별, 내리는 눈은 화면 공간에서 따로 얹는다.
 * DOM·캔버스와 상관없는 순수 계산이라 그리는 쪽은 결과(글자 번호·색)만 받아 칠한다.
 */
import { KIND, STAR_Y, type TreeModel } from "@/lib/christmas/tree-model";

/** 0번은 빈칸. 1~8번이 밝기 순서 */
export const GLYPHS = [
  " ",
  ".",
  ":",
  "-",
  "=",
  "+",
  "*",
  "%",
  "@",
  "#",
  "o",
  "|",
  "/",
  "\\",
];
const RAMP_FIRST = 1;
const RAMP_LAST = 8;
const G_DOT = 1;
const G_DASH = 3;
const G_PLUS = 5;
const G_STAR = 6;
const G_HASH = 9;
const G_O = 10;
const G_PIPE = 11;
const G_SLASH = 12;
const G_BACKSLASH = 13;

/** 칸에 무엇이 그려졌는지. 눈송이가 덮어도 되는 칸인지 가릴 때 쓴다 */
const LAYER_EMPTY = 0;
const LAYER_GROUND = 1;
const LAYER_SOLID = 2;

export interface FrameBuffer {
  cols: number;
  rows: number;
  /** 칸마다 GLYPHS 번호 */
  glyph: Uint8Array;
  /** 칸마다 0xRRGGBB */
  color: Uint32Array;
  depth: Float32Array;
  layer: Uint8Array;
}

export const createFrameBuffer = (cols: number, rows: number): FrameBuffer => ({
  cols,
  rows,
  glyph: new Uint8Array(cols * rows),
  color: new Uint32Array(cols * rows),
  depth: new Float32Array(cols * rows),
  layer: new Uint8Array(cols * rows),
});

/** 한 바퀴 20초 (초당 18°) */
export const ROTATION_SPEED = (18 * Math.PI) / 180;

/** 원본 화면 구도에 맞춘 카메라. focal은 화면 폭 기준 */
const CAMERA = {
  elevation: (9 * Math.PI) / 180,
  distance: 6,
  targetY: 1.25,
  focal: 1.7,
};
/** 카메라 구도를 맞춘 화면 비율 (세로/가로) */
export const FRAME_ASPECT = 1.2;

/** 카메라 기준 빛 방향(표면 → 빛). 왼쪽 위 앞에서 비춘다 */
const LIGHT = (() => {
  const v = [-0.5, 0.65, -0.6];
  const n = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / n, v[1] / n, v[2] / n];
})();
/** 하이라이트용 하프 벡터 (빛 + 시선) */
const HALF = (() => {
  const v = [LIGHT[0], LIGHT[1], LIGHT[2] - 1];
  const n = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / n, v[1] / n, v[2] / n];
})();

const pack = (r: number, g: number, b: number) =>
  (Math.min(255, Math.max(0, Math.round(r * 255))) << 16) |
  (Math.min(255, Math.max(0, Math.round(g * 255))) << 8) |
  Math.min(255, Math.max(0, Math.round(b * 255)));

/** 화면 비율에 상관없이 0~1로 흩어둔 하늘의 별과 눈송이 */
export interface Sky {
  stars: { x: number; y: number; bright: number; phase: number }[];
  snow: { x: number; y: number; speed: number; drift: number; big: boolean }[];
}

const seeded = (seed: number) => {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const createSky = (cells: number): Sky => {
  const rand = seeded(1225);
  return {
    stars: Array.from({ length: Math.round(cells / 40) }, () => ({
      x: rand(),
      y: rand() * 0.75,
      bright: rand(),
      phase: rand() * Math.PI * 2,
    })),
    snow: Array.from({ length: Math.round(cells / 90) }, () => ({
      x: rand(),
      y: rand(),
      speed: 0.025 + rand() * 0.045,
      drift: rand() * Math.PI * 2,
      big: rand() < 0.15,
    })),
  };
};

/** 눈송이를 dt초만큼 떨어뜨린다. 바닥 아래로 가면 맨 위로 돌려보낸다 */
export const stepSnow = (sky: Sky, dt: number) => {
  for (const f of sky.snow) {
    f.y += f.speed * dt;
    f.drift += dt * 0.7;
    f.x += Math.sin(f.drift) * 0.012 * dt;
    if (f.y > 1) {
      f.y -= 1;
      f.x = (f.x + 0.618) % 1;
    }
    f.x = (f.x + 1) % 1;
  }
};

interface RenderOptions {
  /** 칸 하나의 크기(px). 투영은 픽셀 단위로 하고 칸으로 나눈다 */
  cellW: number;
  cellH: number;
  time: number;
  sky: Sky;
}

/** (px, py)가 위를 향한 별 모양 안에 있는지 */
const insideStar = (px: number, py: number, outer: number) => {
  const r = Math.hypot(px, py);
  if (r > outer) return false;
  // 위쪽 꼭짓점이 0°가 되도록 각도를 잰다
  const a = Math.atan2(px, -py);
  const sector = (Math.PI * 2) / 5;
  const local = Math.abs((((a % sector) + sector) % sector) - sector / 2) / (sector / 2);
  const inner = outer * 0.42;
  // 꼭짓점(local=1)에서 outer, 오목한 곳(local=0)에서 inner
  return r <= inner + (outer - inner) * local;
};

export const renderTreeFrame = (
  model: TreeModel,
  fb: FrameBuffer,
  { cellW, cellH, time, sky }: RenderOptions
) => {
  const { cols, rows, glyph, color, depth, layer } = fb;
  glyph.fill(0);
  color.fill(0);
  depth.fill(0);
  layer.fill(LAYER_EMPTY);

  const width = cols * cellW;
  const height = rows * cellH;
  // 화면 비율이 원본과 달라도 트리가 잘리지 않게 맞춘다
  const F = CAMERA.focal * Math.min(width, height / FRAME_ASPECT);
  const cx = width / 2;
  const cy = height / 2;

  const angle = time * ROTATION_SPEED;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const cosE = Math.cos(CAMERA.elevation);
  const sinE = Math.sin(CAMERA.elevation);
  const D = CAMERA.distance;
  const ty = CAMERA.targetY;
  const [lx, ly, lz] = LIGHT;
  const [hx, hy, hz] = HALF;

  const { pos, nrm, col, albedo, shine, phase, kind, count } = model;

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const x = pos[i3];
    const z = pos[i3 + 2];
    const rx = x * cosA - z * sinA;
    const rz = x * sinA + z * cosA;
    const qy = pos[i3 + 1] - ty;
    const yc = qy * cosE + rz * sinE;
    const dep = -qy * sinE + rz * cosE + D;
    const ooz = 1 / dep;
    const c = Math.floor((cx + F * rx * ooz) / cellW);
    const r = Math.floor((cy - F * yc * ooz) / cellH);
    if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
    const idx = r * cols + c;
    const k = kind[i];
    // 전구와 구슬은 잎 사이로 살짝 비쳐 보이게 앞으로 당긴다
    const d = k === KIND.LIGHT ? ooz + 0.012 : k === KIND.BALL ? ooz + 0.004 : ooz;
    if (d <= depth[idx]) continue;
    depth[idx] = d;

    if (k === KIND.LIGHT) {
      const tw = 0.6 + 0.3 * Math.sin(time * 3.1 + phase[i]);
      glyph[idx] = G_O;
      color[idx] = pack(col[i3] * tw, col[i3 + 1] * tw, col[i3 + 2] * tw);
      layer[idx] = LAYER_SOLID;
      continue;
    }

    const nx0 = nrm[i3];
    const nz0 = nrm[i3 + 2];
    const nx = nx0 * cosA - nz0 * sinA;
    const nzr = nx0 * sinA + nz0 * cosA;
    const ny = nrm[i3 + 1] * cosE + nzr * sinE;
    const nz = -nrm[i3 + 1] * sinE + nzr * cosE;
    const diffuse = Math.max(0, nx * lx + ny * ly + nz * lz);
    let spec = 0;
    if (shine[i] > 0) {
      const h = Math.max(0, nx * hx + ny * hy + nz * hz);
      spec = shine[i] * h ** 24;
    }
    const intensity =
      k === KIND.GROUND
        ? albedo[i] * (0.6 + 0.4 * diffuse)
        : albedo[i] * (0.2 + 0.82 * diffuse) + spec * 0.5;
    const level = Math.min(
      RAMP_LAST,
      Math.max(RAMP_FIRST, RAMP_FIRST + Math.round(intensity * (RAMP_LAST - RAMP_FIRST)))
    );
    const b = 0.16 + 0.8 * Math.min(1, intensity);
    glyph[idx] = level;
    color[idx] = pack(
      col[i3] * b + spec * 0.35,
      col[i3 + 1] * b + spec * 0.35,
      col[i3 + 2] * b + spec * 0.35
    );
    layer[idx] = k === KIND.GROUND ? LAYER_GROUND : LAYER_SOLID;
  }

  // --- 꼭대기 별: 늘 정면을 보는 금색 별과 점선 빛줄기
  const starQy = STAR_Y - ty;
  const starDep = -starQy * sinE + D;
  const starX = cx;
  const starY = cy - (F * starQy * cosE) / starDep;
  const starR = (F * 0.13) / starDep;
  const pulse = 0.92 + 0.08 * Math.sin(time * 2.2);

  const put = (c: number, r: number, g: number, rgb: number) => {
    if (c < 0 || c >= cols || r < 0 || r >= rows) return;
    const idx = r * cols + c;
    glyph[idx] = g;
    color[idx] = rgb;
    layer[idx] = LAYER_SOLID;
  };

  // 빛줄기: 위쪽 각도(0°=위, 시계 방향), 길이(별 반지름 배수)
  const rays: [number, number][] = [
    [0, 2.9],
    [27, 2.7],
    [-27, 2.7],
    [90, 2.4],
    [-90, 2.4],
    [155, 2.2],
    [-155, 2.2],
    [180, 2.5],
  ];
  for (const [deg, len] of rays) {
    const a = (deg * Math.PI) / 180;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const g =
      Math.abs(dx) < 0.2
        ? G_PIPE
        : Math.abs(dy) < 0.2
          ? G_DASH
          : dx * dy < 0
            ? G_SLASH
            : G_BACKSLASH;
    const total = starR * len * pulse;
    const stepPx = Math.min(cellW, cellH) * 0.5;
    for (let s = starR * 0.9; s < total; s += stepPx) {
      // 점선: 마디마다 짧게 끊는다
      if (Math.floor(s / (cellH * 1.2)) % 3 === 2) continue;
      const fade = 1 - s / total;
      put(
        Math.floor((starX + dx * s) / cellW),
        Math.floor((starY + dy * s) / cellH),
        g,
        pack(0.95 * (0.45 + 0.55 * fade), 0.72 * (0.45 + 0.55 * fade), 0.25 * fade)
      );
    }
  }

  const c0 = Math.floor((starX - starR) / cellW);
  const c1 = Math.ceil((starX + starR) / cellW);
  const r0 = Math.floor((starY - starR) / cellH);
  const r1 = Math.ceil((starY + starR) / cellH);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const px = (c + 0.5) * cellW - starX;
      const py = (r + 0.5) * cellH - starY;
      if (!insideStar(px, py, starR)) continue;
      const glow = 1 - Math.hypot(px, py) / starR;
      put(c, r, G_HASH, pack(0.95 + 0.05 * glow, 0.72 + 0.18 * glow, 0.22 + 0.25 * glow));
    }
  }

  // --- 하늘의 별: 빈칸에만 희미하게 깜빡인다
  for (const s of sky.stars) {
    const c = Math.floor(s.x * cols);
    const r = Math.floor(s.y * rows);
    const idx = r * cols + c;
    if (layer[idx] !== LAYER_EMPTY) continue;
    const tw = 0.55 + 0.45 * Math.sin(time * 1.3 + s.phase);
    const v = (0.25 + 0.55 * s.bright) * tw;
    glyph[idx] = s.bright > 0.9 ? G_PLUS : G_DOT;
    color[idx] = pack(v * 0.85, v * 0.9, v);
  }

  // --- 내리는 눈: 하늘과 바닥 위에만 (트리 뒤로 지나간다)
  for (const f of sky.snow) {
    const c = Math.floor(f.x * cols);
    const r = Math.floor(f.y * rows);
    if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
    const idx = r * cols + c;
    if (layer[idx] === LAYER_SOLID) continue;
    glyph[idx] = f.big ? G_STAR : G_DOT;
    color[idx] = f.big ? pack(0.95, 0.97, 1) : pack(0.8, 0.84, 0.92);
  }
};

/** 디버그·테스트용: 프레임을 줄바꿈된 문자열로 */
export const frameToText = (fb: FrameBuffer) =>
  Array.from({ length: fb.rows }, (_, r) =>
    Array.from(fb.glyph.subarray(r * fb.cols, (r + 1) * fb.cols), (g) => GLYPHS[g]).join(
      ""
    )
  ).join("\n");
