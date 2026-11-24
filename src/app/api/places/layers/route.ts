import { requireAuth } from "@/lib/auth";
import { parseId } from "@/lib/monitor/api";
import { placeErrorResponse } from "@/lib/places/api";
import { getMapLayers } from "@/lib/places/notebook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 데이트 지도의 동네와 하치와레 추천 레이어: ?area=<동네 id>. 없으면 전체 */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  const raw = new URL(req.url).searchParams.get("area");
  const areaId = raw ? parseId(raw) : null;
  if (raw && !areaId) {
    return Response.json({ error: "area가 올바르지 않아요." }, { status: 400 });
  }
  try {
    return Response.json(await getMapLayers(areaId));
  } catch (error) {
    return placeErrorResponse(error, "지도 레이어를 불러오지 못했어요.");
  }
};
