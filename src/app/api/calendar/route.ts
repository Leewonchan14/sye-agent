import { requireAuth } from "@/lib/auth";
import { calendarErrorResponse, getCalendarRange } from "@/lib/db/calendar";
import { kst } from "@/lib/kst";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isValidDate = (value: string): boolean =>
  DATE_RE.test(value) && kst(value).format("YYYY-MM-DD") === value;

/** 기간 캘린더 번들. from/to가 잘못되면 이번 달 1일~말일로 대체. */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const params = new URL(req.url).searchParams;
  const fromParam = params.get("from") ?? "";
  const toParam = params.get("to") ?? "";

  const fallback = {
    from: kst().startOf("month").format("YYYY-MM-DD"),
    to: kst().endOf("month").format("YYYY-MM-DD"),
  };

  const valid =
    isValidDate(fromParam) &&
    isValidDate(toParam) &&
    fromParam <= toParam &&
    kst(toParam).startOf("day").diff(kst(fromParam).startOf("day"), "day") <= 61;

  const from = valid ? fromParam : fallback.from;
  const to = valid ? toParam : fallback.to;

  try {
    const payload = await getCalendarRange(from, to);
    return Response.json(payload);
  } catch (error) {
    return calendarErrorResponse(error, "캘린더를 불러오지 못했어요.");
  }
};
