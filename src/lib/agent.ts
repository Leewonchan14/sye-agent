import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import type { SharedV4ProviderOptions } from "@ai-sdk/provider";

import { isStepCount, type LanguageModel, ToolLoopAgent } from "ai";

import { getActiveInstructions } from "@/lib/db/instructions";
import {
  createOpenCodeRotatingFetch,
  getOpenCodeGoPool,
  getOpenCodeZenPool,
} from "@/lib/opencode-keys";
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
import { playwrightTools } from "@/lib/tools/playwright";
import { sandboxTools } from "@/lib/tools/sandbox";

// ─────────────────────────────────────────────
// LLM Provider 설정
// ─────────────────────────────────────────────

// DeepSeek (공식 API) — DEEPSEEK_API_KEY 필요
// https://platform.deepseek.com/api_keys
const deepSeek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY ?? "",
});

// OpenCode Go (구독형) — OPENCODE_GO_API_KEYS(콤마 구분 키 목록) 또는 OPENCODE_GO_API_KEY
// https://opencode.ai/docs/go/
// Authorization 헤더는 키 풀이 요청마다 주입하고, 키 한도(402/429)면 다음 키로 자동 재시도한다.
const opencodeGo = createOpenAICompatible({
  name: "opencode-go",
  baseURL: "https://opencode.ai/zen/go/v1",
  headers: {
    "User-Agent": "sye-agent/1.0",
  },
  fetch: createOpenCodeRotatingFetch(getOpenCodeGoPool(), "opencode-go"),
});

// OpenCode Zen (게이트웨이) — OPENCODE_ZEN_API_KEYS 또는 OPENCODE_ZEN_API_KEY (없으면 Go 키 폴백)
// https://opencode.ai/docs/zen/
const opencodeZen = createOpenAICompatible({
  name: "opencode-zen",
  baseURL: "https://opencode.ai/zen/v1",
  fetch: createOpenCodeRotatingFetch(getOpenCodeZenPool(), "opencode-zen"),
});

type LLMProvider = "deepseek" | "opencodeGo" | "opencodeZen" | "mimo";

// ── Provider 전환 토글 (LLM_PROVIDER 값만 교체) ────────────────
//  "deepseek"    : DeepSeek 공식 API
//  "opencodeGo"  : OpenCode Go (구독형)
//  "opencodeZen" : OpenCode Zen (게이트웨이)
//  "mimo"          : MIMO API
const LLM_PROVIDER: LLMProvider = "opencodeGo";

const PROVIDERS: Record<
  LLMProvider,
  { model: LanguageModel; providerOptions: SharedV4ProviderOptions }
> = {
  deepseek: {
    model: deepSeek("deepseek-v4-flash"),
    providerOptions: { deepseek: { reasoningEffort: "xhigh" } },
  },
  opencodeGo: {
    model: opencodeGo("deepseek-v4.1-flash"),
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

export const getAgent = async (sessionId?: string): Promise<ToolLoopAgent> => {
  const [exa, playwright, sandbox] = await Promise.all([
    exaTools(),
    playwrightTools(),
    sandboxTools(),
  ]);

  // 활성화된 사용자 지시 사항들을 기본 instruction 뒤에 추가
  const activeList = await getActiveInstructions();
  const userPart = activeList
    .map((i) => `[${i.label}]\n${i.content}`)
    .join("\n\n---\n\n");
  const instructions = userPart
    ? `${AGENT_INSTRUCTIONS}\n\n## 사용자가 등록한 추가 지시사항\n${userPart}`
    : AGENT_INSTRUCTIONS;

  const createdAgent = new ToolLoopAgent({
    id: "trable-agent",
    model,
    providerOptions,
    headers:
      LLM_PROVIDER === "opencodeGo" && sessionId
        ? { "x-opencode-session": sessionId }
        : undefined,
    instructions,
    tools: {
      ...naverTools,
      ...playwright,
      ...exa,
      ...sandbox,
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

  return createdAgent;
};
