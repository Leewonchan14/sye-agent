import { z } from "zod";

import { requireAuth } from "@/lib/auth";
import { getMonitorClientPayload, updateMonitorClient } from "@/lib/db/monitor";
import { monitorErrorResponse, parseId, readJson } from "@/lib/monitor/api";
import { reconcileRunPending } from "@/lib/monitor/hermes";
import { TIME } from "@/lib/monitor/period";
import { ruleValueError } from "@/lib/monitor/rules";
import { monitorCategorySchema, monitorRuleSchema } from "@/lib/monitor/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 고객사 화면 데이터 — ?runId= 로 지난 수집 결과를 볼 수 있다. */
export const GET = async (
  req: Request,
  ctx: { params: Promise<{ clientId: string }> }
) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const clientId = parseId((await ctx.params).clientId);
  if (!clientId)
    return Response.json({ error: "clientId가 올바르지 않아요." }, { status: 400 });
  const runId = parseId(new URL(req.url).searchParams.get("runId")) ?? undefined;

  try {
    let payload = await getMonitorClientPayload(clientId, runId);
    if (payload.run?.pendingSince) {
      await reconcileRunPending(payload.run.id);
      payload = await getMonitorClientPayload(clientId, payload.run.id);
    }
    return Response.json(payload);
  } catch (error) {
    return monitorErrorResponse(error, "수집 결과를 불러오지 못했어요.");
  }
};

const patchSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  categories: z
    .array(monitorCategorySchema)
    .min(1, "카테고리는 하나 이상 있어야 해요.")
    .max(12)
    .refine((cs) => new Set(cs.map((c) => c.key)).size === cs.length, {
      message: "카테고리 key가 겹쳐요.",
    })
    .refine((cs) => new Set(cs.map((c) => c.name.trim())).size === cs.length, {
      message: "같은 이름의 카테고리가 있어요.",
    })
    .optional(),
  rules: z
    .array(
      monitorRuleSchema.superRefine((rule, ctx) => {
        const error = ruleValueError(rule);
        if (error) ctx.addIssue({ code: "custom", message: `${rule.title}: ${error}` });
      })
    )
    .max(40)
    .refine((rules) => new Set(rules.map((r) => r.id)).size === rules.length, {
      message: "규칙 id가 겹쳐요.",
    })
    .optional(),
  reportTitle: z.string().max(200).optional(),
  greeting: z.string().max(1000).optional(),
  closing: z.string().max(500).optional(),
  autoCollect: z.boolean().optional(),
  weekdaysOnly: z.boolean().optional(),
  reportEmails: z
    .array(z.email("메일 주소 형식이 올바르지 않아요.").max(200))
    .max(20)
    .refine((list) => new Set(list).size === list.length, {
      message: "같은 메일 주소가 두 번 들어 있어요.",
    })
    .optional(),
  collectTime: z
    .string()
    .regex(TIME, "시각 형식이 올바르지 않아요.")
    .nullable()
    .optional(),
});

export const PATCH = async (
  req: Request,
  ctx: { params: Promise<{ clientId: string }> }
) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const clientId = parseId((await ctx.params).clientId);
  if (!clientId)
    return Response.json({ error: "clientId가 올바르지 않아요." }, { status: 400 });

  try {
    const patch = patchSchema.parse(await readJson(req));
    const client = await updateMonitorClient(clientId, patch);
    return Response.json({ client });
  } catch (error) {
    return monitorErrorResponse(error, "고객사 설정을 저장하지 못했어요.");
  }
};
