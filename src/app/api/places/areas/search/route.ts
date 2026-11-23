import { requireAuth } from "@/lib/auth";
import { searchAreaCandidates } from "@/lib/places/naver-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 지역 이름(?q=)으로 중심 후보를 찾는다. 역을 먼저 보여 준다. */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (!q || q.length > 20) {
    return Response.json({ error: "지역 이름을 1~20자로 써 주세요." }, { status: 400 });
  }
  return Response.json({ candidates: await searchAreaCandidates(q) });
};
