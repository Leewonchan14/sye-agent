import { z } from "zod";

import { MOTION_IDS } from "@/lib/media/motion";

const MAX_SVG_CHARS = 24_000;

export const SvgSpec = z.object({
  v: z.literal(1),
  kind: z.literal("svg"),
  caption: z.string().max(80).optional(),
  alt: z.string().max(160).optional(),
  svg: z.string().min(20).max(MAX_SVG_CHARS),
});

export type SvgSpec = z.infer<typeof SvgSpec>;

export const MotionSpec = z.object({
  v: z.literal(1),
  kind: z.literal("motion"),
  id: z.enum(MOTION_IDS),
  caption: z.string().max(80).optional(),
  loop: z.boolean().default(true),
  autoplay: z.boolean().default(true),
  sound: z.boolean().default(false),
});

export type MotionSpec = z.infer<typeof MotionSpec>;

const Vec3 = z.tuple([z.number(), z.number(), z.number()]);

export const Scene3dSpec = z.object({
  v: z.literal(1),
  kind: z.literal("scene3d"),
  caption: z.string().max(80).optional(),
  scene: z.object({
    background: z.string().optional(),
    camera: z
      .object({
        position: Vec3.default([0, 1.6, 4]),
        lookAt: Vec3.default([0, 0, 0]),
        fov: z.number().min(10).max(120).default(45),
      })
      .prefault({}),
    lights: z
      .array(
        z.object({
          type: z.enum(["ambient", "directional", "point"]),
          intensity: z.number().min(0).max(10).default(1),
          position: Vec3.optional(),
          color: z.string().optional(),
        })
      )
      .max(6)
      .default([{ type: "ambient", intensity: 0.6 }]),
    objects: z
      .array(
        z.object({
          geometry: z.enum(["box", "sphere", "cylinder", "torus", "plane"]),
          args: z.array(z.number()).max(6).default([]),
          position: Vec3.default([0, 0, 0]),
          rotation: Vec3.default([0, 0, 0]),
          scale: z.number().min(0.05).max(50).default(1),
          color: z.string().default("#d96c75"),
          roughness: z.number().min(0).max(1).default(0.4),
          metalness: z.number().min(0).max(1).default(0.1),
          spin: Vec3.optional(),
        })
      )
      .min(1)
      .max(24),
  }),
});

export type Scene3dSpec = z.infer<typeof Scene3dSpec>;

export const SyeUiSpec = z.discriminatedUnion("kind", [SvgSpec, MotionSpec, Scene3dSpec]);
export type SyeUiSpec = z.infer<typeof SyeUiSpec>;

export type ParseResult =
  { ok: true; spec: SyeUiSpec } | { ok: false; reason: "invalid-json" | "invalid-spec" };

export const parseSyeUiSpec = (code: string): ParseResult => {
  let raw: unknown;
  try {
    raw = JSON.parse(code);
  } catch {
    return { ok: false, reason: "invalid-json" };
  }

  const parsed = SyeUiSpec.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid-spec" };

  return { ok: true, spec: parsed.data };
};
