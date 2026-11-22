import { requireAuth } from "@/lib/auth";
import { getLedgerMapPlaces, refreshLedgerMapPlaces } from "@/lib/db/ledger-map";
import { ledgerErrorResponse } from "@/lib/ledger/api";
import { toMapRange } from "@/lib/ledger/map-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 데이트 지도: 지도 링크에서 좌표를 읽은 지출을 장소별로.
 * ?range=all|year|month, ?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD, ?range=trip&trip=<id>
 */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    const params = new URL(req.url).searchParams;
    const trip = params.get("trip");
    return Response.json(
      await getLedgerMapPlaces({
        range: toMapRange(params.get("range")),
        from: params.get("from"),
        to: params.get("to"),
        trip: trip && /^\d+$/.test(trip) ? Number(trip) : null,
      })
    );
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "데이트 지도를 불러오지 못했어요." });
  }
};

/** 좌표를 못 읽은 네이버 지도 링크를 다시 읽는다. */
export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    return Response.json(await refreshLedgerMapPlaces());
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "장소를 다시 찾지 못했어요." });
  }
};
