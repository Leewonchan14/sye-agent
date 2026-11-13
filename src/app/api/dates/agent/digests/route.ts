import { after } from "next/server";

import { dateErrorResponse, requireDigestAccess } from "@/lib/dates/api";
import { agentDigestSchema } from "@/lib/dates/types";
import { ingestDigest, refreshSpotPhotos } from "@/lib/db/dates";
import { readJson } from "@/lib/monitor/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 하치와레 전용 — 데이트 추천(장소·즐길거리) 조사 결과 저장.
 * 같은 인스타그램 게시물은 한 번만 저장하고, 마지막 묶음(final 생략 또는 true)을 받으면 "찾는 중"을 푼다.
 * 응답을 돌려준 뒤 새 장소의 대표 사진 주소를 미리 읽어 둔다.
 */
export const POST = async (req: Request) => {
  try {
    const input = agentDigestSchema.parse(await readJson(req));
    const authError = await requireDigestAccess(req, input.digestId);
    if (authError) return authError;
    const { insertedIds, ...result } = await ingestDigest(input);
    if (insertedIds.length) {
      after(() =>
        refreshSpotPhotos({ spotIds: insertedIds }).catch((error) =>
          console.error("[date-spots] photo", error)
        )
      );
    }
    return Response.json(result, { status: 201 });
  } catch (error) {
    return dateErrorResponse(error, "데이트 추천을 저장하지 못했어요.");
  }
};
