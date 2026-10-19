# 트래블 에이전트 - 춘천 여행 도우미

> "이원찬"과 "성예은"의 춘천 여행을 도와주는 AI 에이전트

## 기술 스택

| 계층        | 기술                        | 버전                           |
| ----------- | --------------------------- | ------------------------------ |
| Framework   | Next.js (App Router)        | 16.2.10                        |
| AI SDK      | Vercel AI SDK               | 7.0.28                         |
| Agent       | Hermes Agent (hachi 프로필) | -                              |
| LLM         | Hermes API 서버             | 프로필 설정에 따름             |
| Database    | Neon (Serverless Postgres)  | @neondatabase/serverless 1.1.0 |
| UI          | shadcn/ui + Tailwind CSS    | v4.3                           |
| Lint/Format | Prettier + ESLint           | -                              |

## 설치

```bash
git clone <repo-url>
cd trable-agent
npm install

# .env 파일 생성
cp .env.example .env
# → SITE_PASSWORD, DATABASE_URL, HERMES_API_URL, HERMES_API_KEY 입력

npm run dev
# http://localhost:3000
```

## 환경 변수

| 변수                    | 필수    | 설명                                                                                                                                                                                     |
| ----------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SITE_PASSWORD`         | ✅      | 웹사이트 접속 비밀번호 (예: 0411)                                                                                                                                                        |
| `DATABASE_URL`          | ✅      | Neon DB 연결 문자열                                                                                                                                                                      |
| `HERMES_API_URL`        | ✅      | Hermes API 서버 base URL (프로필 프리픽스 포함). 배포: `http(s)://<hermes-host>:8642/p/hachi`, 로컬: SSH 터널 후 `http://127.0.0.1:8642/p/hachi`                                         |
| `HERMES_API_KEY`        | ✅      | `~/.hermes/profiles/hachi/.env`의 `API_SERVER_KEY` (게이트웨이 default 프로필 키와 다른 값)                                                                                              |
| `HERMES_SESSION_PREFIX` | -       | Hermes 세션 ID 프리픽스 (기본 `sye-`)                                                                                                                                                    |
| `HERMES_SESSION_KEY`    | -       | 장기 기억 스코프 헤더 `X-Hermes-Session-Key` (기본 `sye-agent`)                                                                                                                          |
| `HERMES_SYSTEM_MESSAGE` | -       | `system_message` 끝에 덧붙일 문구 (선택)                                                                                                                                                 |
| `NEXT_PUBLIC_SITE_URL`  | 배포 시 | OG 태그 이미지 URL에 사용되는 사이트 도메인 (예: `https://trable-agent.vercel.app`). 설정하지 않으면 Vercel 배포 시 `VERCEL_URL`을, 로컬 개발 시 `localhost:3000`을 자동으로 사용합니다. |

### .env 파일 예시

```env
SITE_PASSWORD=0411
DATABASE_URL=postgres://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
HERMES_API_URL=https://hermes.example.com/p/hachi
# hachi 프로필(~/.hermes/profiles/hachi/.env)의 API_SERVER_KEY
HERMES_API_KEY=your_hachi_api_server_key

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

## 접속

`.env` 파일의 `SITE_PASSWORD` 값으로 접속합니다.

## API 인증

모든 API (`/api/chat`, `/api/messages`)는 인증이 필요합니다.
비밀번호 인증 성공 시 발급된 토큰을 `x-auth-token` 헤더에 포함하여 요청해야 합니다. (클라이언트에서 자동 처리)

## Hermes Agent 백엔드 (hachi 프로필)

에이전트 실행은 **Hermes Agent의 hachi 프로필**(멀티플렉스 게이트웨이 API 서버)이 담당하는 유일한 채팅 백엔드다. 프론트엔드는 그대로 동작한다 — 이 서버가 Hermes 세션 SSE(`/api/sessions/{id}/chat/stream`)를 AI SDK UI 메시지 스트림으로 변환해 돌려준다.

- 세션 매핑: 앱 세션 ID → Hermes 세션 ID `sye-<sessionId>` (결정적 매핑, 별도 DB 컬럼 없음)
- 히스토리: Hermes가 대화 트랜스크립트를 소유하고, Neon `session_state`는 사이드바·검색용으로 계속 저장된다
- 지시 사항(`instructions` 테이블)의 활성 항목은 매 요청 `system_message`로 전달된다
- 동시 실행 한도(HTTP 429)·일시 오류(5xx)는 백오프와 함께 재시도한다

### Hermes(서버) 쪽 준비

멀티플렉스 게이트웨이(`gateway.multiplex_profiles: true`)에서 `/p/hachi/*`는 **default 프로필이 소유한 공유 리스너**(기본 `127.0.0.1:8642`)가 서빙하고, 인증만 hachi 프로필 키를 쓴다 — 그래서 키를 두 곳에 **서로 다른 값**으로 넣는다.

1. **default 프로필** — `~/.hermes/.env` (리스너를 여는 주체)

   ```bash
   API_SERVER_ENABLED=true
   API_SERVER_KEY=<openssl rand -hex 32>
   API_SERVER_HOST=0.0.0.0     # 외부(Vercel 등)에서 접속할 때만. 기본은 127.0.0.1
   ```

2. **hachi 프로필** — `~/.hermes/profiles/hachi/.env` (`/p/hachi` 인증 전용, 자체 리스너 없음)

   ```bash
   API_SERVER_KEY=<openssl rand -hex 32>   # default 키와 다른 값, 16자 이상
   ```

3. 게이트웨이 재시작 후 확인

   ```bash
   systemctl --user restart hermes-gateway.service
   ss -ltn | grep 8642
   curl -s -H "Authorization: Bearer <hachi 키>" http://127.0.0.1:8642/p/hachi/v1/models
   ```

4. 외부에서 접속한다면 호스트 방화벽까지 (Oracle 이미지 기본 규칙은 마지막이 REJECT → 그 **앞**에 삽입)

   ```bash
   sudo iptables -I INPUT 6 -p tcp -m state --state NEW --dport 8642 -j ACCEPT
   sudo netfilter-persistent save
   # 그리고 OCI VCN Security List(또는 NSG)에 TCP 8642 수신 규칙 추가
   ```

- 키 스코프: `/p/hachi/*`는 hachi 키만 통과(default 키는 401), unprefixed `/v1/*`는 default 키만 통과
- 노출하지 않으려면 SSH 터널만 써도 된다(아래 로컬 개발) — 이 엔드포인트는 터미널 실행 권한을 가진 에이전트라, 공개 시 Bearer 키가 유일한 방어선이다
- 승인(approval): hachi 기본값은 `approvals.mode: smart` — 승인 대기(`approval.request`)가 발생하면 웹앱에는 승인 UI가 없어 그 턴이 실패한다. 무인 운영이 필요하면 hachi `config.yaml`의 `approvals` 설정을 점검할 것

### 로컬 개발

```bash
# 1) 목 서버로 띄우기 (Hermes 없이)
node scripts/mock-hermes-server.mjs 8971
HERMES_API_URL=http://127.0.0.1:8971/p/hachi \
HERMES_API_KEY=mock-key \
npm run dev

# 2) 실제 Hermes에 붙이기 — SSH 터널(공개 노출 없음)
ssh -N -L 8642:127.0.0.1:8642 <hermes-host>
# .env: HERMES_API_URL=http://127.0.0.1:8642/p/hachi
#       HERMES_API_KEY=<hachi 키>
npm run dev
```

### thinking 스트리밍 (게이트웨이 패치 — 권장)

기본 게이트웨이는 모델의 실제 thinking(`reasoning_content`)을 session chat 스트림에 싣지 않는다
(`tool.progress`의 `_thinking`은 방금 나간 답변 텍스트의 에코일 뿐이다). 앱은 그래서 thinking을
턴이 끝날 때 `run.completed.messages`에서 백필한다 — 대화는 정상이지만 thinking이 턴 종료 시 한 번에 나타난다.

대신 **실시간 스트리밍**을 원하면 게이트웨이가 `reasoning_callback`을 SSE로 중계하면 된다
(OpenAI 호환 `/v1/chat/completions` 경로는 이미 그렇게 한다 — `_spawn_stream_agent`의 `_on_reasoning`, #99552).
`~/.hermes/hermes-agent/gateway/platforms/api_server.py`에 3군데만 추가하면 된다(실서버 적용 완료):

1. 플랫폼 설정 플래그: `self._reasoning_events: bool = _coerce_request_bool(extra.get("reasoning_events"), default=True)`
   (`tool_progress_events` 옆) — `~/.hermes/config.yaml`의 `gateway.platforms.api_server.reasoning_events: false`로 끌 수 있다
2. `_handle_session_chat_stream` 안에 콜백 추가:
   `events.enqueue("reasoning.delta", {"message_id": message_id, "delta": delta})`
3. 같은 함수의 `_run_agent(...)` 호출에 `reasoning_callback=_reasoning` 전달

적용 후 `systemctl --user restart hermes-gateway.service`. 앱은 `reasoning.delta`가 오면 그대로 스트리밍하고,
안 오는 서버(패치 전)에서는 자동으로 턴 종료 백필로 동작한다. thinking은 Hermes assistant 메시지(step)마다
**별도 블록**으로 진행 순서 자리에 렌더링된다 — 도구를 부르기 전 생각, 다음 단계 생각이 각각 따로 접히고 펼쳐진다.
⚠ `hermes update`가 이 파일을 덮어쓰면 패치가 사라진다 — 그때는 위 3군데를 다시 넣으면 된다(기능 저하만, 오류 없음).

### 알려진 한계 (후속 작업)

- 이전 응답 **재생성(regenerate)** 은 새 턴으로 취급된다 (Hermes 트랜스크립트는 되돌리지 않음)
- 도구 카드의 결과는 **턴이 끝날 때** 채워진다 — Hermes `tool.completed`에 결과가 실리지 않고
  `run.completed.messages`에만 있어서 그때 백필한다 (thinking은 위 패치 시 실시간, 아니면 같은 시점)
- 도구는 Hermes 쪽(스킬·브라우저·터미널)에서 실행된다 (앱 전용 도구였던 네이버·Exa·샌드박스 등은 제거됨)

## 배포

Vercel에 배포 시 Neon DB는 Vercel Marketplace에서 자동 연결됩니다.
별도의 `vercel.json` 설정 불필요 (Next.js가 자동 감지).

Hermes 백엔드 env:

| 변수             | 값                                                                            |
| ---------------- | ----------------------------------------------------------------------------- |
| `HERMES_API_URL` | `http(s)://<hermes-host>:8642/p/hachi` (프로필 프리픽스 포함, 끝 슬래시 없이) |
| `HERMES_API_KEY` | hachi 프로필의 `API_SERVER_KEY`                                               |

Git push는 사용자가 직접 실행합니다.
