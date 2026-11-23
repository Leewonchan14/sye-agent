import { requireAuth } from "@/lib/auth";
import { createArea } from "@/lib/db/places";
import { readJson } from "@/lib/monitor/api";
import { placeErrorResponse } from "@/lib/places/api";
import { createAreaSchema } from "@/lib/places/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 지역 추가: { name, lat, lng, address?, radiusM? } — 좌표는 검색 후보에서 고른 곳 */
export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {
    const input = createAreaSchema.parse((await readJson(req)) ?? {});
    return Response.json(await createArea(input), { status: 201 });
  } catch (error) {
    return placeErrorResponse(error, "지역을 추가하지 못했어요.");
  }
};
