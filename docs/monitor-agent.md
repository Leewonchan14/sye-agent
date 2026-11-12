# 언론 모니터링 대시보드 — Hermes 연동 계약

대시보드(`/monitor`)는 기사를 직접 수집하지 않는다. Hermes 에이전트의
모니터링 스킬(`naver-news-monitor` 등)이 수집·판정을 하고,
**결과를 채팅으로 답하는 대신 아래 API로 POST**한다. 사람은 대시보드에서 선별·리포트 복사만 한다.

## 사용자별 데이터

고객사·이슈는 로그인한 사용자마다 따로 있다(`monitor_clients.user_id`, `monitor_issues.user_id`).
수집 결과(런·기사)와 이슈 집계(스냅샷)는 고객사·이슈를 통해 소유자가 정해진다.

- 화면용 API(`/api/monitor/**`, `agent/` 제외)는 로그인 쿠키로 사용자를 확인하고, 다른 사용자의
  고객사·런·기사·이슈·스냅샷은 404로 돌려준다. 이슈에 연결하는 고객사도 같은 사용자의 것이어야 한다.
- 에이전트용 API(`/api/monitor/agent/*`)와 시계(`tick`)는 사용자 요청이 아니라 고정 키·일회성 토큰으로
  인증하고 전체를 본다. `slug`는 Hermes가 고객사를 찾는 전역 키라 사용자끼리도 겹치지 않게 만든다.
- 사용자의 고객사·이슈를 위해 시작하는 Hermes 런은 그 소유자 범위의 장기 기억(`X-Hermes-Session-Key`)을 쓴다.

```
예약 스크립트(1분 시계) ──┐
대시보드 "더 찾기" ─────────┼─▶ Hermes 런 ─▶ POST /api/monitor/agent/runs ─▶ 대시보드 표
대시보드 "다시 집계" ──────┘              └▶ POST /api/monitor/agent/issues/{id}/snapshots
```

## 인증

두 가지 방식이 있다.

1. **대시보드 버튼("더 찾기", "다시 집계")** — 앱이 요청마다 **일회성 콜백 토큰**을 만들어
   Hermes 프롬프트에 `x-monitor-token` 헤더와 curl 예시째로 넣는다. 토큰은 그 런/이슈에만,
   3시간 동안 유효하다. **Hermes 쪽 설정은 필요 없다.**
2. **예약 시계(`/api/monitor/agent/tick`)·직접 올리는 수집·규칙 조회** — 고정 키가 필요하다.
   - 앱 env: `MONITOR_INGEST_KEY=<임의의 긴 문자열>`
   - Hermes 호스트: `~/.config/monitor/ingest.key`(권한 600)에 같은 값을 둔다. 스크립트만 읽고,
     에이전트에게는 넘기지 않는다. 자동 수집도 런마다 일회성 토큰을 받는다.

Hermes의 터미널은 도커 컨테이너에서 돈다. 앱이 공개 주소(Vercel)면 그대로 닿지만,
로컬에서 테스트할 때는 `MONITOR_CALLBACK_ORIGIN=http://172.17.0.1:<port>`처럼
컨테이너에서 닿는 주소를 지정한다(호스트 방화벽이 허용하는 포트여야 한다).

## 1. 수집 전에 규칙 읽기

```
GET /api/monitor/agent/clients/{slug}      # 예: client-mh2k1x9a-3f9c2b1d
```

응답:

```jsonc
{
  "client": {
    "slug": "client-mh2k1x9a-3f9c2b1d",
    "name": "예시 브랜드",
    "categories": [
      { "key": "own", "name": "예시 브랜드 자사 뉴스", "goal": null },
      {
        "key": "industry",
        "name": "업계 · 트렌드",
        "goal": 10,
        "subs": ["업계 동향", "경쟁사", "트렌드"],
      },
    ],
    "rules": [
      {
        "id": "exclude-media",
        "title": "제외 매체",
        "kind": "tags",
        "value": ["예시매체"],
      },
      {
        "id": "skip-reported",
        "title": "어제 보고한 기사 제외",
        "kind": "toggle",
        "value": true,
      },
    ],
  },
  "reportedUrls": ["https://...", "..."], // 최근 14일 보고한 기사 — 다시 보내도 되지만 기본 제외됨
}
```

규칙은 대시보드 "고객사 규칙" 탭에서 사람이 고친다. 채팅에서 "앞으로는~" 지시가 나오면
스킬이 이 목록을 기준으로 삼도록 프롬프트를 맞춘다.

## 2. 수집 결과 보내기

```
POST /api/monitor/agent/runs
Content-Type: application/json
```

새 수집(하루치):

```jsonc
{
  "client": "client-mh2k1x9a-3f9c2b1d",
  "since": "2026-11-05T09:00:00+09:00",
  "until": "2026-11-06T09:00:00+09:00",
  "stats": {
    "sources": [
      { "name": "네이버 뉴스", "count": 120 },
      { "name": "구글 뉴스", "count": 8 },
    ],
    "blocked": ["예시일보"],
  },
  "items": [/* 아래 item 형식 */],
}
```

"더 찾기" 결과(프롬프트에 runId가 들어 있다):

```jsonc
{ "runId": 12, "items": [ ... ] }
```

### item 형식

| 필드             | 필수 | 설명                                                                                       |
| ---------------- | ---- | ------------------------------------------------------------------------------------------ |
| `url`            | ✅   | 원문 URL. 기사 식별 키                                                                     |
| `naverUrl`       |      | 네이버 뉴스 링크(CP 매체). "네이버 링크" 규칙이 켜져 있으면 리포트에 이 링크가 쓰임        |
| `media`          | ✅   | 매체명                                                                                     |
| `title`          | ✅   | 제목                                                                                       |
| `reporter`       |      | 기자명. 못 찾으면 비워 두고 `reporterStatus`로 이유를 보냄                                 |
| `reporterStatus` |      | `found` / `fetch_failed`(원문 못 염) / `not_on_page`(표기 없음) / `unverified`(안 열어 봄) |
| `publishedAt`    |      | ISO 8601, 오프셋 포함 (`2026-11-05T16:23:00+09:00`)                                        |
| `summary`        |      | 핵심 내용 2~3문장 — 리포트에 그대로 들어감                                                 |
| `category`       |      | 카테고리 key. **제외한 후보는 null**                                                       |
| `subcategory`    |      | 카테고리 `subs` 중 하나                                                                    |
| `score`          |      | 0~100 관련도                                                                               |
| `reason`         |      | 왜 골랐는지 한 줄                                                                          |
| `excludedReason` |      | 제외한 이유 (category가 null일 때)                                                         |
| `excludedRule`   |      | 제외에 쓴 규칙 이름 (예: "제외 매체", "어제 보고한 기사 제외")                             |
| `dupGroup`       |      | 같은 보도자료 묶음 키 (예: `"brand-launch-pr"`)                                            |
| `isLead`         |      | 묶음의 대표 기사면 true(기본). 나머지 전재 기사는 false                                    |
| `blocked`        |      | 원문 접근이 막혔으면 true                                                                  |
| `sentiment`      |      | 고객사 입장에서 본 논조 `positive` / `neutral` / `negative`. 화면·통계·엑셀에 표시         |
| `importance`     |      | 고객사에 미칠 영향 `high` / `normal` / `low`. `high`는 화면에 "중요"로 표시                |

- 같은 URL을 같은 런에 두 번 보내면 무시된다.
- **나눠 보내기**: runId로 붙이는 결과를 여러 번에 나눠 보내면 마지막을 뺀 묶음에 `"final": false`를 넣는다.
  앱은 마지막 묶음(`final` 생략 또는 true)을 받아야 대기 상태를 풀고, 그때 화면 폴링이 멈춘다.
  중간 묶음에서 풀면 화면이 첫 묶음 건수만 보고 끝난다.
  에이전트 작업이 마지막 묶음 없이 끝나면 다음 시계 확인 때 받은 만큼으로 마감한다.
- 제외 후보도 보내 두면 대시보드에서 "다시 포함"할 수 있다.

## 3. 이슈 트래커 스냅샷

```
POST /api/monitor/agent/issues/{issueId}/snapshots
```

```jsonc
{
  "at": "2026-11-06T14:42:00+09:00",
  "label": "11/6 15시",
  "added": 12, // 직전 정기 보고 이후 추가 기사 수
  "mediaCount": 7,
  "brandMentions": 0, // 감시어가 들어간 기사 수
  "lastArticle": {
    "media": "예시일보",
    "time": "14:42",
    "title": "...",
    "url": "https://...",
  },
  "isReport": true, // 정기 보고면 true, "지금 몇 건?" 중간 확인이면 false
  "reportText": "담당자님, 안녕하세요. ...", // 정기 보고일 때 초안
  "events": [{ "at": "11.06 14:08", "text": "회사 입장 발표", "key": true }],
  // added로 센 기사 전부(최대 2000건). 이슈 화면의 "집계된 기사" 목록이 된다.
  "articles": [
    {
      "url": "https://n.news.naver.com/...",
      "media": "예시일보", // 모르면 비워도 된다
      "title": "...",
      "publishedAt": "2026-11-06 14:42", // KST
      "brandMention": false,
      "sentiment": "negative", // 선택. positive | neutral | negative
    },
  ],
}
```

## 4. 매일 자동 수집

앱에 있는 고객사는 "매일 자동 수집" 스위치가 켜져 있으면 추가 설정 없이 수집된다.
수집 시각은 고객 규칙 탭에서 고른다. 고르지 않으면 모니터링 기간이 끝나는 시각이다
(예: "전일 10:00 ~ 당일 10:00"이면 매일 10:00. 끝이 전일 이전이면 09:00). 기간이 끝나기 전 시각은 쓸 수 없다.

```
Hermes 호스트: no_agent 예약 작업이 1분마다 scripts/monitor-tick.py 실행
  └▶ POST /api/monitor/agent/tick (x-monitor-key)
       └▶ 앱이 (모든 사용자의) 오늘 수집할 고객사를 선점 → 빈 런 생성 → Hermes 런 시작 (일회성 토큰)
            └▶ Hermes가 POST /api/monitor/agent/runs { runId, stats, items }
```

- 수집 기간은 `모니터링 기간` 규칙을 쓴다.
- "평일만 수집"(기본 켜짐)이면 토·일은 쉬고, 월요일에는 금요일 구간부터 모은다.
- `(client_id, collect_key)` 유니크 인덱스로 하루 한 번만 시작한다. 동시에 불려도 안전하다.
- 결과 없이 끝나면 한 번 다시 시도한다. 완료·실패 알림은 보내지 않는다 — 결과와 오류는 대시보드에서만 보인다.
  자동 작업이 도는 동안은 90초마다 확인한다.
- 응답의 `nextCheckAt`까지 스크립트는 호출하지 않아서 DB를 자주 깨우지 않는다. 가장 가까운 다음 시각이 멀어도 30분마다 다시 확인하므로, 화면에서 시각을 바꾸면 늦어도 30분 안에 반영된다.
- Hermes 시작에 실패하면 빈 런을 지우고 5분 뒤 다시 시도한다. 스크립트는 아무것도 출력하지 않고,
  마지막 오류만 상태 파일(`MONITOR_TICK_STATE`)의 `last_error`에 남긴다.

감시 중인 이슈는 이슈 화면에서 정한 시작 시각과 간격(기본 09:00부터 6시간마다, KST)으로 그날 끝까지 정기 보고를 집계한다. 다음 날은 시작 시각부터 다시 센다. 간격은 30분~24시간이고, 감시를 끝내면 멈춘다. 일정을 바꾸면 다음 시각부터 적용한다.
`monitor_issues.last_auto_slot`으로 같은 시각에 한 번만 돌고, 직전 정기 보고 이후 구간을 센다.

설치:

```bash
cp scripts/monitor-tick.py ~/.hermes/scripts/monitor_tick.py
# 스크립트 환경에 MONITOR_TICK_URL=https://<앱 주소>/api/monitor/agent/tick 을 둔다.
hermes cron create "every 1m" --name "모니터링 자동 수집 시계" \
  --script monitor_tick.py --no-agent --deliver discord
```

## 5. 엑셀(CSV) 내려받기

리포트 탭의 "엑셀(CSV)로 받기"는 리포트에 넣은 기사를 같은 보도자료 전재까지 포함해 내려받는다.
논조·중요도 열이 함께 들어가고, Excel에서 한글이 깨지지 않게 BOM을 붙인다.
