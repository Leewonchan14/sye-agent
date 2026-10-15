# 트래블 에이전트 - 춘천 여행 도우미

> "이원찬"과 "성예은"의 춘천 여행을 도와주는 AI 에이전트

## 기술 스택

| 계층        | 기술                       | 버전                           |
| ----------- | -------------------------- | ------------------------------ |
| Framework   | Next.js (App Router)       | 16.2.10                        |
| AI SDK      | Vercel AI SDK              | 7.0.28                         |
| Agent       | ToolLoopAgent (AI SDK v7)  | -                              |
| LLM         | OpenCode Go                | deepseek-v4.1-flash            |
| Database    | Neon (Serverless Postgres) | @neondatabase/serverless 1.1.0 |
| UI          | shadcn/ui + Tailwind CSS   | v4.3                           |
| Web Search  | Exa MCP (HTTP, no API key) | https://mcp.exa.ai/mcp         |
| Lint/Format | Prettier + ESLint          | -                              |

## 설치

```bash
git clone <repo-url>
cd trable-agent
npm install

# .env 파일 생성
cp .env.example .env
# → SITE_PASSWORD, OPENCODE_GO_API_KEYS, NAVER_CLIENT_ID/SECRET, DATABASE_URL 입력

npm run dev
# http://localhost:3000
```

## 환경 변수

| 변수                   | 필수 | 설명                                                                   |
| ---------------------- | ---- | ---------------------------------------------------------------------- |
| `SITE_PASSWORD`        | ✅   | 웹사이트 접속 비밀번호 (예: 0411)                                      |
| `DEEPSEEK_API_KEY`     | ✅*  | DeepSeek 공식 API 키 (DeepSeek provider 사용 시)                       |
| `OPENCODE_GO_API_KEYS` | ✅*  | OpenCode Go API 키 목록 (콤마·줄바꿈 구분, 한도 소진 시 자동 로테이션) |
| `OPENCODE_GO_API_KEY`  | ✅*  | OpenCode Go 단일 API 키 (목록 변수가 없을 때 사용)                     |

> 현재 배포 provider는 OpenCode Go입니다. `DEEPSEEK_API_KEY` 또는 `OPENCODE_GO_API_KEYS` 중 **활성화된 provider의 키**만 있으면 됩니다. provider 전환 방법은 `src/lib/agent.ts`의 주석을 참고하세요.
>
> **다중 키 로테이션**: `OPENCODE_GO_API_KEYS`에 키를 여러 개 넣으면 한 키가 5시간·주간·월간 한도를 소진하거나 계정 잔액이 비었을 때(HTTP 402/429) 같은 요청을 다음 키로 자동 재시도합니다. 소진된 키는 `Retry-After`(없으면 5분, 키 무효 401/403은 30분) 동안 선택에서 제외되고, 대화 세션(`x-opencode-session`)별로 키가 고정돼 프롬프트 캐시가 유지됩니다. 구현: `src/lib/opencode-keys.ts`.

| `DATABASE_URL` | ✅ | Neon DB 연결 문자열 |
| `NAVER_CLIENT_ID` | ✅ | 네이버 검색 API Client ID |
| `NAVER_CLIENT_SECRET` | ✅ | 네이버 검색 API Client Secret |
| `NEXT_PUBLIC_SITE_URL` | 배포 시 | OG 태그 이미지 URL에 사용되는 사이트 도메인 (예: `https://trable-agent.vercel.app`). 설정하지 않으면 Vercel 배포 시 `VERCEL_URL`을, 로컬 개발 시 `localhost:3000`을 자동으로 사용합니다.

### .env 파일 예시

```env
SITE_PASSWORD=0411
# 여러 개면 콤마로 구분 (한도 소진 시 자동 로테이션)
OPENCODE_GO_API_KEYS="oc_go_...,oc_go_...,oc_go_..."
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
CREATE TABLE IF NOT EXISTS session_state (
  session_id TEXT PRIMARY KEY,
  messages JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
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
