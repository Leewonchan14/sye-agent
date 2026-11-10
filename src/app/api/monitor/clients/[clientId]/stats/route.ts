import { z } from "zod";

import { requireAuth } from "@/lib/auth";
import { getClientStats } from "@/lib/db/monitor";
import { monitorErrorResponse, parseId } from "@/lib/monitor/api";
import { STATS_DAYS, STATS_SCOPES } from "@/lib/monitor/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  days: z.coerce
    .number()
    .refine(
      (d) => (STATS_DAYS as readonly number[]).includes(d),
      "기간은 7·30·90일이에요."
    )
    .default(30),
  scope: z.enum(STATS_SCOPES).default("included"),
  category: z.string().max(40).nullish(),
});

/** 매체·기자 통계 — ?days=30&scope=included&category=own */
export const GET = async (
  req: Request,
  ctx: { params: Promise<{ clientId: string }> }
) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const clientId = parseId((await ctx.params).clientId);
  if (!clientId)
    return Response.json({ error: "clientId가 올바르지 않아요." }, { status: 400 });

  try {
    const params = new URL(req.url).searchParams;
    const query = querySchema.parse({
      days: params.get("days") ?? undefined,
      scope: params.get("scope") ?? undefined,
      category: params.get("category") || null,
    });
    const stats = await getClientStats(clientId, {
      days: query.days as (typeof STATS_DAYS)[number],
      scope: query.scope,
      category: query.category ?? null,
    });
    return Response.json(stats);
  } catch (error) {
    return monitorErrorResponse(error, "통계를 불러오지 못했어요.");
  }
};
