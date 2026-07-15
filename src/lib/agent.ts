import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { ToolLoopAgent, isStepCount } from "ai";

import { AGENT_INSTRUCTIONS } from "@/lib/prompts/agent";
import { exaTools } from "@/lib/tools/exa";
import { naverTools } from "@/lib/tools/naver";

const opencode = createOpenAICompatible({
  name: "opencode-go",
  baseURL: "https://opencode.ai/zen/go/v1",
  headers: {
    Authorization: `Bearer ${process.env.OPENCODE_GO_API_KEY}`,
  },
});

let agent: ToolLoopAgent | undefined;

export const getAgent = async (): Promise<ToolLoopAgent> => {
  if (agent) return agent;

  const exa = await exaTools();

  agent = new ToolLoopAgent({
    id: "trable-agent",
    model: opencode("deepseek-v4-flash"),
    instructions: AGENT_INSTRUCTIONS,
    tools: {
      ...naverTools,
      ...exa,
    },
    stopWhen: isStepCount(10),
  }) as unknown as ToolLoopAgent;

  return agent;
};
