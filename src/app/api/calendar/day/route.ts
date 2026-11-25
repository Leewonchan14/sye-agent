import { requireAuth } from "@/lib/auth";
import { calendarErrorResponse, getCalendarDay } from "@/lib/db/calendar";
import { kst } from "@/lib/kst";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isValidDate = (value: string): boolean =>
  DATE_RE.test(value) && kst(value).format("YYYY-MM-DD") === value;

/** 특정 날짜의 일정·일기 전문. 잘못된 날짜는 오늘로 대체. */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const param = new URL(req.url).searchParams.get("date") ?? "";
  const date = isValidDate(param) ? param : kst().format("YYYY-MM-DD");

  try {
    const payload = await getCalendarDay(date);
    return Response.json(payload);
  } catch (error) {
    return calendarErrorResponse(error, "날짜를 불러오지 못했어요.");
  }
};
