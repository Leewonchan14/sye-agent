import { invalidateAgent } from "@/lib/agent";
import { requireAuth } from "@/lib/auth";
import { deleteInstructions, toggleInstructionsActive } from "@/lib/db/instructions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 활성 상태 토글 */
export const PATCH = async (
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

  const instruction = await toggleInstructionsActive(id);
  invalidateAgent();

  return Response.json({ instruction });
};

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

  await deleteInstructions(id);
  invalidateAgent();

  return Response.json({ ok: true });
};
