# e2e

테스트는 사용자 테이블을 비우고 계정을 새로 만든다. **운영 DB나 개발 DB에 연결하면 안 된다.**
`E2E_DATABASE_URL`의 DB 이름에 `e2e`가 없으면 테스트가 바로 실패한다.

```bash
export E2E_DATABASE_URL=postgres://user:pw@127.0.0.1:5460/app_e2e

DATABASE_URL=$E2E_DATABASE_URL npm run db:migrate
DATABASE_URL=$E2E_DATABASE_URL npm run build

# 가입을 여러 번 하므로 요청 제한을 끈다 (테스트 서버 전용)
AUTH_RATE_LIMIT=off BETTER_AUTH_SECRET=e2e-secret-e2e-secret-e2e-secret BETTER_AUTH_URL=http://localhost:3100 \
MONITOR_INGEST_KEY=e2e-ingest-key MONITOR_CALLBACK_ORIGIN=http://localhost:3100 \
DATABASE_URL=$E2E_DATABASE_URL npx next start -p 3100 &

MONITOR_INGEST_KEY=e2e-ingest-key E2E_BASE_URL=http://localhost:3100 npm run test:e2e
```

모니터링 테스트(`monitor-*.spec.ts`)는 테스트 안에서 가짜 Hermes를 띄운다. 앱을 띄울 때
`HERMES_API_URL=http://127.0.0.1:8972 HERMES_API_KEY=fake`를 함께 넣는다.
