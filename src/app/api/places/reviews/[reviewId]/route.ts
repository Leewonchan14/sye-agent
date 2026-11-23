import { requireAuth } from "@/lib/auth";
import { deleteReview, updateReview } from "@/lib/db/places";
import { parseId, readJson } from "@/lib/monitor/api";
import { placeErrorResponse } from "@/lib/places/api";
import { updateReviewSchema } from "@/lib/places/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ reviewId: string }> };

const badId = () =>
  Response.json({ error: "reviewId가 올바르지 않아요." }, { status: 400 });

/** 리뷰 고치기: { author?, rating?, review? } */
export const PATCH = async (req: Request, ctx: Ctx) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  const reviewId = parseId((await ctx.params).reviewId);
  if (!reviewId) return badId();
  try {
    const patch = updateReviewSchema.parse((await readJson(req)) ?? {});
    return Response.json(await updateReview(reviewId, patch));
  } catch (error) {
    return placeErrorResponse(error, "리뷰를 고치지 못했어요.");
  }
};

export const DELETE = async (req: Request, ctx: Ctx) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  const reviewId = parseId((await ctx.params).reviewId);
  if (!reviewId) return badId();
  try {
    await deleteReview(reviewId);
    return Response.json({ ok: true });
  } catch (error) {
    return placeErrorResponse(error, "리뷰를 지우지 못했어요.");
  }
};
