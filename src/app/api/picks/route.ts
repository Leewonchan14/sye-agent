import { requireAuth } from "@/lib/auth";
import { createPick, listPicks } from "@/lib/db/picks";
import { readJson } from "@/lib/monitor/api";
import { pickErrorResponse } from "@/lib/picks/api";
import type { CreatePickInput } from "@/lib/picks/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 최근 뽑기 기록 */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {
    return Response.json({ picks: await listPicks() });
  } catch (error) {
    return pickErrorResponse(error, "뽑기 기록을 불러오지 못했어요.");
  }
};

/** 후보를 받아 서버에서 하나를 뽑는다. 결과가 저장되므로 어느 폰에서 열어도 같다. */
export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {
    const body = ((await readJson(req)) ?? {}) as CreatePickInput;
    return Response.json(await createPick(body), { status: 201 });
  } catch (error) {
    return pickErrorResponse(error, "뽑지 못했어요.");
  }
};
