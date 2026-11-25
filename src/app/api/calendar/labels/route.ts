import { requireAuth } from "@/lib/auth";
import {
  calendarErrorResponse,
  createCalendarLabel,
  deleteCalendarLabel,
  getCalendarLabels,
  updateCalendarLabel,
} from "@/lib/db/calendar";
import { readJsonBody } from "@/lib/ledger/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const badBody = () =>
  Response.json({ error: "요청 본문이 올바르지 않아요." }, { status: 400 });

export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    const labels = await getCalendarLabels();
    return Response.json({ labels });
  } catch (error) {
    return calendarErrorResponse(error, "라벨을 불러오지 못했어요.");
  }
};

export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body) return badBody();

  try {
    const label = await createCalendarLabel(body);
    return Response.json({ label }, { status: 201 });
  } catch (error) {
    return calendarErrorResponse(error, "라벨을 추가하지 못했어요.");
  }
};

export const PATCH = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body) return badBody();

  const { id, ...rest } = body;
  try {
    const label = await updateCalendarLabel(id, rest);
    return Response.json({ label });
  } catch (error) {
    return calendarErrorResponse(error, "라벨을 수정하지 못했어요.");
  }
};

export const DELETE = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const id = new URL(req.url).searchParams.get("id");
  try {
    await deleteCalendarLabel(id);
    return Response.json({ ok: true });
  } catch (error) {
    return calendarErrorResponse(error, "라벨을 삭제하지 못했어요.");
  }
};
