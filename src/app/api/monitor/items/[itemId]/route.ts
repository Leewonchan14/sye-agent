import { z } from "zod";

import { requireAuth } from "@/lib/auth";
import { updateMonitorItem } from "@/lib/db/monitor";
import { monitorErrorResponse, parseId, readJson } from "@/lib/monitor/api";
import { importanceSchema, sentimentSchema } from "@/lib/monitor/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  included: z.boolean().optional(),
  category: z.string().max(40).nullable().optional(),
  subcategory: z.string().max(40).nullable().optional(),
  sentiment: sentimentSchema.nullable().optional(),
  importance: importanceSchema.nullable().optional(),
});

/** 포함/제외, 카테고리 이동, 논조·중요도 고치기 */
export const PATCH = async (
  req: Request,
  ctx: { params: Promise<{ itemId: string }> }
) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const itemId = parseId((await ctx.params).itemId);
  if (!itemId)
    return Response.json({ error: "itemId가 올바르지 않아요." }, { status: 400 });

  try {
    const patch = patchSchema.parse(await readJson(req));
    const item = await updateMonitorItem(itemId, patch);
    return Response.json({ item });
  } catch (error) {
    return monitorErrorResponse(error, "기사 상태를 바꾸지 못했어요.");
  }
};
