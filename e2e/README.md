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
