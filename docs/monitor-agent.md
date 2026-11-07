# 언론 모니터링 대시보드 — Hermes 연동 계약

대시보드(`/monitor`)는 기사를 직접 수집하지 않는다. 지금처럼 Hermes(hachi 프로필)의
모니터링 스킬(`hongkong-tourism-monitor`, `naver-news-monitor` 등)이 수집·판정을 하고,
**결과를 채팅으로 답하는 대신 아래 API로 POST**한다. 사람은 대시보드에서 선별·리포트 복사만 한다.

```
Hermes 크론(매일 09:00) ──┐
대시보드 "더 찾기" ─────────┼─▶ Hermes 런 ─▶ POST /api/monitor/agent/runs ─▶ 대시보드 표
대시보드 "다시 집계" ──────┘              └▶ POST /api/monitor/agent/issues/{id}/snapshots
```

## 인증

두 가지 방식이 있다.

1. **대시보드 버튼("더 찾기", "다시 집계")** — 앱이 요청마다 **일회성 콜백 토큰**을 만들어
   Hermes 프롬프트에 `x-monitor-token` 헤더와 curl 예시째로 넣는다. 토큰은 그 런/이슈에만,
   3시간 동안 유효하다. **Hermes 쪽 설정은 필요 없다.**
2. **크론 수집(새 런 만들기)·규칙 조회** — 고정 키가 필요하다.
   - 앱 env: `MONITOR_INGEST_KEY=<임의의 긴 문자열>`
   - Hermes env(hachi 프로필 `.env`): 같은 값을 넣고 `x-monitor-key` 헤더로 보낸다.

Hermes의 터미널은 도커 컨테이너에서 돈다. 앱이 공개 주소(Vercel)면 그대로 닿지만,
로컬에서 테스트할 때는 `MONITOR_CALLBACK_ORIGIN=http://172.17.0.1:<port>`처럼
컨테이너에서 닿는 주소를 지정한다(호스트 방화벽이 허용하는 포트여야 한다).

## 1. 수집 전에 규칙 읽기

```
GET /api/monitor/agent/clients/{slug}      # 예: hktb, panasonic
```

응답:

```jsonc
{
  "client": {
    "slug": "hktb",
    "name": "홍콩관광청",
    "categories": [
      { "key": "own", "name": "홍콩관광청 자사 뉴스", "goal": null },
      {
        "key": "industry",
        "name": "여행업계 · 트렌드",
        "goal": 10,
        "subs": ["여행업계", "항공업계", "여행 관련 이슈", "트렌드"],
      },
    ],
    "rules": [
      {
        "id": "exclude-media",
        "title": "제외 매체",
        "kind": "tags",
        "value": ["홍콩수요저널"],
      },
      {
        "id": "outbound-only",
        "title": "국내여행 · 인바운드 제외",
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
  "client": "hktb",
  "since": "2026-11-05T09:00:00+09:00",
  "until": "2026-11-06T09:00:00+09:00",
  "stats": {
    "sources": [
      { "name": "네이버 뉴스", "count": 1404 },
      { "name": "구글 뉴스", "count": 22 },
    ],
    "blocked": ["뉴스1", "쿠키뉴스"],
    "durationSec": 372,
  },
  "items": [/* 아래 item 형식 */],
}
```

"더 찾기" 결과(프롬프트에 runId가 들어 있다):

```jsonc
{ "runId": 12, "items": [ ... ] }
```

### item 형식

| 필드             | 필수 | 설명                                                                                |
| ---------------- | ---- | ----------------------------------------------------------------------------------- |
| `url`            | ✅   | 원문 URL. 기사 식별 키                                                              |
| `naverUrl`       |      | 네이버 뉴스 링크(CP 매체). "네이버 링크" 규칙이 켜져 있으면 리포트에 이 링크가 쓰임 |
| `media`          | ✅   | 매체명                                                                              |
| `title`          | ✅   | 제목                                                                                |
| `reporter`       |      | 기자명. 못 찾으면 비워 두면 "기자 확인 필요"로 표시                                 |
| `publishedAt`    |      | ISO 8601, 오프셋 포함 (`2026-11-05T16:23:00+09:00`)                                 |
| `summary`        |      | 핵심 내용 2~3문장 — 리포트에 그대로 들어감                                          |
| `category`       |      | 카테고리 key. **제외한 후보는 null**                                                |
| `subcategory`    |      | 카테고리 `subs` 중 하나                                                             |
| `score`          |      | 0~100 관련도                                                                        |
| `reason`         |      | 왜 골랐는지 한 줄                                                                   |
| `excludedReason` |      | 제외한 이유 (category가 null일 때)                                                  |
| `excludedRule`   |      | 제외에 쓴 규칙 이름 (예: "제외 매체", "인바운드 제외")                              |
| `dupGroup`       |      | 같은 보도자료 묶음 키 (예: `"hk-gourmet-month"`)                                    |
| `isLead`         |      | 묶음의 대표 기사면 true(기본). 나머지 전재 기사는 false                             |
| `blocked`        |      | 원문 접근이 막혔으면 true                                                           |

- 같은 URL을 같은 런에 두 번 보내면 무시된다.
- 제외 후보도 보내 두면 대시보드에서 "다시 포함"할 수 있다.

## 3. 이슈 트래커 스냅샷

```
POST /api/monitor/agent/issues/{issueId}/snapshots
```

```jsonc
{
  "at": "2026-11-06T14:42:00+09:00",
  "label": "11/6 15시",
  "added": 87, // 직전 정기 보고 이후 추가 기사 수
  "mediaCount": 35,
  "brandMentions": 0, // 감시어가 들어간 기사 수
  "lastArticle": {
    "media": "JTBC",
    "time": "14:42",
    "title": "...",
    "url": "https://...",
  },
  "isReport": true, // 정기 보고면 true, "지금 몇 건?" 중간 확인이면 false
  "reportText": "담당 매니저님, 안녕하세요. ...", // 정기 보고일 때 초안
  "events": [{ "at": "11.06 14:08", "text": "소속사 2차 입장 발표", "key": true }],
}
```

## 4. 매일 자동 수집 걸기

Hermes `cronjob_manage`로 매일 09:00 KST에 아래 프롬프트를 돌린다.

```
홍콩관광청 모니터링해줘. GET {APP}/api/monitor/agent/clients/hktb 규칙대로
전일 09:00~당일 09:00 기사를 찾고, 결과는 채팅 대신 POST {APP}/api/monitor/agent/runs 로 보내.
형식은 sye-agent docs/monitor-agent.md 참고.
```
