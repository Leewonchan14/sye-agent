import { requireUser } from "@/lib/auth";
import {
  deleteSuggestion,
  listSuggestions,
  resetSuggestions,
  saveSuggestion,
} from "@/lib/db/suggestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 모든 제안을 반환합니다. */
export const GET = async (req: Request) => {
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  const all = await listSuggestions(user.id);

  return Response.json({ suggestions: all });
};

/** 새 제안 저장 또는 기존 제안 수정. id가 있으면 수정, 없으면 생성. */
export const POST = async (req: Request) => {
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  const { id, label, prompt, sortOrder } = await req.json();

  if (!label?.trim() || !prompt?.trim()) {
    return Response.json({ error: "label과 prompt는 필수입니다." }, { status: 400 });
  }

  let suggestion;
  try {
    suggestion = await saveSuggestion(
      user.id,
      label.trim(),
      prompt.trim(),
      id || undefined,
      sortOrder ?? undefined
    );
  } catch {
    return Response.json({ error: "항목을 찾을 수 없습니다." }, { status: 404 });
  }

  return Response.json({ suggestion });
};

/** 제안 삭제 */
export const DELETE = async (req: Request) => {
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  const { id } = await req.json();
  if (id == null || isNaN(Number(id))) {
    return Response.json({ error: "id가 필요합니다." }, { status: 400 });
  }

  await deleteSuggestion(user.id, Number(id));

  return Response.json({ ok: true });
};

/** 모든 제안을 기본값으로 초기화 */
export const PATCH = async (req: Request) => {
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  const count = await resetSuggestions(user.id);

  return Response.json({ ok: true, count });
};
