import { requireAuth } from "@/lib/auth";
import { dateErrorResponse } from "@/lib/dates/api";
import { startDateSpotSearch } from "@/lib/dates/hermes";
import { countDigestSpots, ensureDigest } from "@/lib/db/dates";
import { listAreas } from "@/lib/db/places";
import { kst } from "@/lib/kst";
import { parseId } from "@/lib/monitor/api";
import { publicOrigin } from "@/lib/monitor/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ areaId: string }> };

/**
 * 지역 수첩의 "이 동네 더 찾아 줘" — 오늘 조사에 이 지역 반경 안만 찾는 하치와레 작업을 붙인다.
 * 결과는 오늘 데이트 추천에도 쌓이고, 지역 수첩의 "하치와레 새 추천"에 보인다. 이미 찾는 중이면 409.
 */
export const POST = async (req: Request, ctx: Ctx) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  const areaId = parseId((await ctx.params).areaId);
  if (!areaId) {
    return Response.json({ error: "areaId가 올바르지 않아요." }, { status: 400 });
  }
  try {
    const area = (await listAreas()).find((item) => item.id === areaId);
    if (!area) return Response.json({ error: "지역을 찾을 수 없어요." }, { status: 404 });
    const digest = await ensureDigest(kst().format("YYYY-MM-DD"));
    const extra = (await countDigestSpots(digest.id)) > 0;
    await startDateSpotSearch({
      origin: publicOrigin(req),
      digestId: digest.id,
      extra,
      area,
    });
    return Response.json({ ok: true }, { status: 202 });
  } catch (error) {
    return dateErrorResponse(error, "하치와레에게 요청하지 못했어요.");
  }
};
