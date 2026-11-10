import { dateErrorResponse, requireDigestAccess } from "@/lib/dates/api";
import { agentDigestSchema } from "@/lib/dates/types";
import { ingestDigest } from "@/lib/db/dates";
import { readJson } from "@/lib/monitor/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 하치와레 전용 — 데이트 장소 조사 결과 저장.
 * 같은 인스타그램 게시물은 한 번만 저장하고, 마지막 묶음(final 생략 또는 true)을 받으면 "찾는 중"을 푼다.
 */
export const POST = async (req: Request) => {
  try {
    const input = agentDigestSchema.parse(await readJson(req));
    const authError = await requireDigestAccess(req, input.digestId);
    if (authError) return authError;
    return Response.json(await ingestDigest(input), { status: 201 });
  } catch (error) {
    return dateErrorResponse(error, "데이트 장소를 저장하지 못했어요.");
  }
};
