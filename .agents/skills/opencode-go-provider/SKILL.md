---
name: opencode-go-provider
description: Use OpenCode Go subscription with Vercel AI SDK for open models (DeepSeek V4 Flash, GLM-5.2, Kimi K2, Qwen3.7, MiniMax M3, MiMo-V2.5). Triggers on: "OpenCode Go", "opencode-go", "DeepSeek V4 Flash", "opencode-go provider", "Go subscription".
---

# OpenCode Go + Vercel AI SDK

OpenCode Go는 저렴한 정액제($5 첫 달, 이후 $10/월)로 오픈 모델을 안정적으로 사용할 수 있는 구독 서비스입니다.

## 적용 방법 (2가지)

### 방법 A: `@ai-sdk/openai-compatible` (권장)

OpenCode Go의 DeepSeek V4 Flash 등 일부 모델은 **OpenAI 호환 엔드포인트**를 제공합니다. 공식 AI SDK 패키지로 안전하게 연결.

```bash
npm install @ai-sdk/openai-compatible
```

```typescript
import { generateText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const opencode = createOpenAICompatible({
  name: 'opencode-go',
  baseURL: 'https://opencode.ai/zen/go/v1',
  headers: {
    Authorization: `Bearer ${process.env.OPENCODE_GO_API_KEY}`,
  },
});

const model = opencode('deepseek-v4-flash');

const result = await generateText({
  model,
  prompt: 'Hello!',
});
```

### 방법 B: `ai-sdk-provider-opencode-sdk` (커뮤니티 패키지)

OpenCode SDK를 기반으로 하는 커뮤니티 제공자 패키지. 주간 42K 다운로드.

```bash
npm install ai-sdk-provider-opencode-sdk
```

```typescript
import { generateText } from 'ai';
import { opencode } from 'ai-sdk-provider-opencode-sdk';

const model = opencode('deepseek-v4-flash');

const result = await generateText({
  model,
  prompt: 'Hello!',
});
```

환경변수: `OPENCODE_API_KEY` (자동 로드)

---

## 사용 가능한 모델

### OpenAI 호환 엔드포인트 (방법 A 사용)

| 모델 | Model ID | AI SDK 패키지 |
|------|----------|--------------|
| DeepSeek V4 Flash | `deepseek-v4-flash` | `@ai-sdk/openai-compatible` |
| DeepSeek V4 Pro | `deepseek-v4-pro` | `@ai-sdk/openai-compatible` |
| GLM-5.2 | `glm-5.2` | `@ai-sdk/openai-compatible` |
| GLM-5.1 | `glm-5.1` | `@ai-sdk/openai-compatible` |
| Kimi K2.7 Code | `kimi-k2.7-code` | `@ai-sdk/openai-compatible` |
| Kimi K2.6 | `kimi-k2.6` | `@ai-sdk/openai-compatible` |
| MiMo-V2.5 | `mimo-v2.5` | `@ai-sdk/openai-compatible` |
| MiMo-V2.5-Pro | `mimo-v2.5-pro` | `@ai-sdk/openai-compatible` |

### Anthropic 호환 엔드포인트

| 모델 | Model ID | AI SDK 패키지 |
|------|----------|--------------|
| MiniMax M3 | `minimax-m3` | `@ai-sdk/anthropic` |
| MiniMax M2.7 | `minimax-m2.7` | `@ai-sdk/anthropic` |
| Qwen3.7 Max | `qwen3.7-max` | `@ai-sdk/anthropic` |
| Qwen3.7 Plus | `qwen3.7-plus` | `@ai-sdk/anthropic` |
| Qwen3.6 Plus | `qwen3.6-plus` | `@ai-sdk/anthropic` |

---

## 전체 활용 예제

```typescript
import { generateText, streamText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

// Provider 생성
const opencode = createOpenAICompatible({
  name: 'opencode-go',
  baseURL: 'https://opencode.ai/zen/go/v1',
  headers: {
    Authorization: `Bearer ${process.env.OPENCODE_GO_API_KEY}`,
  },
});

// Text generation
const result = await generateText({
  model: opencode('deepseek-v4-flash'),
  system: 'You are a helpful assistant.',
  prompt: 'What is the capital of France?',
});

// Streaming
const stream = streamText({
  model: opencode('deepseek-v4-flash'),
  system: 'You are a helpful assistant.',
  prompt: 'Explain quantum computing.',
});

// Tool calling
import { tool } from 'ai';
import { z } from 'zod';

const resultWithTools = await generateText({
  model: opencode('deepseek-v4-flash'),
  system: 'You are a helpful assistant.',
  prompt: 'What is the weather in Seoul?',
  tools: {
    getWeather: tool({
      description: 'Get weather in a location',
      inputSchema: z.object({
        location: z.string(),
      }),
      execute: async ({ location }) => {
        return { temperature: 22, condition: 'sunny' };
      },
    }),
  },
  maxSteps: 5,
});
```

---

## 환경변수 설정

```env
# OpenCode Go API Key (OpenCode Zen Console에서 발급)
OPENCODE_GO_API_KEY="oc_go_..."
```

---

## 요금 정보 (2026.07 기준)

| 구분 | 금액 |
|------|------|
| 첫 달 | $5 |
| 이후 | $10/월 |
| 5시간 한도 | $12 사용량 |
| 주간 한도 | $30 사용량 |
| 월간 한도 | $60 사용량 |

DeepSeek V4 Flash는 $0.14/1M input + $0.28/1M output으로 매우 저렴. 월 158K 요청 가능.

---

## 참조

- OpenCode Go docs: https://opencode.ai/docs/go/
- `@ai-sdk/openai-compatible`: https://ai-sdk.dev/v7/providers/openai-compatible-providers
- `ai-sdk-provider-opencode-sdk`: https://www.npmjs.com/package/ai-sdk-provider-opencode-sdk
- DeepSeek AI SDK Provider: https://ai-sdk.dev/providers/ai-sdk-providers/deepseek
