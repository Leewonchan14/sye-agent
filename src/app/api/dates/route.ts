import { requireAuth } from "@/lib/auth";
import { dateErrorResponse } from "@/lib/dates/api";
import { startDateSpotSearch } from "@/lib/dates/hermes";
import { getDateOverview } from "@/lib/dates/overview";
import { countDigestSpots, ensureDigest } from "@/lib/db/dates";
import { kst } from "@/lib/kst";
import { publicOrigin } from "@/lib/monitor/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 오늘(또는 ?day=YYYY-MM-DD)의 데이트 장소와 설정·찜 목록 */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {
    const day = new URL(req.url).searchParams.get("day");
    return Response.json(await getDateOverview(day));
  } catch (error) {
    return dateErrorResponse(error, "데이트 장소를 불러오지 못했어요.");
  }
};

/** "지금 찾아 줘" — 오늘 조사에 하치와레를 붙인다. 이미 받은 곳이 있으면 겹치지 않게 더 찾는다. */
export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {
    const digest = await ensureDigest(kst().format("YYYY-MM-DD"));
    const extra = (await countDigestSpots(digest.id)) > 0;
    await startDateSpotSearch({ origin: publicOrigin(req), digestId: digest.id, extra });
    return Response.json(await getDateOverview(digest.dayKey), { status: 202 });
  } catch (error) {
    return dateErrorResponse(error, "하치와레에게 요청하지 못했어요.");
  }
};
