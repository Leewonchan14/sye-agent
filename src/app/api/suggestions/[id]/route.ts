import { requireAuth } from "@/lib/auth";
import { deleteSuggestion } from "@/lib/db/suggestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 삭제 */
export const DELETE = async (
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return Response.json({ error: "잘못된 id입니다." }, { status: 400 });
  }

  await deleteSuggestion(id);

  return Response.json({ ok: true });
};
