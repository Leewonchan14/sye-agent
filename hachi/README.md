# hachi — 사이트 채팅 백엔드가 쓰는 Hermes 스킬

이 디렉터리는 **성예은.shop 채팅 BE(Hermes `hachi` 프로필)가 실제로 실행하는 스킬의 버전관리 사본**이다.
사이트 응답의 품질·지연은 이 문구에 직접 좌우되므로(예: 어떤 도구를 먼저 부르라고 지시하는지) 코드와 같이 리뷰한다.

| 항목 | 값 |
| --- | --- |
| 실행 위치(런타임) | `~/.hermes/profiles/hachi/skills/` |
| 이 디렉터리 | 런타임 사본 — 배포 시 아래 명령으로 동기화 |
| 스킬 포맷 | Hermes SKILL.md (frontmatter + markdown) |

## 동기화

런타임 → 리포지토리 (런타임에서 고친 내용을 커밋할 때):

```bash
cp -a ~/.hermes/profiles/hachi/skills/research/hongkong-tourism-monitor \
      hachi/skills/research/
```

리포지토리 → 런타임 (PR 머지 후 실제 에이전트에 반영할 때):

```bash
cp -a hachi/skills/research/hongkong-tourism-monitor \
      ~/.hermes/profiles/hachi/skills/research/
```

스킬 파일은 다음 턴부터 그대로 읽히므로 게이트웨이 재시작은 필요 없다(`config.yaml` 변경은 재시작 필요).

## 스킬

- `research/hongkong-tourism-monitor` — 홍콩관광청(HKTB) 보도 모니터링. 네이버 Open API 스윕 +
  Google News/자체 RSS 교차 확인 + 원문 발행시각·기자명 검증, 4섹션 클리핑 출력.

## 참고: 지연 실측 (2026-10-29 1턴)

`web_extract`가 1순위였을 때 1턴(356초) 중 도구 151초 · 모델 202초였고, `web_extract` 5회가
86초(개별 30.0 / 32.1 / 10.1 / 9.7 / 3.8초)를 차지했다. 무료 keyless 추출기 체인이라
한 건에 10~32초가 든다. v1.2.0에서 원문 확인을 `pubtime.py`·`byline.py`·`curl`로 내리고
URL을 묶어 넘기도록 바꿨다.
