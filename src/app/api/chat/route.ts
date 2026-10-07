import { createAgentUIStreamResponse } from "ai";

import { getAgent } from "@/lib/agent";
import { requireAuth } from "@/lib/auth";
import { saveSessionState } from "@/lib/db/session";
import { agentErrorMessage } from "@/lib/error-text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  // Validate required configuration
  const missing: string[] = [];
  const hasProviderKey =
    !!process.env.DEEPSEEK_API_KEY || !!process.env.OPENCODE_GO_API_KEY;
  if (!hasProviderKey) missing.push("DEEPSEEK_API_KEY 또는 OPENCODE_GO_API_KEY");
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

  let messages: unknown[];
  let sessionId: string | undefined;
  try {
    ({ messages, sessionId } = await req.json());
  } catch {
    return Response.json({ error: "요청 본문을 읽을 수 없습니다." }, { status: 400 });
  }

  try {
    const agent = await getAgent(sessionId);

    return await createAgentUIStreamResponse({
      agent,
      uiMessages: messages,
      // 기본값은 "An error occurred." 라서 실제 원인이 클라이언트까지 전달되지 않는다.
      onError: (error) => {
        console.error("[chat] stream error:", error);
        return agentErrorMessage(error);
      },
      onEnd: async ({ messages: allMessages }) => {
        if (!sessionId || !allMessages) return;
        try {
          await saveSessionState(sessionId, allMessages);
        } catch (err) {
          console.error("Failed to save session state:", err);
        }
      },
    });
  } catch (error) {
    console.error("[chat] failed to start stream:", error);
    return Response.json({ error: agentErrorMessage(error) }, { status: 500 });
  }
};
