import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { createMonitorClient } from "@/lib/db/monitor";
import { monitorErrorResponse, readJson } from "@/lib/monitor/api";
import { startCollectNow } from "@/lib/monitor/daily-collect";
import { publicOrigin } from "@/lib/monitor/origin";
import { monitorCategorySchema, monitorRuleSchema } from "@/lib/monitor/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(40),
  categories: z
    .array(monitorCategorySchema)
    .min(1, "카테고리는 하나 이상 있어야 해요.")
    .max(12)
    .optional(),
  rules: z.array(monitorRuleSchema).max(40).optional(),
  weekdaysOnly: z.boolean().optional(),
  collectNow: z.boolean().optional(),
});

export const POST = async (req: Request) => {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  try {
    const { collectNow, ...body } = bodySchema.parse(await readJson(req));
    const client = await createMonitorClient({ ...body, userId: user.id });
    let collectError: string | null = null;
    if (collectNow) {
      await startCollectNow(publicOrigin(req), client).catch((error: unknown) => {
        collectError =
          error instanceof Error ? error.message : "수집을 시작하지 못했어요.";
      });
    }
    return Response.json({ client, collectError }, { status: 201 });
  } catch (error) {
    if ((error as { cause?: { code?: string } })?.cause?.code === "23505") {
      return Response.json({ error: "이미 있는 slug예요." }, { status: 409 });
    }
    return monitorErrorResponse(error, "고객사를 만들지 못했어요.");
  }
};
