import { invalidateAgent } from "@/lib/agent";
import { requireAuth } from "@/lib/auth";
import { deleteInstructions, listInstructions, saveInstructions, toggleInstructionsActive } from "@/lib/db/instructions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 모든 지시 사항을 반환합니다. */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const all = await listInstructions();

  return Response.json({ instructions: all });
};

/** 새 지시 사항 저장 또는 기존 지시 사항 수정. id가 있으면 수정, 없으면 생성. */
export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const { id, label, content } = await req.json();

  if (!label?.trim() || !content?.trim()) {
    return Response.json({ error: "label과 content는 필수입니다." }, { status: 400 });
  }

  const instruction = await saveInstructions(
    label.trim(),
    content.trim(),
    id || undefined
  );

  invalidateAgent();

  return Response.json({ instruction });
};

/** 지시 사항 삭제 */
export const DELETE = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const { id } = await req.json();
  if (id == null || isNaN(Number(id))) {
    return Response.json({ error: "id가 필요합니다." }, { status: 400 });
  }

  await deleteInstructions(Number(id));
  invalidateAgent();

  return Response.json({ ok: true });
};

/** 활성 상태 토글 */
export const PATCH = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const { id } = await req.json();
  if (id == null || isNaN(Number(id))) {
    return Response.json({ error: "id가 필요합니다." }, { status: 400 });
  }

  const instruction = await toggleInstructionsActive(Number(id));
  invalidateAgent();

  return Response.json({ instruction });
};
