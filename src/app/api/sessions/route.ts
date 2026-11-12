import { requireUser } from "@/lib/auth";
import {
  listSessionsPaginated,
  saveSessionState,
  SessionAccessError,
} from "@/lib/db/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 세션 목록을 반환합니다. */
export const GET = async (req: Request) => {
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  try {
    const url = new URL(req.url);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limit = Number(url.searchParams.get("limit")) || 20;

    const result = await listSessionsPaginated(user.id, { cursor, limit });
    return Response.json(result);
  } catch (error) {
    console.error("Failed to fetch sessions:", error);
    return Response.json({ sessions: [], nextCursor: null });
  }
};

/** 세션 상태를 저장합니다. */
export const POST = async (req: Request) => {
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  try {
    const { sessionId, messages } = await req.json();
    if (!sessionId || !messages) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }
    await saveSessionState(user.id, sessionId, messages);
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof SessionAccessError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("Failed to save session state:", error);
    return Response.json({ error: "Failed to save session state" }, { status: 500 });
  }
};
