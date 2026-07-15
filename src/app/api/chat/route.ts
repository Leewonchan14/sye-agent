import { createAgentUIStreamResponse } from "ai";

import { getAgent } from "@/lib/agent";
import { requireAuth } from "@/lib/auth";
import { saveMessage } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

const extractTextParts = (msg: { parts?: { type: string; text?: string }[] }): string =>
  msg.parts
    ?.filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("")
    .trim() || "";

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

  // Save user message to Neon DB (non-blocking)
  const lastMsg = messages[messages.length - 1];
  if (lastMsg?.role === "user" && sessionId) {
    const userText = extractTextParts(lastMsg);
    if (userText) {
      saveMessage(sessionId, "user", userText).catch((err) =>
        console.error("Failed to save user message:", err)
      );
    }
  }

  const agent = await getAgent();

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    onStepEnd: async (step) => {
      if (!sessionId) return;

      // Save assistant text + reasoning
      if (step.text || step.reasoningText) {
        saveMessage(
          sessionId,
          "assistant",
          step.text ?? "",
          step.reasoningText,
        ).catch((err) =>
          console.error("Failed to save assistant message:", err)
        );
      }

      // Save tool call + result pairs
      for (const tc of step.toolCalls) {
        const result = step.toolResults.find(
          (r) => r.toolCallId === tc.toolCallId
        );
        let errorContent: unknown = null;
        if (result && typeof result === "object" && "error" in result) {
          errorContent = (result as { error: unknown }).error;
        }
        const content = JSON.stringify({
          toolName: tc.toolName,
          input: tc.input,
          output: result?.output ?? null,
          error: errorContent,
        });
        saveMessage(sessionId, "tool", content).catch((err) =>
          console.error("Failed to save tool message:", err)
        );
      }
    },
  });
};
