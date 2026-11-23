import { requireAuth } from "@/lib/auth";
import { getPickBoard, updatePickBoard } from "@/lib/db/picks";
import { readJson } from "@/lib/monitor/api";
import { pickErrorResponse } from "@/lib/picks/api";
import type { PickBoardPatch } from "@/lib/picks/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 둘이 같이 보는 골라 줘 화면 — 적고 있는 고민·후보와, 띄워 둔 뽑기 결과.
 * 어느 브라우저에서 열어도 같은 화면을 보여 주고, 열어 둔 화면은 이걸 다시 읽어 맞춘다.
 */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {
    return Response.json(await getPickBoard());
  } catch (error) {
    return pickErrorResponse(error, "골라 줘 화면을 불러오지 못했어요.");
  }
};

/** 보낸 값만 바꾼다: `title`·`labels`(적고 있는 후보), `activePickId`(띄울 뽑기, null이면 닫기) */
export const PATCH = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {
    const body = ((await readJson(req)) ?? {}) as PickBoardPatch;
    return Response.json(await updatePickBoard(body));
  } catch (error) {
    return pickErrorResponse(error, "골라 줘 화면을 저장하지 못했어요.");
  }
};
