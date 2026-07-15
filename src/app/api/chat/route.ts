import { createAgentUIStreamResponse } from "ai";

import { getAgent } from "@/lib/agent";
import { requireAuth } from "@/lib/auth";
import { saveMessage } from "@/lib/db";

export const runtime = "edge";
export const maxDuration = 60;

export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  // Validate required configuration
  if (!process.env.DEEPSEEK_API_KEY) {
    return Response.json(
      {
        error: "DEEPSEEK_API_KEY가 설정되지 않았습니다. .env 파일을 확인해주세요.",
      },
      { status: 500 }
    );
  }

  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    return Response.json(
      {
        error:
          "NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET이 설정되지 않았습니다. .env 파일을 확인해주세요.",
      },
      { status: 500 }
    );
  }

  const { messages, sessionId } = await req.json();

  // Save user message to Neon DB (non-blocking)
  const lastMsg = messages[messages.length - 1];
  if (lastMsg?.role === "user" && sessionId) {
    saveMessage(sessionId, "user", lastMsg.content).catch((err) =>
      console.error("Failed to save user message:", err)
    );
  }

  const agent = await getAgent();

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    onEnd: async (event) => {
      if (!sessionId) return;

      const responseMsg = event.responseMessage;
      if (responseMsg?.parts) {
        const textContent = responseMsg.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("");

        if (textContent) {
          saveMessage(sessionId, "assistant", textContent).catch((err) =>
            console.error("Failed to save assistant message:", err)
          );
        }
      }
    },
  });
};
