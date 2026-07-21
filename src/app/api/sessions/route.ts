import { requireAuth } from "@/lib/auth";
import { listSessionsPaginated, saveSessionState } from "@/lib/db/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 세션 목록을 반환합니다. */
export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    const url = new URL(req.url);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limit = Number(url.searchParams.get("limit")) || 20;

    const result = await listSessionsPaginated({ cursor, limit });
    return Response.json(result);
  } catch (error) {
    console.error("Failed to fetch sessions:", error);
    return Response.json({ sessions: [], nextCursor: null });
  }
};

/** 세션 상태를 저장합니다. */
export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    const { sessionId, messages } = await req.json();
    if (!sessionId || !messages) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }
    await saveSessionState(sessionId, messages);
    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to save session state:", error);
    return Response.json({ error: "Failed to save session state" }, { status: 500 });
  }
};
