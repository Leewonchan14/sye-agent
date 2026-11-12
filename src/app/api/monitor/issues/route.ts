import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { createMonitorIssue } from "@/lib/db/monitor";
import { monitorErrorResponse, readJson } from "@/lib/monitor/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(80),
  clientId: z.number().int().positive().nullable().default(null),
  keywords: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  brandTerms: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

export const POST = async (req: Request) => {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  try {
    const body = bodySchema.parse(await readJson(req));
    const issue = await createMonitorIssue({ ...body, userId: user.id });
    return Response.json({ issue }, { status: 201 });
  } catch (error) {
    return monitorErrorResponse(error, "이슈를 만들지 못했어요.");
  }
};
