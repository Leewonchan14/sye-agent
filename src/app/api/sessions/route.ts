import { requireAuth } from "@/lib/auth";
import { listSessions } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    const sessions = await listSessions();
    return Response.json({ sessions });
  } catch (error) {
    console.error("Failed to fetch sessions:", error);
    return Response.json({ sessions: [] });
  }
};
