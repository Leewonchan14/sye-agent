import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { ToolLoopAgent, isStepCount } from "ai";

import { getActiveInstructions } from "@/lib/db";
import { AGENT_INSTRUCTIONS } from "@/lib/prompts/agent";
import { brandMonitor } from "@/lib/tools/brand-monitoring";
import { getCurrentTime } from "@/lib/tools/current-time";
import { exaTools } from "@/lib/tools/exa";
import { memoryKeywordSearch, memoryVectorSearch } from "@/lib/tools/memory-search";
import { naverTools } from "@/lib/tools/naver";

export const opencode = createOpenAICompatible({
  name: "opencode-go",
  baseURL: "https://opencode.ai/zen/go/v1",
  headers: {
    Authorization: `Bearer ${process.env.OPENCODE_GO_API_KEY}`,
  },
});

let agent: ToolLoopAgent | undefined;

/** system prompt가 변경될 때 호출하면 다음 요청에서 새 agent가 생성됩니다. */
export const invalidateAgent = () => {
  agent = undefined;
};

export const getAgent = async (): Promise<ToolLoopAgent> => {
  if (agent) return agent;

  const exa = await exaTools();

  // 활성화된 사용자 지시 사항이 있으면 기본 instruction 뒤에 추가
  const active = await getActiveInstructions();
  const instructions = active
    ? `${AGENT_INSTRUCTIONS}\n\n## 사용자가 등록한 추가 지시사항\n${active.content}`
    : AGENT_INSTRUCTIONS;

  agent = new ToolLoopAgent({
    id: "trable-agent",
    model: opencode("deepseek-v4-flash"),
    providerOptions: {
      opencodeGo: { reasoningEffort: "xhigh" },
    },
    instructions,
    tools: {
      ...naverTools,
      ...exa,
      brand_monitor: brandMonitor,
      get_current_time: getCurrentTime,
      memory_keyword_search: memoryKeywordSearch,
      memory_vector_search: memoryVectorSearch,
    },
    stopWhen: isStepCount(100),
  }) as unknown as ToolLoopAgent;

  return agent;
};
