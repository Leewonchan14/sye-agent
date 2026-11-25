import { requireAuth } from "@/lib/auth";
import type { CalendarEventInput } from "@/lib/calendar/types";
import {
  calendarErrorResponse,
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from "@/lib/db/calendar";
import { readJsonBody } from "@/lib/ledger/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const badBody = () =>
  Response.json({ error: "요청 본문이 올바르지 않아요." }, { status: 400 });

export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body) return badBody();

  try {
    const events = await createCalendarEvent(body as unknown as CalendarEventInput);
    return Response.json({ events }, { status: 201 });
  } catch (error) {
    return calendarErrorResponse(error, "일정을 저장하지 못했어요.");
  }
};

export const PATCH = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body) return badBody();

  const { id, ...rest } = body;
  try {
    const event = await updateCalendarEvent(id, rest);
    return Response.json({ event });
  } catch (error) {
    return calendarErrorResponse(error, "일정을 수정하지 못했어요.");
  }
};

export const DELETE = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const id = new URL(req.url).searchParams.get("id");
  try {
    await deleteCalendarEvent(id);
    return Response.json({ ok: true });
  } catch (error) {
    return calendarErrorResponse(error, "일정을 삭제하지 못했어요.");
  }
};
