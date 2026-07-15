import { requireAuth } from "@/lib/auth";
import { getMessages, saveMessage } from "@/lib/db";

export const runtime = "nodejs";

export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    const { sessionId, role, content, reasoning } = await req.json();
    if (!sessionId || !role || !content) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!["user", "assistant", "tool"].includes(role)) {
      return Response.json({ error: "Invalid role" }, { status: 400 });
    }
    await saveMessage(sessionId, role, content, reasoning ?? null);
    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to save message:", error);
    return Response.json({ error: "Failed to save message" }, { status: 500 });
  }
};

export const GET = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return Response.json({ messages: [] });
  }

  try {
    const messages = await getMessages(sessionId);
    return Response.json({
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        ...(m.reasoning ? { reasoning: m.reasoning } : {}),
      })),
    });
  } catch (error) {
    console.error("Failed to fetch messages:", error);
    return Response.json({ messages: [] });
  }
};
