import { requireAuth } from "@/lib/auth";
import { DEFAULT_SUGGESTIONS } from "@/lib/data/default-suggestions";
import { resetSuggestions } from "@/lib/db/suggestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 모든 제안을 기본값으로 초기화합니다. */
export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  await resetSuggestions(DEFAULT_SUGGESTIONS);

  return Response.json({ ok: true, count: DEFAULT_SUGGESTIONS.length });
};
