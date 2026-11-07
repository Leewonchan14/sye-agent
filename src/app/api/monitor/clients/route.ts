import { z } from "zod";

import { requireAuth } from "@/lib/auth";
import { createMonitorClient } from "@/lib/db/monitor";
import { monitorErrorResponse, readJson } from "@/lib/monitor/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(40),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,40}$/, "slug는 영문 소문자·숫자·하이픈 2~40자예요."),
});

export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {
    const body = bodySchema.parse(await readJson(req));
    const client = await createMonitorClient(body);
    return Response.json({ client }, { status: 201 });
  } catch (error) {
    if ((error as { cause?: { code?: string } })?.cause?.code === "23505") {
      return Response.json({ error: "이미 있는 slug예요." }, { status: 409 });
    }
    return monitorErrorResponse(error, "고객사를 만들지 못했어요.");
  }
};
