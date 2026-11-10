import { requireAuth } from "@/lib/auth";
import { dateErrorResponse } from "@/lib/dates/api";
import { getDateOverview } from "@/lib/dates/overview";
import { dateSettingsSchema } from "@/lib/dates/types";
import { saveDateSettings } from "@/lib/db/dates";
import { readJson } from "@/lib/monitor/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PUT = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {
    await saveDateSettings(dateSettingsSchema.parse(await readJson(req)));
    return Response.json(await getDateOverview(null));
  } catch (error) {
    return dateErrorResponse(error, "조사 조건을 저장하지 못했어요.");
  }
};
