---
name: ai-sdk-neon
description: Integrate Vercel AI SDK with Neon Postgres for NL-to-SQL, RAG with pgvector, data analysis agents, and long-running Neon Functions. Triggers on: "Neon Postgres", "pgvector", "vector search", "embedding", "natural language SQL", "analyze database", "Neon AI Gateway", "text-to-SQL".
---

# AI SDK + Neon Postgres Integration Guide

AI SDK와 Neon Postgres를 통합하는 4가지 패턴. 자세한 내용은 각 참조 링크의 공식 문서를 먼저 읽을 것.

---

## 패턴 1: 자연어 → SQL (Ad-hoc Analytics)

**용도**: 자연어 질문을 SQL로 변환하여 Neon에서 실행. 대시보드, ad-hoc 데이터 분석.

**참조**: `https://ai-sdk.dev/cookbook/guides/natural-language-postgres`

### 구조

```
User Query (NL) → generateText + Output.object → SQL string → @neondatabase/serverless → 결과
```

### 핵심 코드

```typescript
import { generateText, Output } from 'ai';
import { neon } from '@neondatabase/serverless';
import { z } from 'zod';

const sql = neon(process.env.DATABASE_URL!);

export async function generateQuery(input: string) {
  const result = await generateText({
    model: 'openai/gpt-4o',
    system: `You are a SQL (postgres) expert.
Schema:
  sales(id SERIAL, product VARCHAR, amount DECIMAL, region VARCHAR, date DATE)

Rules:
- Only SELECT / retrieval queries.
- Use ILIKE + LOWER() for string matching.
- Valuation in billions (10b = 10.0).`,
    prompt: `Generate SQL for: ${input}`,
    output: Output.object({ schema: z.object({ query: z.string() }) }),
  });
  return result.output.query;
}

// 실행
const rows = await sql`SELECT product, SUM(amount) FROM sales GROUP BY product ORDER BY SUM(amount) DESC LIMIT 5`;
```

### 핵심 포인트

- **Structured Output**: `Output.object({ schema: z.object({ query: z.string() }) })`로 SQL을 문자열로 강제
- **Schema 컨텍스트**: 시스템 프롬프트에 테이블/컬럼/관계/제약조건 명세 — SQL 품질과 속도 향상
- **Temperature**: tool call 시 `temperature: 0` 권장
- **에러 핸들링**: SQL 실행 실패 시 에러 메시지를 그대로 반환하면 AI가 스스로 수정(self-correction)
- **보안**: SELECT만 허용하는 시스템 프롬프트 + DB 유저 권한으로 Read-only 강제

### 관련 자료

- 전체 튜토리얼: https://ai-sdk.dev/cookbook/guides/natural-language-postgres
- Vercel 템플릿: https://vercel.com/templates/next.js/natural-language-postgres

---

## 패턴 2: RAG 에이전트 (pgvector)

**용도**: 문서 기반 Q&A, 커스텀 지식베이스, semantic search, 대화형 에이전트의 메모리 저장소.

**참조**: `https://ai-sdk.dev/cookbook/guides/rag-chatbot`

### 구조

```
문서 → chunk → embedMany → Neon (pgvector) 저장
질문 → embed → cosine similarity 검색 → 유사 chunk 반환 → AI SDK tool → 응답
```

### Neon pgvector 설정

```sql
CREATE EXTENSION vector;

CREATE TABLE embeddings (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  embedding vector(1536) NOT NULL
);

CREATE INDEX embeddings_hnsw_idx ON embeddings
  USING hnsw (embedding vector_cosine_ops);
```

> HNSW 인덱스는 IVFFlat보다 정확도 높고 빌드 빠름. 단, 메모리 사용량이 더 큼.

### 핵심 코드

```typescript
import { embedMany, embed, tool } from 'ai';
import { neon } from '@neondatabase/serverless';
import { z } from 'zod';

const sql = neon(process.env.DATABASE_URL!);

function generateChunks(text: string): string[] {
  return text.split('.').filter(Boolean);
}

async function addResource(content: string) {
  const chunks = generateChunks(content);
  const { embeddings } = await embedMany({
    model: 'openai/text-embedding-3-small',
    values: chunks,
  });

  for (let i = 0; i < chunks.length; i++) {
    await sql`
      INSERT INTO embeddings (id, content, embedding)
      VALUES (gen_random_uuid()::text, ${chunks[i]}, ${JSON.stringify(embeddings[i])}::vector)
    `;
  }
}

async function findRelevant(query: string, limit = 4) {
  const { embedding } = await embed({
    model: 'openai/text-embedding-3-small',
    value: query,
  });

  return await sql`
    SELECT content, 1 - (embedding <=> ${JSON.stringify(embedding)}::vector) AS similarity
    FROM embeddings
    WHERE 1 - (embedding <=> ${JSON.stringify(embedding)}::vector) > 0.5
    ORDER BY similarity DESC
    LIMIT ${limit}
  `;
}
```

### AI SDK Tools → ToolLoopAgent

```typescript
const { streamText, tool, isStepCount } = 'ai';

const result = streamText({
  model: 'openai/gpt-4o',
  system: 'Answer only from knowledge base. Use tools to retrieve or store info.',
  messages: /* from useChat */,
  stopWhen: isStepCount(5),
  tools: {
    addResource: tool({
      description: 'Store information in the knowledge base.',
      inputSchema: z.object({ content: z.string() }),
      execute: async ({ content }) => addResource(content),
    }),
    getInformation: tool({
      description: 'Search knowledge base for relevant information.',
      inputSchema: z.object({ question: z.string() }),
      execute: async ({ question }) => findRelevant(question),
    }),
  },
});
```

### 핵심 포인트

- **임베딩 모델 선택**: `text-embedding-3-small` (1536dim, 효율적) / `text-embedding-3-large` (3072dim, 정확도)
- **유사도 임계값**: `cosine similarity > 0.5` — 0.7 이상이면 정확, 0.5~0.7은 관련성 낮음
- **인덱스**: HNSW (고정밀) vs IVFFlat (저메모리). 첫 구축 시 `lists = rows / 1000`
- **Multi-step**: `stopWhen: isStepCount(5)`로 tool call 이후에도 응답 생성

---

## 패턴 3: ToolLoopAgent + Read Replica (데이터 분석 봇)

**용도**: Slack/채팅 봇이 안전하게 운영 DB 조회. 시각화 포함.

**참조**: `https://neon.com/guides/ai-sdk-neon-data-assistant`

### 구조

```
User → ToolLoopAgent → query_database tool → Neon Read Replica → 결과 정리/시각화
```

### 핵심 코드

```typescript
import { ToolLoopAgent, tool } from 'ai';
import { neon } from '@neondatabase/serverless';
import { z } from 'zod';

const replica = neon(process.env.REPLICA_DATABASE_URL!);

const agent = new ToolLoopAgent({
  model: 'anthropic/claude-sonnet-4-5',
  instructions: `You are a data analyst assistant.
Tables: sales(id, product, amount, region, date, category)
Only read-only queries. Return markdown tables.`,
  tools: {
    query_database: tool({
      description: 'Execute read-only SQL against the database.',
      inputSchema: z.object({ sql: z.string() }),
      execute: async ({ sql }) => {
        try {
          return await replica`${sql}`;
        } catch (e: any) {
          return { error: e.message };
        }
      },
    }),
    generate_chart: tool({
      description: 'Generate chart from data.',
      inputSchema: z.object({
        chartConfig: z.any().describe('Valid Chart.js configuration'),
      }),
      execute: async ({ chartConfig }) => ({
        url: `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}`,
      }),
    }),
  },
});
```

### DB 설정

```env
# Primary (읽기/쓰기 — Chat SDK 상태 저장용)
CHAT_STATE_DATABASE_URL="postgres://..."

# Read Replica (AI 전용 — 읽기 전용)
REPLICA_DATABASE_URL="postgres://..."
```

### 핵심 포인트

- **Read Replica 필수**: AI 쿼리가 Primary DB에 영향을 주지 않도록 격리
- **Schema 컨텍스트**: 시스템 프롬프트에 상세 스키마 포함 필수
- **Self-correction**: SQL 실패 시 에러를 반환하면 AI가 수정 후 재시도

---

## 패턴 4: Neon Functions + AI SDK (Preview)

**용도**: 이미지 생성, 다단계 리서치, 파일 시스템 조작 등 10초 이상 걸리는 에이전트.

**참조**: `https://neon.com/docs/compute/functions/agents`

### 구조

```
Neon Functions (15분 대기 + 무제한 스트리밍) = AI SDK streamText + tools
                          ↕
                    Neon AI Gateway (자동 인증)
                          ↕
                    Neon Postgres (같은 리전, 저지연)
```

### 배포 설정

```typescript
// neon.ts
import { defineConfig } from '@neon/config/v1';
export default defineConfig({
  preview: {
    aiGateway: true,
    functions: {
      agent: {
        source: './functions/agent.ts',
      },
    },
  },
});
```

### 핵심 코드

```typescript
import { neon } from '@neon/ai-sdk-provider';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

export default {
  async fetch(request: Request) {
    const { messages } = await request.json();

    const result = streamText({
      model: neon('claude-sonnet-4-6'),
      system: 'You are a helpful assistant.',
      messages,
      tools: {
        dbTime: tool({
          description: 'Get current time from database.',
          inputSchema: z.object({}),
          execute: async () => {
            const { rows } = await pool.query('SELECT now()::text AS now');
            return { now: rows[0].now };
          },
        }),
      },
    });

    return result.toUIMessageStreamResponse();
  },
};
```

### 핵심 포인트

- **Neon Functions**: Lambda와 달리 긴 실행 시간 (15분 대기 + 스트리밍 중 유지)
- **AI Gateway**: `@neon/ai-sdk-provider`가 Gateway 크리덴셜 자동 주입
- **Pool**: 모듈 스코프에 생성하여 요청 간 재사용 (`max: 5` 권장)
- **프록시 금지**: Vercel 등을 경유하면 Lambda 제한에 걸리므로 클라이언트에서 직접 호출

---

## 패키지 설치 요약

```bash
# 공통 (모든 패턴)
npm install ai @neondatabase/serverless zod

# 패턴 1, 2 (OpenAI)
npm install @ai-sdk/openai

# 패턴 3 (Anthropic)
npm install @ai-sdk/anthropic

# 패턴 4 (Neon Functions — 미리보기)
npm install @neon/ai-sdk-provider pg
```

---

## 참조 링크

| 문서 | URL |
|------|-----|
| AI SDK Natural Language Postgres | https://ai-sdk.dev/cookbook/guides/natural-language-postgres |
| AI SDK RAG Chatbot | https://ai-sdk.dev/cookbook/guides/rag-chatbot |
| Neon AI SDK Data Assistant | https://neon.com/guides/ai-sdk-neon-data-assistant |
| Neon Functions + AI Agents | https://neon.com/docs/compute/functions/agents |
| Neon Serverless Driver | https://neon.com/docs/serverless/serverless-driver |
| Neon pgvector docs | https://neon.com/docs/ai/ai-embeddings |
| Full-stack AI Agent (Neon Blog) | https://neon.com/blog/how-to-build-a-full-stack-ai-agent |
| 예제 저장소 | https://github.com/neondatabase/examples/tree/main/with-ai-sdk |
