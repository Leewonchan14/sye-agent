import { requireAuth } from "@/lib/auth";
import { normalizeDate, normalizeMonth } from "@/lib/db/ledger";
import { getLedgerRecap } from "@/lib/db/ledger-recap";
import { kst } from "@/lib/kst";
import { ledgerErrorResponse } from "@/lib/ledger/api";
import { lastCompletedRecapKey } from "@/lib/ledger/recap";
import { weekStartOf } from "@/lib/ledger/week";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 주간 리캡은 ?week=YYYY-MM-DD(그 주의 아무 날), 월간 리캡은 ?month=YYYY-MM.
 * 둘 다 없으면 가장 최근에 끝난 주의 리캡을 돌려준다.
 */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const params = new URL(req.url).searchParams;
  const week = params.get("week");
  const month = params.get("month");

  try {
    const recap = month
      ? await getLedgerRecap("month", normalizeMonth(month))
      : await getLedgerRecap(
          "week",
          week
            ? weekStartOf(normalizeDate(week))
            : lastCompletedRecapKey("week", kst().format("YYYY-MM-DD"))
        );
    return Response.json({ recap });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "리캡을 불러오지 못했어요." });
  }
};
