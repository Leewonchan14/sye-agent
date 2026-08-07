import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { ToolLoopAgent, isStepCount } from "ai";

import { getActiveInstructions } from "@/lib/db/instructions";
import { AGENT_INSTRUCTIONS } from "@/lib/prompts/agent";
import { brandMonitor } from "@/lib/tools/brand-monitoring";
import { getCurrentTime } from "@/lib/tools/current-time";
import { exaTools } from "@/lib/tools/exa";
import {
  instructionAdd,
  instructionDelete,
  instructionEdit,
  instructionList,
} from "@/lib/tools/instructions";
import { memoryKeywordSearch, memoryVectorSearch } from "@/lib/tools/memory-search";
import { naverTools } from "@/lib/tools/naver";

// ─────────────────────────────────────────────
// LLM Provider 설정 (주석으로 전환)
// ─────────────────────────────────────────────

// DeepSeek (공식 API) — DEEPSEEK_API_KEY 필요
// https://platform.deepseek.com/api_keys
const deepSeek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY ?? "",
});

// OpenCode Go (구독형) — OPENCODE_GO_API_KEY 필요
// https://opencode.ai/docs/go/
const opencode = createOpenAICompatible({
  name: "opencode-go",
  baseURL: "https://opencode.ai/zen/go/v1",
  headers: {
    Authorization: `Bearer ${process.env.OPENCODE_GO_API_KEY}`,
  },
});

// ── 모델/옵션 선택: 사용할 provider 블록만 주석 해제 ──
// [DeepSeek] (기본값)
const model = deepSeek("deepseek-v4-flash");
const providerOptions = { deepseek: { reasoningEffort: "xhigh" } };

// [OpenCode Go] 전환 시 아래 주석 해제 + 위 DeepSeek 블록 주석 처리
// const model = opencode("deepseek-v4-flash");
// const providerOptions = { opencodeGo: { reasoningEffort: "xhigh" } };

let agent: ToolLoopAgent | undefined;

/** 지시 사항이 변경될 때 호출하면 다음 요청에서 새 agent가 생성됩니다. */
export const invalidateAgent = () => {
  agent = undefined;
};

export const getAgent = async (): Promise<ToolLoopAgent> => {
  if (agent) return agent;

  const exa = await exaTools();

  // 활성화된 사용자 지시 사항들을 기본 instruction 뒤에 추가
  const activeList = await getActiveInstructions();
  const userPart = activeList
    .map((i) => `[${i.label}]\n${i.content}`)
    .join("\n\n---\n\n");
  const instructions = userPart
    ? `${AGENT_INSTRUCTIONS}\n\n## 사용자가 등록한 추가 지시사항\n${userPart}`
    : AGENT_INSTRUCTIONS;

  agent = new ToolLoopAgent({
    id: "trable-agent",
    model,
    providerOptions,
    instructions,
    tools: {
      ...naverTools,
      ...exa,
      brand_monitor: brandMonitor,
      get_current_time: getCurrentTime,
      memory_keyword_search: memoryKeywordSearch,
      memory_vector_search: memoryVectorSearch,
      instruction_add: instructionAdd,
      instruction_edit: instructionEdit,
      instruction_delete: instructionDelete,
      instruction_list: instructionList,
    },
    stopWhen: isStepCount(500),
  }) as unknown as ToolLoopAgent;

  return agent;
};
