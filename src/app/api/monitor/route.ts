import { requireUser } from "@/lib/auth";
import { getMonitorOverview } from "@/lib/db/monitor";
import { monitorErrorResponse } from "@/lib/monitor/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 이 사용자의 고객사·이슈 목록 */
export const GET = async (req: Request) => {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  try {
    return Response.json(await getMonitorOverview(user.id));
  } catch (error) {
    return monitorErrorResponse(error, "모니터링 목록을 불러오지 못했어요.");
  }
};
