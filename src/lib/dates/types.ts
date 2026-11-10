import { z } from "zod";

export const DATE_REACTIONS = ["like", "pass", "visited"] as const;
export type DateReaction = (typeof DATE_REACTIONS)[number];

export const MIN_SPOT_COUNT = 3;
export const MAX_SPOT_COUNT = 10;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const shortList = (max: number) =>
  z
    .array(z.string().trim().min(1).max(30))
    .max(max)
    .transform((v) => [...new Set(v)]);

export const dateSettingsSchema = z.object({
  enabled: z.boolean(),
  collectTime: z.string().regex(TIME_RE, "HH:mm 형식이어야 해요."),
  count: z.number().int().min(MIN_SPOT_COUNT).max(MAX_SPOT_COUNT),
  areas: shortList(10).refine((v) => v.length > 0, "지역을 하나 이상 넣어 주세요."),
  themes: shortList(10),
  memo: z.string().trim().max(300),
});
export type DateSettings = z.infer<typeof dateSettingsSchema>;

export const DEFAULT_DATE_SETTINGS: DateSettings = {
  enabled: true,
  collectTime: "09:00",
  count: 5,
  areas: ["서울"],
  themes: [],
  memo: "",
};

/** 인스타그램 게시물·릴스 주소만 근거로 받는다. */
const INSTAGRAM_POST_RE =
  /^https:\/\/(www\.)?instagram\.com\/(?:[A-Za-z0-9._]+\/)?(p|reel|reels)\/([A-Za-z0-9_-]+)/i;

/** 추적 파라미터를 떼고 `https://www.instagram.com/p/<코드>/` 형태로 맞춘다. 릴스도 /p/로 열린다. */
export const normalizeInstagramUrl = (url: string): string | null => {
  const match = url.trim().match(INSTAGRAM_POST_RE);
  return match ? `https://www.instagram.com/p/${match[3]}/` : null;
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const agentSpotSchema = z.object({
  name: z.string().trim().min(1).max(80),
  area: z.string().trim().max(40).default(""),
  category: z.string().trim().max(30).default(""),
  summary: z.string().trim().max(400).default(""),
  reason: z.string().trim().max(300).default(""),
  instagramUrl: z
    .string()
    .max(500)
    .transform((v, ctx) => {
      const normalized = normalizeInstagramUrl(v);
      if (!normalized) {
        ctx.addIssue({
          code: "custom",
          message: "인스타그램 게시물 주소(instagram.com/p/… 또는 /reel/…)여야 해요.",
        });
        return z.NEVER;
      }
      return normalized;
    }),
  instagramAuthor: optionalText(60).transform((v) => v?.replace(/^@/, "") || null),
  postedAt: optionalText(40),
  address: optionalText(160),
  priceHint: optionalText(60),
  tags: z.array(z.string().trim().min(1).max(20)).max(8).default([]),
});
export type AgentSpotInput = z.infer<typeof agentSpotSchema>;

export const agentDigestSchema = z.object({
  digestId: z.number().int().positive(),
  note: z.string().trim().max(400).nullish(),
  spots: z.array(agentSpotSchema).max(30),
  /** 나눠 보낼 때 마지막이 아닌 묶음은 false */
  final: z.boolean().optional(),
});
export type AgentDigestInput = z.infer<typeof agentDigestSchema>;

export interface DateSpotView {
  id: number;
  dayKey: string;
  name: string;
  area: string;
  category: string;
  summary: string;
  reason: string;
  instagramUrl: string;
  instagramAuthor: string | null;
  postedAt: string | null;
  address: string | null;
  priceHint: string | null;
  tags: string[];
  reaction: DateReaction | null;
}

export interface DateDigestView {
  id: number;
  dayKey: string;
  note: string | null;
  pending: boolean;
  lastError: string | null;
  spots: DateSpotView[];
}

export interface DateDaySummary {
  dayKey: string;
  count: number;
}

export interface DateOverview {
  settings: DateSettings;
  /** 오늘(또는 고른 날) 조사 */
  digest: DateDigestView | null;
  dayKey: string;
  /** 최근 조사한 날 — 날짜 이동용 */
  days: DateDaySummary[];
  /** 가 보고 싶다고 표시한 곳 (최신순) */
  liked: DateSpotView[];
  nextCollectAt: string | null;
}
