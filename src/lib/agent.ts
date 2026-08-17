import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import type { SharedV4ProviderOptions } from "@ai-sdk/provider";

import { isStepCount, type LanguageModel, ToolLoopAgent } from "ai";

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
// LLM Provider 설정
// ─────────────────────────────────────────────

// DeepSeek (공식 API) — DEEPSEEK_API_KEY 필요
// https://platform.deepseek.com/api_keys
const deepSeek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY ?? "",
});

// OpenCode Go (구독형) — OPENCODE_GO_API_KEY 필요
// https://opencode.ai/docs/go/
const opencodeGo = createOpenAICompatible({
  name: "opencode-go",
  baseURL: "https://opencode.ai/zen/go/v1",
  headers: {
    Authorization: `Bearer ${process.env.OPENCODE_GO_API_KEY}`,
  },
});

// OpenCode Zen (게이트웨이) — OPENCODE_GO_API_KEY 필요
// https://opencode.ai/docs/zen/
const opencodeZen = createOpenAICompatible({
  name: "opencode-zen",
  baseURL: "https://opencode.ai/zen/v1",
  headers: {
    Authorization: `Bearer ${process.env.OPENCODE_GO_API_KEY}`,
  },
});

type LLMProvider = "deepseek" | "opencodeGo" | "opencodeZen" | "mimo";

// ── Provider 전환 토글 (LLM_PROVIDER 값만 교체) ────────────────
//  "deepseek"    : DeepSeek 공식 API
//  "opencodeGo"  : OpenCode Go (구독형)
//  "opencodeZen" : OpenCode Zen (게이트웨이)
//  "mimo"          : MIMO API
const LLM_PROVIDER: LLMProvider = "deepseek";

const PROVIDERS: Record<
  LLMProvider,
  { model: LanguageModel; providerOptions: SharedV4ProviderOptions }
> = {
  deepseek: {
    model: deepSeek("deepseek-v4-flash"),
    providerOptions: { deepseek: { reasoningEffort: "xhigh" } },
  },
  opencodeGo: {
    model: opencodeGo("deepseek-v4-flash"),
    providerOptions: { opencodeGo: { reasoningEffort: "xhigh" } },
  },
  opencodeZen: {
    model: opencodeZen("deepseek-v4-flash-free"),
    providerOptions: { opencodeZen: { reasoningEffort: "xhigh" } },
  },
  mimo: {
    model: opencodeGo("mimo-v2.5"),
    providerOptions: { opencodeGo: { reasoningEffort: "high" } },
  },
};

const { model, providerOptions } = PROVIDERS[LLM_PROVIDER];

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
