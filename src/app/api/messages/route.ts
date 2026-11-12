import { requireUser } from "@/lib/auth";
import { getSessionState } from "@/lib/db/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async (req: Request) => {
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return Response.json({ state: [] });
  }

  try {
    const state = await getSessionState(user.id, sessionId);
    return Response.json({ state: state ?? [] });
  } catch (error) {
    console.error("Failed to fetch session state:", error);
    return Response.json({ state: [] });
  }
};
