import { requireAuth } from "@/lib/auth";
import type { CalendarDiaryInput } from "@/lib/calendar/types";
import {
  calendarErrorResponse,
  deleteCalendarDiary,
  listCalendarDiariesByDate,
  listCalendarDiariesByMonth,
  upsertCalendarDiary,
} from "@/lib/db/calendar";
import { readJsonBody } from "@/lib/ledger/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const badBody = () =>
  Response.json({ error: "요청 본문이 올바르지 않아요." }, { status: 400 });

export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const params = new URL(req.url).searchParams;
  const month = params.get("month");
  const date = params.get("date");

  try {
    if (month) {
      const diaries = await listCalendarDiariesByMonth(month);
      return Response.json({ diaries });
    }
    if (date) {
      const diaries = await listCalendarDiariesByDate(date);
      return Response.json({ diaries });
    }
    return Response.json({ error: "월 또는 날짜를 지정해 주세요." }, { status: 400 });
  } catch (error) {
    return calendarErrorResponse(error, "일기를 불러오지 못했어요.");
  }
};

export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body) return badBody();

  try {
    const diary = await upsertCalendarDiary(body as unknown as CalendarDiaryInput);
    return Response.json({ diary });
  } catch (error) {
    return calendarErrorResponse(error, "일기를 저장하지 못했어요.");
  }
};

export const DELETE = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const id = new URL(req.url).searchParams.get("id");
  try {
    await deleteCalendarDiary(id);
    return Response.json({ ok: true });
  } catch (error) {
    return calendarErrorResponse(error, "일기를 삭제하지 못했어요.");
  }
};
