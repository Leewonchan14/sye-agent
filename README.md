# 트래블 에이전트 - 춘천 여행 도우미

> "이원찬"과 "성예은"의 춘천 여행을 도와주는 AI 에이전트

## 기술 스택

| 계층        | 기술                       | 버전                           |
| ----------- | -------------------------- | ------------------------------ |
| Framework   | Next.js (App Router)       | 16.2.10                        |
| AI SDK      | Vercel AI SDK              | 7.0.28                         |
| Agent       | ToolLoopAgent (AI SDK v7)  | -                              |
| LLM         | OpenCode Go                | deepseek-v4-flash              |
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
# → SITE_PASSWORD, OPENCODE_GO_API_KEY, NAVER_CLIENT_ID/SECRET, DATABASE_URL 입력

npm run dev
# http://localhost:3000
```

## 환경 변수

| 변수                  | 필수 | 설명                                              |
| --------------------- | ---- | ------------------------------------------------- |
| `SITE_PASSWORD`       | ✅   | 웹사이트 접속 비밀번호 (예: 0411)                 |
| `DEEPSEEK_API_KEY`    | ✅*  | DeepSeek 공식 API 키 (DeepSeek provider 사용 시)  |
| `OPENCODE_GO_API_KEY` | ✅*  | OpenCode Go API 키 (OpenCode Go provider 사용 시) |

> 현재 배포 provider는 OpenCode Go입니다. `DEEPSEEK_API_KEY` 또는 `OPENCODE_GO_API_KEY` 중 **활성화된 provider의 키 1개**만 있으면 됩니다. provider 전환 방법은 `src/lib/agent.ts`의 주석을 참고하세요.

| `DATABASE_URL` | ✅ | Neon DB 연결 문자열 |
| `NAVER_CLIENT_ID` | ✅ | 네이버 검색 API Client ID |
| `NAVER_CLIENT_SECRET` | ✅ | 네이버 검색 API Client Secret |
| `NEXT_PUBLIC_SITE_URL` | 배포 시 | OG 태그 이미지 URL에 사용되는 사이트 도메인 (예: `https://trable-agent.vercel.app`). 설정하지 않으면 Vercel 배포 시 `VERCEL_URL`을, 로컬 개발 시 `localhost:3000`을 자동으로 사용합니다.

### .env 파일 예시

```env
SITE_PASSWORD=0411
OPENCODE_GO_API_KEY=oc_go_...
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

## Hermes Agent 백엔드 (실험 — `LLM_BACKEND=hermes`)

에이전트 실행을 이 서버(ToolLoopAgent) 대신 **Hermes Agent의 hachi 프로필**(멀티플렉스 게이트웨이 API 서버)로 위임하는 백엔드다. 기본값은 기존 백엔드(`ai-sdk`)이고, `LLM_BACKEND=hermes`일 때만 켜진다. 프론트엔드는 수정 없이 동작한다 — 이 서버가 Hermes 세션 SSE(`/api/sessions/{id}/chat/stream`)를 AI SDK UI 메시지 스트림으로 변환해 돌려준다.

- 세션 매핑: 앱 세션 ID → Hermes 세션 ID `sye-<sessionId>` (결정적 매핑, 별도 DB 컬럼 없음)
- 히스토리: Hermes가 대화 트랜스크립트를 소유하고, Neon `session_state`는 사이드바·검색용으로 계속 저장된다
- 지시 사항(`instructions` 테이블)의 활성 항목은 매 요청 `system_message`로 전달된다
- 동시 실행 한도(HTTP 429)·일시 오류(5xx)는 백오프와 함께 재시도한다

### 환경 변수

| 변수                    | 필수      | 설명                                                                                      |
| ----------------------- | --------- | ----------------------------------------------------------------------------------------- |
| `LLM_BACKEND`           | -         | `hermes`면 Hermes 백엔드 사용 (기본: `ai-sdk`)                                            |
| `HERMES_API_URL`        | hermes 시 | Hermes API 서버 base URL (프로필 프리픽스 포함). 예: `https://hermes.example.com/p/hachi` |
| `HERMES_API_KEY`        | hermes 시 | hachi 프로필의 `API_SERVER_KEY` 값                                                        |
| `HERMES_SESSION_PREFIX` | -         | Hermes 세션 ID 프리픽스 (기본 `sye-`)                                                     |
| `HERMES_SESSION_KEY`    | -         | 장기 기억 스코프 헤더 `X-Hermes-Session-Key` (기본 `sye-agent`)                           |
| `HERMES_SYSTEM_MESSAGE` | -         | `system_message` 끝에 덧붙일 문구 (선택)                                                  |

### hachi(서버) 쪽 준비

1. `~/.hermes/profiles/hachi/.env`에 `API_SERVER_ENABLED=true`, `API_SERVER_KEY=<랜덤 키>` 추가 후 게이트웨이 재시작
2. 외부에서는 터널(예: Cloudflare Tunnel)로 `127.0.0.1:8642`의 `/p/hachi/*`만 노출
3. 무인 실행이라 승인(approval) 대기가 발생하지 않도록 hachi 승인 설정 확인 (대기가 발생하면 요청이 바로 실패한다)

### 로컬 개발 (Hermes 없이)

```bash
node scripts/mock-hermes-server.mjs 8971   # Hermes API 서버 목

LLM_BACKEND=hermes \
HERMES_API_URL=http://127.0.0.1:8971/p/hachi \
HERMES_API_KEY=mock-key \
npm run dev
```

### 알려진 한계 (후속 작업)

- 이전 응답 **재생성(regenerate)** 은 새 턴으로 취급된다 (Hermes 트랜스크립트는 되돌리지 않음)
- 도구 카드는 이름/인자 + 완료 상태까지 표시된다 (Hermes wire가 아직 결과 프리뷰를 싣지 않음)
- 앱 전용 도구(네이버·Exa·샌드박스 등)를 Hermes로 이관하기 전까지는 Hermes 쪽 도구(스킬·브라우저·터미널)로 실행된다

## 배포

Vercel에 배포 시 Neon DB는 Vercel Marketplace에서 자동 연결됩니다.
별도의 `vercel.json` 설정 불필요 (Next.js가 자동 감지).

Git push는 사용자가 직접 실행합니다.
