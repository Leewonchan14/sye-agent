import { requireUser } from "@/lib/auth";
import { assertIssueOwner, assertRunOwner } from "@/lib/db/monitor";
import { monitorErrorResponse, parseId } from "@/lib/monitor/api";
import { readRunProgress } from "@/lib/monitor/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 돌고 있는 수집·집계가 얼마나 왔는지 — 화면이 떠 있는 동안 주기적으로 부른다. */
export const GET = async (req: Request) => {
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  const params = new URL(req.url).searchParams;
  const kind = params.get("kind");
  const id = parseId(params.get("id"));
  if (!id || (kind !== "run" && kind !== "issue")) {
    return Response.json({ error: "kind 또는 id가 올바르지 않아요." }, { status: 400 });
  }

  try {
    const row =
      kind === "run"
        ? await assertRunOwner(user.id, id)
        : await assertIssueOwner(user.id, id);
    if (!row.pendingHermesRunId) return Response.json({ progress: null });
    // 진행 표시는 보조 정보라 Hermes를 못 읽어도 오류로 만들지 않는다.
    const progress = await readRunProgress(row.pendingHermesRunId).catch(() => null);
    return Response.json({ progress });
  } catch (error) {
    return monitorErrorResponse(error, "진행 상황을 불러오지 못했어요.");
  }
};
