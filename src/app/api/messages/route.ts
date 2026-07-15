import { requireAuth } from "@/lib/auth";
import { getMessages } from "@/lib/db";

export const runtime = "nodejs";

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
