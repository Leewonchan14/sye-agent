import { requireAuth } from "@/lib/auth";
import { getIssueRow, getRunRow } from "@/lib/db/monitor";
import { parseId } from "@/lib/monitor/api";
import { readRunProgress } from "@/lib/monitor/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 돌고 있는 수집·집계가 얼마나 왔는지 — 화면이 떠 있는 동안 주기적으로 부른다. */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const params = new URL(req.url).searchParams;
  const kind = params.get("kind");
  const id = parseId(params.get("id"));
  if (!id || (kind !== "run" && kind !== "issue")) {
    return Response.json({ error: "kind 또는 id가 올바르지 않아요." }, { status: 400 });
  }

  const row = kind === "run" ? await getRunRow(id) : await getIssueRow(id);
  if (!row?.pendingHermesRunId) return Response.json({ progress: null });
  // 진행 표시는 보조 정보라 Hermes를 못 읽어도 오류로 만들지 않는다.
  const progress = await readRunProgress(row.pendingHermesRunId).catch(() => null);
  return Response.json({ progress });
};
