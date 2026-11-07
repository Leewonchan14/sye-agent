import { requireAuth } from "@/lib/auth";
import { createPresetClients, getMonitorOverview } from "@/lib/db/monitor";
import { monitorErrorResponse } from "@/lib/monitor/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 고객사·이슈 목록 */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {
    return Response.json(await getMonitorOverview());
  } catch (error) {
    return monitorErrorResponse(error, "모니터링 목록을 불러오지 못했어요.");
  }
};

/** 기본 고객사(홍콩관광청·파나소닉코리아) 만들기 */
export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;
  try {
    await createPresetClients();
    return Response.json(await getMonitorOverview(), { status: 201 });
  } catch (error) {
    return monitorErrorResponse(error, "기본 고객사를 만들지 못했어요.");
  }
};
