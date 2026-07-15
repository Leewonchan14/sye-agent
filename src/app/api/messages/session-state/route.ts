import { requireAuth } from "@/lib/auth";
import { saveSessionState } from "@/lib/db";

export const runtime = "nodejs";

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
