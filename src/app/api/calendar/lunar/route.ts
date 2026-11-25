import { requireAuth } from "@/lib/auth";
import { lunarToSolar, solarToLunar } from "@/lib/calendar/lunar";
import { kst } from "@/lib/kst";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isValidDate = (value: string): boolean =>
  DATE_RE.test(value) && kst(value).format("YYYY-MM-DD") === value;

/** 음력·양력 변환. ?date=는 양력→음력, ?year=&month=&day=&leap=는 음력→양력. */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const params = new URL(req.url).searchParams;
  const date = params.get("date");

  if (date) {
    const lunar = isValidDate(date) ? solarToLunar(date) : null;
    return Response.json({ lunar });
  }

  const yearParam = params.get("year");
  const monthParam = params.get("month");
  const dayParam = params.get("day");
  if (yearParam === null || monthParam === null || dayParam === null) {
    return Response.json({ solar: null });
  }

  const year = Number(yearParam);
  const month = Number(monthParam);
  const day = Number(dayParam);
  const leap = params.get("leap") === "1";

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return Response.json({ solar: null });
  }

  const solar = lunarToSolar({ year, month, day, leap });
  return Response.json({ solar });
};
