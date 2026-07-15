import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { ToolLoopAgent, isStepCount } from "ai";

import { AGENT_INSTRUCTIONS } from "@/lib/prompts/agent";
import { exaTools } from "@/lib/tools/exa";
import { naverTools } from "@/lib/tools/naver";

const deepseek = createOpenAICompatible({
  name: "deepseek",
  baseURL: "https://api.deepseek.com/v1",
  apiKey: process.env.DEEPSEEK_API_KEY!,
});

let agent: ToolLoopAgent | undefined;

export const getAgent = async (): Promise<ToolLoopAgent> => {
  if (agent) return agent;

  const exa = await exaTools();

  agent = new ToolLoopAgent({
    id: "trable-agent",
    model: deepseek("deepseek-flash-v4"),
    instructions: AGENT_INSTRUCTIONS,
    tools: {
      ...naverTools,
      ...exa,
    },
    stopWhen: isStepCount(10),
  }) as unknown as ToolLoopAgent;

  return agent;
};
