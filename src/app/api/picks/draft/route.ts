import { requireAuth } from "@/lib/auth";
import { getPickDraft, savePickDraft } from "@/lib/db/picks";
import { readJson } from "@/lib/monitor/api";
import { pickErrorResponse } from "@/lib/picks/api";
import type { PickDraftInput } from "@/lib/picks/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 돌리기 전에 적고 있던 고민과 후보 — 다른 폰에서 열어도 이어서 쓴다. */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {
    return Response.json(await getPickDraft());
  } catch (error) {
    return pickErrorResponse(error, "쓰던 후보를 불러오지 못했어요.");
  }
};

export const PUT = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {
    const body = ((await readJson(req)) ?? {}) as PickDraftInput;
    return Response.json(await savePickDraft(body));
  } catch (error) {
    return pickErrorResponse(error, "쓰던 후보를 저장하지 못했어요.");
  }
};
