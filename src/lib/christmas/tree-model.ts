/**
 * ASCII 크리스마스 트리의 3D 점 구름.
 *
 * 트리는 표면이 아니라 점 수십만 개로 이뤄진다. 24층으로 가지가 돌려나고, 가지마다 바늘잎 점을
 * 끝으로 갈수록 처지게 뿌린다. 그 위에 가랜드(처지는 금색 나선), 구슬, 전구, 줄기, 선물 상자,
 * 눈 덮인 바닥을 같은 방식의 점으로 얹는다. 화면에 그리는 일은 `tree-renderer.ts`가 한다.
 */

export const KIND = {
  NEEDLE: 0,
  SNOWCAP: 1,
  TRUNK: 2,
  GARLAND: 3,
  BALL: 4,
  LIGHT: 5,
  GIFT: 6,
  RIBBON: 7,
  GROUND: 8,
} as const;

export interface TreeModel {
  count: number;
  /** x, y, z */
  pos: Float32Array;
  /** 단위 법선 x, y, z */
  nrm: Float32Array;
  /** 가장 밝을 때의 색 r, g, b (0~1) */
  col: Float32Array;
  /** 바탕 밝기. 그늘진 안쪽 잎일수록 낮다 */
  albedo: Float32Array;
  /** 반짝임(하이라이트) 세기 */
  shine: Float32Array;
  /** 전구 깜빡임 위상 */
  phase: Float32Array;
  kind: Uint8Array;
}

const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** 잎이 시작하고 끝나는 높이 */
export const Y0 = 0.42;
export const Y1 = 2.55;
/** 꼭대기 별 중심 높이 */
export const STAR_Y = Y1 + 0.1;
/** 바닥 원판 반지름 */
export const GROUND_RADIUS = 3.4;

/** 높이 y에서 트리 외곽 반지름 */
export const envelope = (y: number) => {
  const f = Math.min(1, Math.max(0, (y - Y0) / (Y1 - Y0)));
  return 0.03 + 0.84 * (1 - f) ** 1.08;
};

/** 결정적 난수(mulberry32)와 정규분포(Box–Muller) */
const createRng = (seed: number) => {
  let a = seed;
  const random = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare: number | null = null;
  const normal = (mu = 0, sd = 1) => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return mu + sd * s;
    }
    let u = 0;
    while (u === 0) u = random();
    const m = Math.sqrt(-2 * Math.log(u));
    const v = random();
    spare = m * Math.sin(TAU * v);
    return mu + sd * m * Math.cos(TAU * v);
  };
  const uniform = (lo: number, hi: number) => lo + (hi - lo) * random();
  return { random, normal, uniform };
};

type Vec3 = [number, number, number];

interface PartOptions {
  albedo?: number;
  shine?: number;
  phase?: number;
}

const createParts = () => {
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const albedo: number[] = [];
  const shine: number[] = [];
  const phase: number[] = [];
  const kind: number[] = [];

  const add = (p: Vec3, n: Vec3, c: Vec3, k: number, opts: PartOptions = {}) => {
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    pos.push(p[0], p[1], p[2]);
    nrm.push(n[0] / len, n[1] / len, n[2] / len);
    col.push(c[0], c[1], c[2]);
    albedo.push(opts.albedo ?? 1);
    shine.push(opts.shine ?? 0);
    phase.push(opts.phase ?? 0);
    kind.push(k);
  };

  const done = (): TreeModel => ({
    count: kind.length,
    pos: Float32Array.from(pos),
    nrm: Float32Array.from(nrm),
    col: Float32Array.from(col),
    albedo: Float32Array.from(albedo),
    shine: Float32Array.from(shine),
    phase: Float32Array.from(phase),
    kind: Uint8Array.from(kind),
  });

  return { add, done };
};

/** 구 표면에 고르게 퍼진 n개 점 (피보나치 구) */
const fibSphere = (n: number): Vec3[] =>
  Array.from({ length: n }, (_, idx) => {
    const i = idx + 0.5;
    const y = 1 - (2 * i) / n;
    const r = Math.sqrt(1 - y * y);
    const th = GOLDEN * i;
    return [r * Math.cos(th), y, r * Math.sin(th)];
  });

interface Gift {
  angle: number;
  dist: number;
  w: number;
  d: number;
  h: number;
  yaw: number;
  box: Vec3;
  ribbon: Vec3;
}

const RED: Vec3 = [0.95, 0.13, 0.12];
const GOLD: Vec3 = [1.0, 0.76, 0.26];
const BLUE: Vec3 = [0.2, 0.35, 0.95];
const CREAM: Vec3 = [0.95, 0.9, 0.82];
const GREEN: Vec3 = [0.2, 0.75, 0.32];

const GIFTS: Gift[] = [
  { angle: 3.4, dist: 0.85, w: 0.34, d: 0.3, h: 0.36, yaw: 0.3, box: RED, ribbon: GREEN },
  { angle: 4.75, dist: 0.72, w: 0.3, d: 0.28, h: 0.26, yaw: 0.9, box: GOLD, ribbon: RED },
  {
    angle: 0.35,
    dist: 0.85,
    w: 0.36,
    d: 0.28,
    h: 0.22,
    yaw: -0.4,
    box: BLUE,
    ribbon: CREAM,
  },
  {
    angle: 1.85,
    dist: 0.8,
    w: 0.28,
    d: 0.28,
    h: 0.22,
    yaw: 0.6,
    box: CREAM,
    ribbon: RED,
  },
  {
    angle: 5.75,
    dist: 0.95,
    w: 0.24,
    d: 0.22,
    h: 0.3,
    yaw: 0.1,
    box: RED,
    ribbon: CREAM,
  },
];

/**
 * 점 구름을 만든다. density로 바늘잎 점 개수를 줄일 수 있다(1이면 원본과 같은 밀도).
 * 시드가 고정이라 매번 같은 트리가 나온다.
 */
export const buildTreeModel = (density = 0.5): TreeModel => {
  const rng = createRng(7);
  const parts = createParts();
  const tips: Vec3[] = [];

  // --- 바늘잎: 층마다 돌려나는 처진 가지. 가지 끝으로 갈수록 빽빽하다
  const tierCount = 24;
  for (let i = 0; i < tierCount; i++) {
    const y = Y0 + 0.02 + ((Y1 - 0.04 - (Y0 + 0.02)) * i) / (tierCount - 1);
    const f = (y - Y0) / (Y1 - Y0);
    const R = envelope(y);
    const branches = Math.floor(7 + 11 * (1 - f));
    for (let b = 0; b < branches; b++) {
      const a = (TAU * b) / branches + i * 0.618 * TAU + rng.normal(0, 0.12);
      const L = R * rng.uniform(0.82, 1.06);
      const n = Math.floor((250 + 1400 * L) * density);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      for (let k = 0; k < n; k++) {
        const s = rng.random() ** 0.65;
        const spread = (0.035 + 0.11 * s) * rng.normal();
        const sl = s * L;
        const yy = y + 0.07 * sl - 0.22 * sl * sl + 0.03 * s * rng.normal();
        const p: Vec3 = [ca * sl - sa * spread, yy, sa * sl + ca * spread];
        const nrm: Vec3 = [
          ca * 0.75 + rng.normal(0, 0.35),
          0.55 + rng.normal(0, 0.35),
          sa * 0.75 + rng.normal(0, 0.35),
        ];
        const ao = 0.35 + 0.65 * s ** 1.3;
        const tone = ao * rng.uniform(0.75, 1.1);
        const snow = s > 0.45 && rng.random() < 0.06 * s && nrm[1] > 0.45;
        if (snow) {
          parts.add(p, [0, 1, 0], [0.92, 0.95, 1.0], KIND.SNOWCAP, { albedo: 0.95 });
        } else {
          const g = rng.uniform(0.85, 1.08);
          parts.add(
            p,
            nrm,
            [0.28 + 0.08 * rng.random(), 0.66 * g, 0.4 + 0.06 * rng.random()],
            KIND.NEEDLE,
            { albedo: tone }
          );
        }
      }
      const tipS = 0.93 * L;
      tips.push([ca * tipS, y + 0.07 * tipS - 0.22 * tipS * tipS, sa * tipS]);
    }
  }

  // --- 줄기
  for (let hi = 0; hi < 50; hi++) {
    const h = -0.05 + (0.65 * hi) / 49;
    for (let ai = 0; ai < 40; ai++) {
      const a = (TAU * ai) / 40;
      const bark = 0.75 + 0.25 * Math.sin(h * 90 + a * 3);
      parts.add(
        [0.085 * Math.cos(a), h, 0.085 * Math.sin(a)],
        [Math.cos(a), 0, Math.sin(a)],
        [0.85, 0.53, 0.28],
        KIND.TRUNK,
        { albedo: 0.6 * bark }
      );
    }
  }

  // --- 가랜드: 가지 사이로 처지며 감기는 금색 나선
  const garlandSteps = 2600;
  const turns = 3.6;
  for (let i = 0; i < garlandSteps; i++) {
    const u = i / (garlandSteps - 1);
    const yg = Y0 + 0.15 + (Y1 - Y0 - 0.45) * u;
    const ag = TAU * turns * u + 0.9;
    const swag = -0.06 * Math.abs(Math.sin(ag * 2.5));
    const rg = envelope(yg) + 0.02;
    const base: Vec3 = [rg * Math.cos(ag), yg + swag, rg * Math.sin(ag)];
    for (let k = 0; k < 2; k++) {
      parts.add(
        [
          base[0] + rng.normal(0, 0.012),
          base[1] + rng.normal(0, 0.012),
          base[2] + rng.normal(0, 0.012),
        ],
        [Math.cos(ag), 0.35, Math.sin(ag)],
        [1.0, 0.7, 0.28],
        KIND.GARLAND,
        { albedo: 0.62, shine: 0.45 }
      );
    }
  }

  // --- 구슬: 가지 끝에 매달린 빨강·금색 공
  const ballTips = tips
    .filter(([x, y, z]) => Math.hypot(x, z) > 0.14 && y < Y1 - 0.3)
    .map((t) => ({ t, key: rng.random() }))
    .sort((p, q) => p.key - q.key)
    .slice(0, 34)
    .map(({ t }) => t);
  const sphere = fibSphere(260);
  ballTips.forEach(([x, y, z], idx) => {
    const r = rng.uniform(0.065, 0.09);
    const out = Math.hypot(x, z);
    const cx = x + (x / out) * r * 1.1;
    const cz = z + (z / out) * r * 1.1;
    const cy = y - r * 0.6;
    const color = idx % 4 === 3 ? GOLD : RED;
    for (const [sx, sy, sz] of sphere) {
      parts.add([cx + sx * r, cy + sy * r, cz + sz * r], [sx, sy, sz], color, KIND.BALL, {
        albedo: 0.85,
        shine: 0.5,
      });
    }
  });

  // --- 전구 170개: 잎 바깥쪽에 흩어진 따뜻한 노란 불빛
  for (let i = 0; i < 170; i++) {
    const y = rng.uniform(Y0 + 0.05, Y1 - 0.12);
    const a = rng.random() * TAU;
    const r = envelope(y) * rng.uniform(0.82, 1.02);
    parts.add(
      [r * Math.cos(a), y - 0.06 * r, r * Math.sin(a)],
      [Math.cos(a), 0.4, Math.sin(a)],
      [1.0, 0.84, 0.42],
      KIND.LIGHT,
      { albedo: 1, phase: rng.random() * TAU }
    );
  }

  // --- 선물 상자: 옆면 4개 + 윗면, 십자 리본과 위에 리본 매듭
  const step = 0.012;
  for (const g of GIFTS) {
    const gx = Math.cos(g.angle) * g.dist;
    const gz = Math.sin(g.angle) * g.dist;
    const cy = Math.cos(g.yaw);
    const sy = Math.sin(g.yaw);
    const place = (lx: number, ly: number, lz: number): Vec3 => [
      gx + lx * cy - lz * sy,
      ly,
      gz + lx * sy + lz * cy,
    ];
    const turn = (nx: number, ny: number, nz: number): Vec3 => [
      nx * cy - nz * sy,
      ny,
      nx * sy + nz * cy,
    ];
    const ribbonW = Math.min(g.w, g.d) * 0.12;
    const paint = (u: number, v: number) =>
      Math.abs(u) < ribbonW || Math.abs(v) < ribbonW ? g.ribbon : g.box;
    const hw = g.w / 2;
    const hd = g.d / 2;
    // 앞뒤 면 (z = ±hd)
    for (let lx = -hw; lx <= hw; lx += step) {
      for (let ly = 0; ly <= g.h; ly += step) {
        for (const sz of [-1, 1]) {
          const c = Math.abs(lx) < ribbonW ? g.ribbon : g.box;
          parts.add(place(lx, ly, sz * hd), turn(0, 0, sz), c, KIND.GIFT, {
            albedo: 0.85,
          });
        }
      }
    }
    // 좌우 면 (x = ±hw)
    for (let lz = -hd; lz <= hd; lz += step) {
      for (let ly = 0; ly <= g.h; ly += step) {
        for (const sx of [-1, 1]) {
          const c = Math.abs(lz) < ribbonW ? g.ribbon : g.box;
          parts.add(place(sx * hw, ly, lz), turn(sx, 0, 0), c, KIND.GIFT, {
            albedo: 0.85,
          });
        }
      }
    }
    // 윗면
    for (let lx = -hw; lx <= hw; lx += step) {
      for (let lz = -hd; lz <= hd; lz += step) {
        parts.add(place(lx, g.h, lz), [0, 1, 0], paint(lx, lz), KIND.GIFT, {
          albedo: 0.95,
        });
      }
    }
    // 리본 매듭: 납작한 고리 두 개
    const bowR = ribbonW * 2.2;
    for (const side of [-1, 1]) {
      for (const [sx, sy, sz] of fibSphere(60)) {
        parts.add(
          place(
            side * bowR * 0.9 + sx * bowR,
            g.h + bowR * 0.6 + sy * bowR * 0.6,
            sz * bowR * 0.5
          ),
          turn(sx, sy, sz),
          g.ribbon,
          KIND.RIBBON,
          { albedo: 0.95, shine: 0.5 }
        );
      }
    }
  }

  // --- 트리 밑 눈더미: 줄기 둘레에 낮게 쌓인 흰 눈
  const moundCount = 14000;
  const moundR = 0.8;
  for (let i = 0; i < moundCount; i++) {
    const r = moundR * Math.sqrt((i + 0.5) / moundCount);
    const th = GOLDEN * i;
    const f = r / moundR;
    const h = 0.06 * (1 - f * f) + 0.01 * rng.normal();
    parts.add(
      [r * Math.cos(th), Math.max(0.005, h), r * Math.sin(th)],
      [Math.cos(th) * f * 0.5, 1, Math.sin(th) * f * 0.5],
      [0.95, 0.93, 0.88],
      KIND.SNOWCAP,
      { albedo: 0.7 + 0.25 * rng.random() }
    );
  }

  // --- 바닥: 원판에 고르게 뿌린 점. 트리 밑은 그늘지고 멀수록 어둠에 묻힌다
  const groundCount = 70000;
  for (let i = 0; i < groundCount; i++) {
    const r = GROUND_RADIUS * Math.sqrt((i + 0.5) / groundCount);
    const th = GOLDEN * i;
    const shade = 0.5 + 0.5 * Math.min(1, Math.max(0, (r - 0.4) / 0.9));
    const fade = 1 - Math.min(1, Math.max(0, (r - 1.1) / (GROUND_RADIUS - 1.1)));
    parts.add(
      [r * Math.cos(th), 0, r * Math.sin(th)],
      [rng.normal(0, 0.1), 1, rng.normal(0, 0.1)],
      [0.74, 0.76, 0.84],
      KIND.GROUND,
      { albedo: (0.36 + 0.2 * rng.random()) * shade * fade ** 1.4 }
    );
  }

  return parts.done();
};
