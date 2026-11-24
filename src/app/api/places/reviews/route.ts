import { requireAuth } from "@/lib/auth";
import { createReview, listReviewsByEntryIds } from "@/lib/db/places";
import { parseId, readJson } from "@/lib/monitor/api";
import { placeErrorResponse } from "@/lib/places/api";
import { createReviewSchema } from "@/lib/places/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 한 내역의 리뷰: ?entryId= */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  const entryId = parseId(new URL(req.url).searchParams.get("entryId"));
  if (!entryId) {
    return Response.json({ error: "entryId가 올바르지 않아요." }, { status: 400 });
  }
  try {
    const reviews = (await listReviewsByEntryIds([entryId])).get(entryId) ?? [];
    return Response.json({ reviews });
  } catch (error) {
    return placeErrorResponse(error, "리뷰를 불러오지 못했어요.");
  }
};

/** 내역에 리뷰 남기기: { entryId, author: wonchan|yeeun, rating: 0.5~5(0.5 단위), review? } */
export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {
    const input = createReviewSchema.parse((await readJson(req)) ?? {});
    return Response.json(await createReview(input), { status: 201 });
  } catch (error) {
    return placeErrorResponse(error, "리뷰를 남기지 못했어요.");
  }
};
