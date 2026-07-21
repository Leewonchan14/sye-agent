import { requireAuth } from "@/lib/auth";
import { listSuggestions, saveSuggestion } from "@/lib/db/suggestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 모든 제안을 반환합니다. */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const all = await listSuggestions();

  return Response.json({ suggestions: all });
};

/** 새 제안 저장 또는 기존 제안 수정. id가 있으면 수정, 없으면 생성. */
export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const { id, label, prompt, sortOrder } = await req.json();

  if (!label?.trim() || !prompt?.trim()) {
    return Response.json({ error: "label과 prompt는 필수입니다." }, { status: 400 });
  }

  const suggestion = await saveSuggestion(
    label.trim(),
    prompt.trim(),
    id || undefined,
    sortOrder ?? undefined
  );

  return Response.json({ suggestion });
};
