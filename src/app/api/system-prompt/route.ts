import { invalidateAgent } from "@/lib/agent";
import { requireAuth } from "@/lib/auth";
import { getActiveSystemPrompt, listSystemPrompts, saveSystemPrompt } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 현재 활성 prompt + 전체 목록 조회 */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const [active, history] = await Promise.all([
    getActiveSystemPrompt(),
    listSystemPrompts(),
  ]);

  return Response.json({ active, history });
};

/** 새 system prompt 저장 (기존 활성 prompt는 비활성화) */
export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const { label, content } = await req.json();

  if (!label?.trim() || !content?.trim()) {
    return Response.json({ error: "label과 content는 필수입니다." }, { status: 400 });
  }

  const prompt = await saveSystemPrompt(label.trim(), content.trim());

  // agent 캐시 초기화 — 다음 요청부터 새 prompt 반영
  invalidateAgent();

  return Response.json({ prompt });
};
