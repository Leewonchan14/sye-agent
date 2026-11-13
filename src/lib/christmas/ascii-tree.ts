/**
 * 회전하는 3D ASCII 크리스마스 트리.
 *
 * donut.c와 같은 방식이다. 트리 표면의 점을 촘촘히 뽑아 회전·투영하고, 칸마다 가장 가까운 점만
 * 남기는 z-buffer를 쓴다. 표면 법선과 빛의 내적(밝기)으로 ASCII 문자를 고른다.
 * DOM·캔버스와 상관없는 순수 함수라서 그리는 쪽(canvas)은 결과만 받아서 칠한다.
 */

export interface TreeFrame {
  cols: number;
  rows: number;
  /** 칸마다 문자. 빈칸은 " " */
  chars: string[];
  /** 칸마다 색. 빈칸은 null */
  colors: (string | null)[];
}

export interface Snowflake {
  /** 0~1, 화면 가로 위치 */
  x: number;
  /** 0~1, 화면 세로 위치 */
  y: number;
  speed: number;
  drift: number;
  big: boolean;
}

interface RenderOptions {
  cols: number;
  rows: number;
  /** 초 단위 시간. 회전·반짝임이 모두 이 값에서 나온다. */
  time: number;
  /** 글자 한 칸의 세로/가로 비율 (보통 2 안팎) */
  cellAspect: number;
  snow?: Snowflake[];
}

/** 어두운 것 → 밝은 것 */
const RAMP = ".,-~:;=!*#$@";

const NEEDLE_COLORS = [
  "#1d4a33",
  "#215438",
  "#255f3e",
  "#2a6a44",
  "#2f764b",
  "#358252",
  "#3c8e5a",
  "#459b63",
  "#52a86e",
  "#62b67b",
  "#76c48b",
  "#8fd3a0",
];
const ORNAMENT_COLORS = ["#e5484d", "#f0b7b9", "#d96c75", "#ffd27a", "#9ccaff"];
const GARLAND_COLOR = "#ffe8a3";
const GARLAND_DIM = "#b39b5c";
const TRUNK_COLOR = "#8a5a3c";
const STAR_COLOR = "#ffd54a";
const SNOW_COLOR = "rgba(253, 246, 245, 0.85)";
const SNOW_DIM = "rgba(253, 246, 245, 0.45)";
const GREETING_COLOR = "#f0b7b9";

const TIERS = 4;
const MAX_RADIUS = 0.78;
const TREE_BOTTOM = -1;
const TREE_TOP = 1;
const TRUNK_BOTTOM = -1.42;
const TRUNK_RADIUS = 0.13;
const CAMERA_DISTANCE = 5;
const TILT = 0.2;
const ROTATION_SPEED = 0.55;
const GARLAND_TURNS = 3.25;

/** 왼쪽 위에서 비추는 빛. 옆에서 비춰야 오른쪽으로 갈수록 어두워져 입체감이 난다 */
const LIGHT = (() => {
  const v = [-0.9, 0.45, -0.35];
  const n = Math.hypot(v[0], v[1], v[2]);
  return v.map((c) => c / n) as [number, number, number];
})();

/** 높이 비율 h(0=아래, 1=꼭대기)에서 트리 반지름. 층마다 아래가 넓게 퍼진다. */
export const treeRadius = (h: number) => {
  const tierPos = Math.min(h * TIERS, TIERS - 1e-6);
  const f = tierPos - Math.floor(tierPos);
  const envelope = 1 - h * 0.92;
  return MAX_RADIUS * envelope * (0.3 + 0.7 * (1 - f));
};

/** 결정적 의사 난수 (mulberry32). 장식 위치가 프레임마다 바뀌지 않게 한다. */
const mulberry32 = (seed: number) => {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

interface Ornament {
  h: number;
  theta: number;
  color: string;
  phase: number;
}

const ORNAMENTS: Ornament[] = (() => {
  const rand = mulberry32(1225);
  return Array.from({ length: 34 }, (_, i) => ({
    h: 0.06 + rand() * 0.8,
    theta: rand() * Math.PI * 2,
    color: ORNAMENT_COLORS[i % ORNAMENT_COLORS.length],
    phase: rand() * Math.PI * 2,
  }));
})();

/** 바늘잎 질감용 해시 노이즈 (-0.5~0.5) */
const needleNoise = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s) - 0.5;
};

export const createSnow = (count: number, seed = 24): Snowflake[] => {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    x: rand(),
    y: rand(),
    speed: 0.04 + rand() * 0.08,
    drift: rand() * Math.PI * 2,
    big: rand() < 0.2,
  }));
};

/** 눈송이를 dt초만큼 떨어뜨린다. 바닥을 지나면 위로 돌려보낸다. */
export const stepSnow = (snow: Snowflake[], dt: number) => {
  for (const f of snow) {
    f.y += f.speed * dt;
    f.drift += dt * 0.8;
    f.x += Math.sin(f.drift) * 0.004 * dt * 10;
    if (f.y > 1) {
      f.y -= 1;
      f.x = (f.x + 0.37) % 1;
    }
    if (f.x < 0) f.x += 1;
    if (f.x > 1) f.x -= 1;
  }
};

export const renderTreeFrame = ({
  cols,
  rows,
  time,
  cellAspect,
  snow = [],
}: RenderOptions): TreeFrame => {
  const size = cols * rows;
  const chars: string[] = new Array(size).fill(" ");
  const colors: (string | null)[] = new Array(size).fill(null);
  const depth = new Float32Array(size);

  if (cols < 8 || rows < 8) return { cols, rows, chars, colors };

  // 별(꼭대기 위 0.4) ~ 줄기 끝을 세로에 맞추고, 위 1줄·아래(눈더미+인사말) 5줄을 남긴다.
  // 폭은 가로를 넘지 않게 한다.
  const totalHeight = TREE_TOP + 0.4 - TRUNK_BOTTOM;
  const scaleByRows = (rows - 5) / totalHeight;
  const scaleByCols = (cols * 0.9) / (2 * MAX_RADIUS * cellAspect);
  const unit = Math.min(scaleByRows, scaleByCols);
  const scale = unit * CAMERA_DISTANCE;
  const cx = cols / 2;
  // 트리+눈더미+인사말 묶음을 세로 가운데에 둔다.
  const topPad = Math.max(1, (rows - (unit * totalHeight + 4)) / 2);
  const cy = topPad + unit * (TREE_TOP + 0.4);

  const angle = time * ROTATION_SPEED;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const cosT = Math.cos(TILT);
  const sinT = Math.sin(TILT);

  /** 월드 좌표를 회전(y축)·기울임(x축, 카메라가 살짝 내려다본다)한 뒤 화면 칸으로 투영한다 */
  const project = (x: number, y: number, z: number, spin = true) => {
    const rx = spin ? x * cosA - z * sinA : x;
    const rz = spin ? x * sinA + z * cosA : z;
    // 먼 쪽(rz>0)이 화면 위로 올라가야 위에서 내려다보는 시점이 된다
    const ty = y * cosT + rz * sinT;
    const tz = -y * sinT + rz * cosT;
    const ooz = 1 / (tz + CAMERA_DISTANCE);
    return {
      sx: Math.floor(cx + scale * cellAspect * rx * ooz),
      sy: Math.floor(cy - scale * ty * ooz),
      ooz,
    };
  };

  /** 월드 좌표 한 점을 투영해 z-buffer에 쓴다. 쓰였으면 true */
  const plot = (
    x: number,
    y: number,
    z: number,
    ch: string,
    color: string,
    bias = 0
  ): boolean => {
    const { sx, sy, ooz } = project(x, y, z);
    if (sx < 0 || sx >= cols || sy < 0 || sy >= rows) return false;
    const idx = sy * cols + sx;
    const d = ooz + bias;
    if (d <= depth[idx]) return false;
    depth[idx] = d;
    chars[idx] = ch;
    colors[idx] = color;
    return true;
  };

  /** 법선을 화면 공간으로 돌려 빛과의 내적을 구한다 */
  const lightAt = (nx: number, ny: number, nz: number) => {
    const rx = nx * cosA - nz * sinA;
    const rz = nx * sinA + nz * cosA;
    const ty = ny * cosT + rz * sinT;
    const tz = -ny * sinT + rz * cosT;
    return rx * LIGHT[0] + ty * LIGHT[1] + tz * LIGHT[2];
  };

  // 화면 크기에 맞춰 표본 밀도를 정한다. 칸보다 촘촘해야 구멍이 안 생긴다.
  const hSteps = Math.ceil(rows * 3.2);
  const thetaSteps = Math.ceil(cols * 4);

  // 1) 바늘잎 표면
  for (let i = 0; i <= hSteps; i++) {
    const h = i / hSteps;
    const r = treeRadius(h);
    const y = TREE_BOTTOM + (TREE_TOP - TREE_BOTTOM) * h;
    const steps = Math.max(12, Math.ceil(thetaSteps * (r / MAX_RADIUS)));
    for (let j = 0; j < steps; j++) {
      const theta = (j / steps) * Math.PI * 2;
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      const noise = needleNoise(h * 40, theta * 6);
      const rr = r * (1 + noise * 0.06);
      // 원뿔 법선: 바깥 방향 + 위쪽 성분
      const lum = lightAt(c * 0.82, 0.57, s * 0.82) + noise * 0.3;
      const level = Math.max(
        0,
        Math.min(RAMP.length - 1, Math.round(((lum + 0.75) / 1.7) * 11))
      );
      plot(rr * c, y, rr * s, RAMP[level], NEEDLE_COLORS[level]);
    }
  }

  // 2) 줄기
  const trunkSteps = Math.ceil(rows * 0.6);
  for (let i = 0; i <= trunkSteps; i++) {
    const y = TRUNK_BOTTOM + (TREE_BOTTOM - TRUNK_BOTTOM) * (i / trunkSteps);
    for (let j = 0; j < 48; j++) {
      const theta = (j / 48) * Math.PI * 2;
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      const lum = lightAt(c, 0, s);
      plot(
        TRUNK_RADIUS * c,
        y,
        TRUNK_RADIUS * s,
        lum > 0.35 ? "#" : lum > 0 ? "=" : ":",
        TRUNK_COLOR
      );
    }
  }

  // 3) 가랜드: 나선을 따라 빛이 흘러간다
  const garlandSteps = Math.ceil(rows * 26);
  for (let g = 0; g < 2; g++) {
    for (let i = 0; i <= garlandSteps; i++) {
      const sPos = i / garlandSteps;
      const h = 0.03 + sPos * 0.86;
      const theta = sPos * Math.PI * 2 * GARLAND_TURNS + g * Math.PI;
      const r = treeRadius(h) * 0.96 + 0.035;
      const y = TREE_BOTTOM + (TREE_TOP - TREE_BOTTOM) * h;
      const glow = 0.5 + 0.5 * Math.sin(sPos * 60 - time * 5 + g * 2);
      plot(
        r * Math.cos(theta),
        y,
        r * Math.sin(theta),
        glow > 0.7 ? "*" : glow > 0.35 ? "+" : "~",
        glow > 0.35 ? GARLAND_COLOR : GARLAND_DIM,
        0.002
      );
    }
  }

  // 4) 오너먼트: 한 칸짜리 구슬. 깜빡이며 모양이 바뀐다
  for (const o of ORNAMENTS) {
    const r = treeRadius(o.h) * 0.94 + 0.05;
    const y = TREE_BOTTOM + (TREE_TOP - TREE_BOTTOM) * o.h;
    const blink = Math.sin(time * 2.4 + o.phase);
    plot(
      r * Math.cos(o.theta),
      y,
      r * Math.sin(o.theta),
      blink > 0.6 ? "@" : blink > -0.4 ? "O" : "o",
      o.color,
      0.004
    );
  }

  // 5) 꼭대기 별: 회전과 상관없이 항상 정면을 본다
  const { sx: starX, sy: starY } = project(0, TREE_TOP + 0.06, 0, false);
  const twinkle = Math.sin(time * 3) > 0;
  const starArt = twinkle ? ["\\ | /", "-=*=-", "/ | \\"] : [" .|. ", "--@--", " '|' "];
  starArt.forEach((line, dy) => {
    const y = starY - 1 + dy;
    if (y < 0 || y >= rows) return;
    [...line].forEach((ch, dx) => {
      const x = starX - 2 + dx;
      if (ch === " " || x < 0 || x >= cols) return;
      const idx = y * cols + x;
      chars[idx] = ch;
      colors[idx] = STAR_COLOR;
    });
  });

  // 6) 바닥 눈더미와 인사말
  const groundY = project(0, TRUNK_BOTTOM, 0, false).sy + 1;
  if (groundY < rows) {
    const half = Math.min(Math.floor(cols * 0.36), Math.floor(scaleByCols * 0.7));
    for (let x = starX - half; x <= starX + half; x++) {
      if (x < 0 || x >= cols) continue;
      const idx = groundY * cols + x;
      if (chars[idx] !== " ") continue;
      const edge = Math.abs(x - starX) / half;
      chars[idx] = edge > 0.85 ? "." : edge > 0.55 ? "-" : "~";
      colors[idx] = SNOW_DIM;
    }
  }
  const greeting = "M E R R Y   C H R I S T M A S";
  const greetY = Math.min(groundY + 2, rows - 1);
  if (greetY < rows && greeting.length <= cols) {
    const start = Math.floor((cols - greeting.length) / 2);
    [...greeting].forEach((ch, i) => {
      if (ch === " ") return;
      const idx = greetY * cols + start + i;
      chars[idx] = ch;
      colors[idx] = GREETING_COLOR;
    });
  }

  // 7) 눈송이는 빈칸에만 내린다 (트리 뒤로 지나간다)
  for (const f of snow) {
    const x = Math.floor(f.x * cols);
    const y = Math.floor(f.y * rows);
    if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
    const idx = y * cols + x;
    if (chars[idx] !== " ") continue;
    chars[idx] = f.big ? "*" : ".";
    colors[idx] = f.big ? SNOW_COLOR : SNOW_DIM;
  }

  return { cols, rows, chars, colors };
};

/** 디버그·테스트용: 프레임을 줄바꿈된 문자열로 */
export const frameToText = (frame: TreeFrame) =>
  Array.from({ length: frame.rows }, (_, y) =>
    frame.chars.slice(y * frame.cols, (y + 1) * frame.cols).join("")
  ).join("\n");
