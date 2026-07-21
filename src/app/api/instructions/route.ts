import { invalidateAgent } from "@/lib/agent";
import { requireAuth } from "@/lib/auth";
import { getActiveInstructions, listInstructions, saveInstructions } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 현재 활성 지시 사항 + 전체 목록 조회 */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const [active, history] = await Promise.all([
    getActiveInstructions(),
    listInstructions(),
  ]);

  return Response.json({ active, history });
};

/** 새 지시 사항 저장 (기존 활성 지시 사항은 비활성화) */
export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const { label, content } = await req.json();

  if (!label?.trim() || !content?.trim()) {
    return Response.json({ error: "label과 content는 필수입니다." }, { status: 400 });
  }

  const instruction = await saveInstructions(label.trim(), content.trim());

  invalidateAgent();

  return Response.json({ instruction });
};
