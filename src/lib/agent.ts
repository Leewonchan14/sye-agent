import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { ToolLoopAgent, isStepCount } from "ai";

import { AGENT_INSTRUCTIONS } from "@/lib/prompts/agent";
import { brandMonitor } from "@/lib/tools/brand-monitoring";
import { exaTools } from "@/lib/tools/exa";
import { naverTools } from "@/lib/tools/naver";

export const opencode = createOpenAICompatible({
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
    providerOptions: {
      opencodeGo: { reasoningEffort: "xhigh" },
    },
    instructions: AGENT_INSTRUCTIONS,
    tools: {
      ...naverTools,
      ...exa,
      brand_monitor: brandMonitor,
    },
    stopWhen: isStepCount(100),
  }) as unknown as ToolLoopAgent;

  return agent;
};
