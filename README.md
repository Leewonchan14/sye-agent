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

에이전트 실행은 **Hermes Agent의 hachi 프로필**(멀티플렉스 게이트웨이 API 서버)이 담당하는 유일한 채팅 백엔드다.
앱은 Hermes의 **디태치 런 API**(`/v1/runs`)로 턴을 돌리고, 런 이벤트를 AI SDK UI 메시지 스트림으로 중계한다.

- 세션 매핑: 앱 세션 ID → Hermes 세션 ID `sye-<sessionId>` (결정적 매핑, 별도 DB 컬럼 없음)
- 히스토리: Hermes가 대화 트랜스크립트를 소유하고, Neon `session_state`는 사이드바·검색용으로 계속 저장된다
- 지시 사항(`instructions` 테이블)의 활성 항목은 매 요청 `instructions`로 전달된다

### 왜 세션 SSE가 아니라 `/v1/runs`인가 (Vercel 300초 한도)

Vercel 함수 수명은 **스트리밍 응답 시간을 포함**하고(Hobby 300s), 함수가 죽으면 그 순간 Hermes로 가는
SSE도 끊긴다. 세션 채팅 스트림(`/api/sessions/{id}/chat/stream`)은 그때 게이트웨이가
`agent.interrupt("SSE client disconnected")`로 **런 자체를 중단**시켜 진행 중이던 작업이 사라졌다.

`/v1/runs`는 반대로:

1. `POST /v1/runs`가 **run_id를 즉시** 돌려주고 런은 백그라운드에서 계속된다 (클라이언트가 끊겨도 안 죽는다)
2. 이벤트를 **seq와 함께 보관**하고 `GET /v1/runs/{id}/events?last_seq=`로 언제든 이어서 읽을 수 있다

그래서 앱은:

| 단계                                | 하는 일                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/chat`                    | 런 시작 → UI 청크를 브라우저로 흘리며 **모든 청크를 `chat_turn_frames`에 offset과 함께 기록** (Neon)                           |
| 소프트 데드라인                     | 기본 240초(= `CHAT_SOFT_DEADLINE_MS`)에서 **스스로** 스트림을 닫는다 (Vercel이 죽이기 전에)                                    |
| `GET /api/chat/{sessionId}/stream`  | 브라우저가 커서(`message-metadata`의 offset/keepParts)를 들고 재접속 → 놓친 프레임만 재생 + 살아 있는 런에 `last_seq`로 재부착 |
| `POST /api/chat/{sessionId}/cancel` | 사용자가 정지를 누를 때만 `POST /v1/runs/{id}/stop`으로 런을 끊는다 (브라우저가 그냥 떠난 경우는 런을 살려 둔다)               |

- 열려 있던 파트(스트리밍 중이던 텍스트/도구 카드)는 재개 시 커서 기준으로 잘라내고 그 파트의 `*-start`부터 재생한다 — 중복/유실 없이 화면이 복원된다
- 페이지 새로고침·네트워크 끊김·함수 타임아웃 모두 같은 경로로 복구된다
- 도구 카드의 인자·전체 결과는 턴이 끝날 때 세션 트랜스크립트(`/api/sessions/{id}/messages`)에서 백필한다
- 동시 실행 한도(HTTP 429)·일시 오류(5xx)는 그대로 런 시작 단계에서 처리된다

### 탭을 닫아도 이어지고, 다시 열면 복구된다

브라우저가 **아예 떠난 경우**(탭 닫기)에도 턴이 사라지지 않도록 서버가 끝까지 기록한다:

1. `POST /api/chat`은 클라이언트가 끊겨도 **기록을 멈추지 않는다** — 런이 끝날 때까지 `chat_turn_frames`에 청크를 적고, `finish`·트랜스크립트 백필까지 수행한다(`chat_turns.status`가 `completed`로 마감된다)
2. 돌아온 화면은 `GET /api/chat/{sessionId}/turn`으로 "서버가 기억하는 턴"을 확인한다. `chat_turns.user_text`가 그 턴의 사용자 메시지다
3. 화면이 그 턴을 모르면(저장된 상태에 없으면) 사용자 메시지를 되살리고 **offset 0부터 전체 재생**한다 — 진행 중이던 턴이면 이어서 스트리밍되고, 이미 끝난 턴이면 `finish`까지 재생돼 답변이 복원된다
4. 재생이 끝나면 `onFinish`가 상태를 저장하므로, 다음 방문부터는 재생 없이 그대로 불러온다(`message-metadata.turnRunId`로 "이미 가진 턴"을 구분해 중복 재생을 막는다)

- **제출 즉시 사용자 메시지를 저장**한다 — 응답이 오기 전에 새로고침해도 대화에서 사라지지 않는다
- 새로고침 직후에도 "생각 중" 표시를 유지한다. 서버 턴이 아직 만들어지기 전(런 시작 대기)이면 최대 ~3초 재시도해 그 구간을 메운다
- 한계: 프레임 로그는 `pruneChatTurns()`가 **하루 뒤** 지운다 — 그 안에 돌아오면 복구되고, 지난 뒤에는 세션 트랜스크립트(Hermes)에만 남는다
- 중계가 끊긴 동안에도 프레임 기록은 함수 수명(소프트 데드라인)까지 이어진다. 그 사이에 함수가 죽으면 남은 구간은 다음 방문이 `last_seq`로 이어받는다
- **동시 재개 방지**: 새로고침 연타로 재개 요청이 여러 개 붙어도 프레임 로그는 **writer 하나만** 쓴다.
  다른 릴레이는 읽기 전용(중계만)이고, writer가 15초 넘게 조용하면 다음 요청이 리스를 인계받는다
  (`chat_turns.writer_id` + 5초 heartbeat). 인계 후에도 카운터는 `GREATEST`로만 갱신되어 뒤로 가지 않는다

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

# 1-1) 이어받기(resume) 경로까지 로컬에서 보려면 소프트 데드라인을 짧게:
MOCK_TURN_MS=9000 node scripts/mock-hermes-server.mjs 8971   # 턴이 9초 동안 흐르는 목
HERMES_API_URL=http://127.0.0.1:8971/p/hachi \
HERMES_API_KEY=mock-key \
CHAT_SOFT_DEADLINE_MS=3000 \
npm run dev    # → 3초마다 스트림이 끊기고 브라우저가 이어받아 완주한다

# 2) 실제 Hermes에 붙이기 — SSH 터널(공개 노출 없음)
ssh -N -L 8642:127.0.0.1:8642 <hermes-host>
# .env: HERMES_API_URL=http://127.0.0.1:8642/p/hachi
#       HERMES_API_KEY=<hachi 키>
npm run dev
```

### thinking 스트리밍 (게이트웨이 패치 — 권장)

기본 게이트웨이는 모델의 실제 thinking(`reasoning_content`)을 API 스트림에 싣지 않는다
(`reasoning.available` / `tool.progress`의 `_thinking`은 잘린 진행 프리뷰일 뿐이다). 패치 없이도 앱은
턴이 끝날 때 세션 트랜스크립트의 `reasoning`으로 thinking을 백필하지만, 턴 종료 시점에 한 번에 나타난다.

**실시간 스트리밍**은 게이트웨이가 `reasoning_callback`을 SSE로 중계하면 된다
(OpenAI 호환 `/v1/chat/completions` 경로는 이미 그렇게 한다 — `_spawn_stream_agent`의 `_on_reasoning`, #99552).
실서버에는 아래 두 파일 패치가 적용돼 있다(`~/.hermes/patches/*.patch`로 보관):

| 파일                                   | 추가한 것                                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gateway/platforms/api_server.py`      | 플랫폼 플래그 `reasoning_events`(기본 on) + `_handle_session_chat_stream`에 `_reasoning` 콜백 → `reasoning.delta` SSE                             |
| `gateway/platforms/api_server_runs.py` | `_execute_run`에 `_reasoning_cb`를 추가하고 `_create_agent(..., reasoning_callback=_reasoning_cb)`로 연결 → `/v1/runs` 이벤트로 `reasoning.delta` |

```bash
# 재적용 (hermes update로 패치가 사라졌을 때)
cd ~/.hermes/hermes-agent && git apply ~/.hermes/patches/api_server_reasoning_delta.patch \
  && git apply ~/.hermes/patches/runs_reasoning_delta.patch
systemctl --user restart hermes-gateway.service
```

- 앱은 `reasoning.delta`가 오면 그대로 스트리밍하고, 안 오는 서버(패치 전)에서는 자동으로 턴 종료 백필로 동작한다(기능 저하만, 오류 없음)
- thinking은 Hermes assistant 메시지(step)마다 **별도 블록**으로 진행 순서 자리에 렌더링된다 — 도구를 부르기 전 생각, 다음 단계 생각이 각각 따로 접히고 펼쳐진다
- 끄고 싶으면 `~/.hermes/config.yaml`의 `gateway.platforms.api_server.reasoning_events: false`

### 도구 카드 실시간 채우기 (게이트웨이 패치 — 권장)

기본 게이트웨이는 `tool.completed`에 **잘린 요약(≤500자)** 만 싣고, 전체 결과는 `run.completed`의
트랜스크립트에만 있어서 카드가 턴이 끝날 때까지 비어 보인다. 아래 패치를 적용하면 도구가 끝나는 즉시
`tool.result` 이벤트(`content`/`truncated`/`result_chars`, `tool_call_id` 포함)가 도착해 카드가 바로 채워진다.

| 파일                                   | 추가한 것                                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `gateway/platforms/_tool_stream_payload.py` | 결과 redaction·상한(preview 6,000자 / 전문 50,000자) 공용 헬퍼 (신규)                            |
| `gateway/platforms/api_server.py`      | 세션 스트림 `tool.completed`에 `result_chars`/`result_truncated` + `tool.result` 프레임            |
| `gateway/platforms/api_server_runs.py` | `/v1/runs` 스트림에 같은 필드 + `tool.result` 프레임                                               |
| `agent/tool_executor.py`               | `tool.completed` 콜백에 `tool_call_id` 전달(동시 실행되는 같은 이름 도구도 카드가 섞이지 않음)      |

```bash
# 재적용 (hermes update로 패치가 사라졌을 때) — 순서 중요
cd ~/.hermes/hermes-agent && git apply ~/.hermes/patches/api_server_reasoning_delta.patch \
  && git apply ~/.hermes/patches/runs_reasoning_delta.patch \
  && git apply ~/.hermes/patches/tool_result_stream.patch
systemctl --user restart hermes-gateway.service
```

- 앱은 `tool.result`가 오면 카드를 즉시 채우고, 이후 트랜스크립트 백필은 **더 긴 값으로 덮어쓰기만** 한다
- 패치가 없는 서버에서도 동작한다(≤500자 미리보기 → 턴 종료 백필). `truncated: true`면 앱이 "일부만 표시" 문구를 덧붙인다

### 알려진 한계 (후속 작업)

- 이전 응답 **재생성(regenerate)** 은 새 턴으로 취급된다 (Hermes 트랜스크립트는 되돌리지 않음)
- 도구 카드의 **인자**는 여전히 턴 종료 시 트랜스크립트로 백필된다 — `tool.started`의 `preview`에는 인자 전문이 없어서
  (`tool.result` 패치로 결과 본문은 실시간이 됨)
- `chat_turn_frames`는 턴 하나의 UI 청크 로그를 담는다 — 같은 세션에서 새 턴이 시작되면 지우고,
  하루 지난 행은 요청 경로에서 best-effort로 청소한다
- 도구는 Hermes 쪽(스킬·브라우저·터미널)에서 실행된다 (앱 전용 도구였던 네이버·Exa·샌드박스 등은 제거됨)

## 배포

Vercel에 배포 시 Neon DB는 Vercel Marketplace에서 자동 연결됩니다.
별도의 `vercel.json` 설정 불필요 (Next.js가 자동 감지).

Hermes 백엔드 env:

| 변수                    | 값                                                                            |
| ----------------------- | ----------------------------------------------------------------------------- |
| `HERMES_API_URL`        | `http(s)://<hermes-host>:8642/p/hachi` (프로필 프리픽스 포함, 끝 슬래시 없이) |
| `HERMES_API_KEY`        | hachi 프로필의 `API_SERVER_KEY`                                               |
| `CHAT_SOFT_DEADLINE_MS` | 선택 — 스트림을 스스로 닫는 시각 (기본 240000ms = Vercel 300s 한도보다 짧게)  |

Git push는 사용자가 직접 실행합니다.
