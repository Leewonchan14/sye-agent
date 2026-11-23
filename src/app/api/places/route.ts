import { requireAuth } from "@/lib/auth";
import { parseId } from "@/lib/monitor/api";
import { placeErrorResponse } from "@/lib/places/api";
import { getPlacesPayload } from "@/lib/places/notebook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 지역 수첩: ?area=<지역 id>. 없으면 최근에 연 지역 */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  const raw = new URL(req.url).searchParams.get("area");
  const areaId = raw ? parseId(raw) : null;
  if (raw && !areaId) {
    return Response.json({ error: "area가 올바르지 않아요." }, { status: 400 });
  }
  try {
    return Response.json(await getPlacesPayload(areaId));
  } catch (error) {
    return placeErrorResponse(error, "지역 수첩을 불러오지 못했어요.");
  }
};
