import { requireAuth } from "@/lib/auth";
import {
  calendarErrorResponse,
  getCalendarSettings,
  patchCalendarSettings,
} from "@/lib/db/calendar";
import { readJsonBody } from "@/lib/ledger/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    const settings = await getCalendarSettings();
    return Response.json({ settings });
  } catch (error) {
    return calendarErrorResponse(error, "설정을 불러오지 못했어요.");
  }
};

export const PATCH = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body)
    return Response.json({ error: "요청 본문이 올바르지 않아요." }, { status: 400 });

  try {
    const settings = await patchCalendarSettings(body);
    return Response.json({ settings });
  } catch (error) {
    return calendarErrorResponse(error, "설정을 저장하지 못했어요.");
  }
};
