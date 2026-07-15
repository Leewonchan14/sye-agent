# 트래블 에이전트 - 춘천 여행 도우미

> "이원찬"과 "성예은"의 춘천 여행을 도와주는 AI 에이전트

## 기술 스택

| 계층 | 기술 | 버전 |
|---|---|---|
| Framework | Next.js (App Router) | 16.2.10 |
| AI SDK | Vercel AI SDK | 7.0.28 |
| Agent | ToolLoopAgent (AI SDK v7) | - |
| LLM | Deepseek | deepseek-flash-v4 |
| Database | Neon (Serverless Postgres) | @neondatabase/serverless 1.1.0 |
| UI | shadcn/ui + Tailwind CSS | v4.3 |
| Web Search | Exa MCP (HTTP, no API key) | https://mcp.exa.ai/mcp |
| Lint/Format | Prettier + ESLint | - |

## 설치

```bash
git clone <repo-url>
cd trable-agent
npm install

# .env 파일 생성
cp .env.example .env
# → SITE_PASSWORD, OPENCODE_GO_API_KEY, NAVER_CLIENT_ID/SECRET, DATABASE_URL 입력

# Neon DB 스키마 생성 (SQL Editor에서 아래 실행)
# CREATE TABLE chat_messages (...);

npm run dev
# http://localhost:3000
```

## 환경 변수

| 변수 | 필수 | 설명 |
|---|---|---|
| `SITE_PASSWORD` | ✅ | 웹사이트 접속 비밀번호 (예: 0411) |
| `OPENCODE_GO_API_KEY` | ✅ | OpenCode Go API 키 (Deepseek API 호출용 Bearer 토큰) |

| `DATABASE_URL` | ✅ | Neon DB 연결 문자열 |
| `NAVER_CLIENT_ID` | ✅ | 네이버 검색 API Client ID |
| `NAVER_CLIENT_SECRET` | ✅ | 네이버 검색 API Client Secret |
| `NEXT_PUBLIC_SITE_URL` | 배포 시 | OG 태그 이미지 URL에 사용되는 사이트 도메인 (예: `https://trable-agent.vercel.app`). 설정하지 않으면 Vercel 배포 시 `VERCEL_URL`을, 로컬 개발 시 `localhost:3000`을 자동으로 사용합니다.

### .env 파일 예시

```env
SITE_PASSWORD=0411
OPENCODE_GO_API_KEY=sk-...
DATABASE_URL=postgres://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
NAVER_CLIENT_ID=your_naver_client_id
NAVER_CLIENT_SECRET=your_naver_client_secret

# 선택: OG 태그 이미지 URL의 도메인을 고정하려면 설정 (기본값: VERCEL_URL 또는 localhost)
# NEXT_PUBLIC_SITE_URL=https://trable-agent.vercel.app
```

## Neon DB 설정

1. Vercel Marketplace → Neon → **Create** → Vercel 프로젝트 연결
2. 환경 변수 `DATABASE_URL`이 자동으로 Vercel에 설정됨
3. Vercel Neon Console → **SQL Editor** → 아래 스키마 SQL 실행
4. 로컬 개발: `.env`에 `DATABASE_URL` 직접 입력

### SQL 스키마

```sql
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_session ON chat_messages(session_id, created_at);
```

## MCP 연동

### Exa MCP (웹 검색)

Exa MCP는 **API 키 없이** HTTP MCP로 즉시 사용 가능합니다.

```json
{
  "mcpServers": {
    "exa": {
      "type": "http",
      "url": "https://mcp.exa.ai/mcp"
    }
  }
}
```

### Naver 검색 API

네이버 검색 API는 Python MCP(`kimcp`)에서 TypeScript로 직접 마이그레이션했습니다.
- `search_naver_local`: 지역 업체/장소 검색
- `search_naver_blog`: 블로그 검색
- `search_naver_cafe`: 카페 검색
- `search_naver_news`: 뉴스 검색
- `search_naver_image`: 이미지 검색
- `search_naver_shopping`: 쇼핑 검색

## 접속

`.env` 파일의 `SITE_PASSWORD` 값으로 접속합니다.

## API 인증

모든 API (`/api/chat`, `/api/messages`)는 인증이 필요합니다.
비밀번호 인증 성공 시 발급된 토큰을 `x-auth-token` 헤더에 포함하여 요청해야 합니다. (클라이언트에서 자동 처리)

## 배포

Vercel에 배포 시 Neon DB는 Vercel Marketplace에서 자동 연결됩니다.
별도의 `vercel.json` 설정 불필요 (Next.js가 자동 감지).

Git push는 사용자가 직접 실행합니다.
