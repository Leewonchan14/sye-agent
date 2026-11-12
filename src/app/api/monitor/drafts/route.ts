import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { monitorErrorResponse, readJson } from "@/lib/monitor/api";
import { startSetupDraft } from "@/lib/monitor/draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(40),
  request: z.string().trim().min(1).max(2000),
});

/** 고객사 등록 — 평소 요청 문장으로 카테고리·규칙 초안을 만들게 한다. */
export const POST = async (req: Request) => {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  try {
    const { name, request } = bodySchema.parse(await readJson(req));
    return Response.json(
      { draftId: await startSetupDraft(user.id, name, request) },
      { status: 202 }
    );
  } catch (error) {
    return monitorErrorResponse(error, "에이전트에게 초안을 맡기지 못했어요.");
  }
};
