import { z } from "zod";

import { requireAuth } from "@/lib/auth";
import { dateErrorResponse } from "@/lib/dates/api";
import { DATE_REACTIONS } from "@/lib/dates/types";
import { setSpotReaction } from "@/lib/db/dates";
import { parseId, readJson } from "@/lib/monitor/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ reaction: z.enum(DATE_REACTIONS).nullable() });

/** 가 보고 싶어 / 별로 / 다녀왔어 — 다음 조사의 취향 힌트가 된다. */
export const PATCH = async (
  req: Request,
  ctx: { params: Promise<{ spotId: string }> }
) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  const spotId = parseId((await ctx.params).spotId);
  if (!spotId)
    return Response.json({ error: "spotId가 올바르지 않아요." }, { status: 400 });
  try {
    const { reaction } = bodySchema.parse(await readJson(req));
    await setSpotReaction(spotId, reaction);
    return Response.json({ ok: true });
  } catch (error) {
    return dateErrorResponse(error, "표시를 저장하지 못했어요.");
  }
};
