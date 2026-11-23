import { requireAuth } from "@/lib/auth";
import { savePlaceNote } from "@/lib/db/places";
import { readJson } from "@/lib/monitor/api";
import { placeErrorResponse } from "@/lib/places/api";
import { placeNoteInputSchema } from "@/lib/places/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 장소에 우리 별점(1~5)과 한 줄 리뷰를 남긴다.
 * body: { key: 장소 key(네이버 장소 id, 없으면 지도 링크), rating: 1~5 | null, review?: string }
 */
export const PUT = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {
    const input = placeNoteInputSchema.parse((await readJson(req)) ?? {});
    return Response.json(await savePlaceNote(input));
  } catch (error) {
    return placeErrorResponse(error, "별점을 저장하지 못했어요.");
  }
};
