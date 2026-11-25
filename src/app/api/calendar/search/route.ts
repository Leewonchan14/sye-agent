import { requireAuth } from "@/lib/auth";
import { calendarErrorResponse, searchCalendarEvents } from "@/lib/db/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 제목·메모·위치를 대소문자 무시 부분일치로 검색한다. */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const params = new URL(req.url).searchParams;
  const q = params.get("q") ?? "";
  const scope = params.get("scope") ?? "all";

  try {
    const results = await searchCalendarEvents(q, scope);
    return Response.json({ results });
  } catch (error) {
    return calendarErrorResponse(error, "일정을 검색하지 못했어요.");
  }
};
