import { z } from "zod";

import { requireAuth } from "@/lib/auth";
import { decidePick, deletePick, getPick } from "@/lib/db/picks";
import { parseId, readJson } from "@/lib/monitor/api";
import { pickErrorResponse } from "@/lib/picks/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ pickId: string }> };

const badId = () =>
  Response.json({ error: "pickId가 올바르지 않아요." }, { status: 400 });

export const GET = async (req: Request, ctx: Ctx) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  const pickId = parseId((await ctx.params).pickId);
  if (!pickId) return badId();
  try {
    return Response.json(await getPick(pickId));
  } catch (error) {
    return pickErrorResponse(error, "뽑기를 불러오지 못했어요.");
  }
};

const patchSchema = z.object({ status: z.literal("decided") });

/** 이걸로 결정 */
export const PATCH = async (req: Request, ctx: Ctx) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  const pickId = parseId((await ctx.params).pickId);
  if (!pickId) return badId();
  try {
    patchSchema.parse(await readJson(req));
    return Response.json(await decidePick(pickId));
  } catch (error) {
    return pickErrorResponse(error, "결정을 저장하지 못했어요.");
  }
};

export const DELETE = async (req: Request, ctx: Ctx) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  const pickId = parseId((await ctx.params).pickId);
  if (!pickId) return badId();
  try {
    await deletePick(pickId);
    return Response.json({ ok: true });
  } catch (error) {
    return pickErrorResponse(error, "기록을 지우지 못했어요.");
  }
};
