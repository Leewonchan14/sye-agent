# 가계부 e2e

테스트는 시작할 때마다 가계부 테이블을 비운다. **운영 DB나 개발 DB에 연결하면 안 된다.**
`E2E_DATABASE_URL`의 DB 이름에 `e2e`가 없으면 테스트가 바로 실패한다.

```bash
export E2E_DATABASE_URL=postgres://user:pw@127.0.0.1:5460/sye_ledger_e2e
export SITE_PASSWORD=e2e-password

DATABASE_URL=$E2E_DATABASE_URL npm run db:migrate
DATABASE_URL=$E2E_DATABASE_URL npm run build
DATABASE_URL=$E2E_DATABASE_URL npx next start -p 3100 &

E2E_BASE_URL=http://localhost:3100 npm run test:e2e
```

데이트 추천 테스트(`date-spots.spec.ts`)는 테스트 안에서 가짜 Hermes(기본 포트 8972)를 띄운다.
같은 서버가 인스타그램 임베드·사진 서버와 즐길 거리 소개 페이지(og:image) 역할도 하므로 `INSTAGRAM_EMBED_ORIGIN`도 그 주소로 둔다.
앱을 띄울 때 아래 값을 함께 넣는다.

```bash
HERMES_API_URL=http://127.0.0.1:8972 HERMES_API_KEY=fake INSTAGRAM_EMBED_ORIGIN=http://127.0.0.1:8972 \
MONITOR_INGEST_KEY=e2e-ingest-key MONITOR_CALLBACK_ORIGIN=http://localhost:3100 \
DATABASE_URL=$E2E_DATABASE_URL npx next start -p 3100 &

MONITOR_INGEST_KEY=e2e-ingest-key E2E_BASE_URL=http://localhost:3100 npx playwright test e2e/date-spots.spec.ts
```

가계부 지도 사진 테스트(`ledger-map-photo.spec.ts`)는 가짜 네이버 플레이스 서버(기본 포트 8973)를 띄운다.
앱을 띄울 때 `NAVER_PLACE_ORIGIN=http://127.0.0.1:8973`을 함께 넣는다.
데이트 지도 테스트(`date-map.spec.ts`)도 같은 가짜 플레이스 서버를 띄워 장소 좌표·주소·업종을 돌려준다. 지도 타일(OpenFreeMap)은 테스트 안에서 빈 스타일로 바꿔 바깥 네트워크 없이 돈다.
포트가 겹치면 두 값을 함께 바꾼다: `E2E_FAKE_NAVER_PLACE_PORT=8983`, `NAVER_PLACE_ORIGIN=http://127.0.0.1:8983`.

데이트 지도 동네 테스트(`map-areas.spec.ts`)도 같은 가짜 서버로 네이버 통합검색(동네 이름 검색)까지 대신한다.
앱을 띄울 때 `NAVER_SEARCH_ORIGIN=http://127.0.0.1:8973`을 함께 넣는다.
