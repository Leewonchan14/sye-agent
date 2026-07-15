import { createAgentUIStreamResponse } from "ai";

import { getAgent } from "@/lib/agent";
import { requireAuth } from "@/lib/auth";
import { saveSessionState } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  // Validate required configuration
  const missing: string[] = [];
  if (!process.env.OPENCODE_GO_API_KEY) missing.push("OPENCODE_GO_API_KEY");
  if (!process.env.NAVER_CLIENT_ID) missing.push("NAVER_CLIENT_ID");
  if (!process.env.NAVER_CLIENT_SECRET) missing.push("NAVER_CLIENT_SECRET");

  if (missing.length > 0) {
    return Response.json(
      {
        error: `${missing.join(", ")}이 설정되지 않았습니다. .env 파일을 확인해주세요.`,
      },
      { status: 500 }
    );
  }

  const { messages, sessionId } = await req.json();

  const agent = await getAgent();

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    onEnd: async ({ messages: allMessages }) => {
      if (!sessionId || !allMessages) return;
      try {
        await saveSessionState(sessionId, allMessages);
      } catch (err) {
        console.error("Failed to save session state:", err);
      }
    },
  });
};
