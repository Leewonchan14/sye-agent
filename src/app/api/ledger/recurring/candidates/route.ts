import { requireAuth } from "@/lib/auth";
import { getRecurringCandidates } from "@/lib/db/ledger-recurring";
import { ledgerErrorResponse } from "@/lib/ledger/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 최근 내역에서 매달 반복되는 지출을 찾아 추천한다. */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    const candidates = await getRecurringCandidates();
    return Response.json({ candidates });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "반복 추천을 불러오지 못했어요." });
  }
};
