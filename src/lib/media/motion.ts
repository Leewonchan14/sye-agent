export interface MotionAsset {
  id: string;
  src: string;
  webm?: string;
  poster: string;
  width: number;
  height: number;
  durationMs: number;
  bytes?: number;
  alt: string;
  hasAudio?: boolean;
}

export const MOTION_ASSETS = {
  "demo-loop": {
    id: "demo-loop",
    src: "/media/motion/demo-loop.mp4",
    webm: "/media/motion/demo-loop.webm",
    poster: "/media/motion/demo-loop.poster.webp",
    width: 1280,
    height: 720,
    durationMs: 6000,
    alt: "짧은 모션그래픽 루프",
  },
} as const satisfies Record<string, MotionAsset>;

export const MOTION_IDS = Object.keys(MOTION_ASSETS) as [
  keyof typeof MOTION_ASSETS,
  ...(keyof typeof MOTION_ASSETS)[],
];

export const resolveMotion = (id: string): MotionAsset | null => {
  if (!Object.hasOwn(MOTION_ASSETS, id)) return null;
  return MOTION_ASSETS[id as keyof typeof MOTION_ASSETS];
};
