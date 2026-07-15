import { requireAuth } from "@/lib/auth";
import { getSessionState } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return Response.json({ state: [] });
  }

  try {
    const state = await getSessionState(sessionId);
    return Response.json({ state: state ?? [] });
  } catch (error) {
    console.error("Failed to fetch session state:", error);
    return Response.json({ state: [] });
  }
};
