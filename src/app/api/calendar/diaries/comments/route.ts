import { requireAuth } from "@/lib/auth";
import type { DiaryCommentInput } from "@/lib/calendar/types";
import {
  addCalendarDiaryComment,
  calendarErrorResponse,
  deleteCalendarDiaryComment,
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
    const diary = await addCalendarDiaryComment(body.diaryId, {
      author: body.author,
      body: body.body,
    } as DiaryCommentInput);
    return Response.json({ diary });
  } catch (error) {
    return calendarErrorResponse(error, "댓글을 남기지 못했어요.");
  }
};

export const DELETE = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const params = new URL(req.url).searchParams;
  try {
    const diary = await deleteCalendarDiaryComment(
      params.get("diaryId"),
      params.get("commentId")
    );
    return Response.json({ diary });
  } catch (error) {
    return calendarErrorResponse(error, "댓글을 삭제하지 못했어요.");
  }
};
