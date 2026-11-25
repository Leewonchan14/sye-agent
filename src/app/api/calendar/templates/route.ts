import { requireAuth } from "@/lib/auth";
import {
  calendarErrorResponse,
  createCalendarTemplate,
  deleteCalendarTemplate,
  listCalendarTemplates,
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
    const templates = await listCalendarTemplates();
    return Response.json({ templates });
  } catch (error) {
    return calendarErrorResponse(error, "템플릿을 불러오지 못했어요.");
  }
};

export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body) return badBody();

  try {
    const template = await createCalendarTemplate(body);
    return Response.json({ template }, { status: 201 });
  } catch (error) {
    return calendarErrorResponse(error, "템플릿을 저장하지 못했어요.");
  }
};

export const DELETE = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const id = new URL(req.url).searchParams.get("id");
  try {
    await deleteCalendarTemplate(id);
    return Response.json({ ok: true });
  } catch (error) {
    return calendarErrorResponse(error, "템플릿을 삭제하지 못했어요.");
  }
};
