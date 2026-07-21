<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project context

이 프로젝트는 연인(이원찬, 성예은) 둘만 사용할 사이트를 만드는 중입니다.

# Export convention

`export default` 대신 **named export**를 사용하세요. (`export function Component()`, `export const Component = ...`)

# UI & Components

- **shadcn/ui**를 적극 사용하세요. 컴포넌트 추가, 검색, 설치 등은 `shadcn` MCP 도구를 통해 수행할 수 있습니다.
- UI 관련 질문이 있으면 먼저 `shadcn` MCP를 검색(`search_tool_bm25`)하여 필요한 도구가 있는지 확인하세요.
- 새로운 UI 컴포넌트를 직접 만들기 전에 **반드시 `shadcn` MCP로 먼저 검색**하여 이미 존재하는 컴포넌트가 있는지 확인한 후, 없을 때만 직접 구현하세요.

# Development server rule

- **직접 개발 서버를 실행하지 마세요.**
- 현재 `localhost:3000`에 개발 서버가 이미 실행 중입니다.
- 만약 3000 포트가 열려 있지 않다면, 직접 실행하지 말고 **내게 열어달라고 요청**하세요.

# Package manager

**`npm`**, **`npx`** 만 사용하세요. `bun`, `yarn`, `pnpm` 등 다른 패키지 매니저는 사용하지 마세요.

# Library preference

코드를 직접 구현하기 전에, 해당 기능을 해결해주는 라이브러리가 있는지 먼저 조사하세요. 라이브러리로 해결 가능한 코드는 라이브러리를 적극 사용하고 직접 구현을 피하세요.

# React Query

- 서버 상태 관리, 데이터 fetching, 캐싱, optimistic update 등 관련 기능은 **React Query (TanStack Query)**를 적극 사용하세요. `useEffect` + `fetch` 조합으로 직접 구현하지 말고 React Query의 `useQuery`, `useMutation`, `useQueryClient` 등을 우선 활용하세요.
- 쿼리 키는 일관된 구조로 관리하고, 필요 시 커스텀 훅으로 래핑하여 재사용성을 높이세요.

# Web search verification

코드 구현, 아키텍처 결정, 라이브러리 선택 등 어떤 동작을 수행하기 전에 **반드시** `web_search` 도구를 이용해 해당 접근 방식이 적절한지, 더 나은 대안이 있는지, 최신 모범 사례를 따르고 있는지 확인하세요. 추측하거나 오래된 지식에 의존하지 마세요.

# Code style

- 함수 선언 시 `function` 키워드 대신 **arrow function** (`const fn = (...) => { ... }`)만 사용하세요.
- 조건부 클래스명은 삼항연산자(`condition ? "class" : ""`) 대신 **&& 연산자**(`condition && "class"`)를 사용하세요. (예: `{active ? "bg-card text-ink" : ""}` → `{active && "bg-card text-ink"}`)

# Date & Time

- **dayjs** 사용 시 기본 locale을 `ko`로 설정하고 timezone을 **KST (UTC+9)**로 고정하세요. (`dayjs.extend(utc).extend(timezone).tz(..., 'Asia/Seoul')`)

# Drizzle ORM

- 데이터베이스 스키마 변경이 필요하면 **`src/lib/db/schema.ts`만 수정**하세요.
- `drizzle/` 폴더(마이그레이션 파일), `drizzle.config.ts`, `src/lib/db/`의 기타 파일(migration, db.ts 등)은 **직접 수정하지 마세요.**
- schema 변경 후에는 반드시 아래 명령어를 순서대로 실행하세요.
  1. `npm run db:generate` — `drizzle/`에 마이그레이션 파일 자동 생성
  2. `npm run db:migrate` — 변경사항을 데이터베이스에 적용

# Formatting & Linting

코드 수정 후 **반드시** `prettier`와 `eslint`를 실행하여 스타일 일관성을 유지하세요. (커밋 전에 자동으로 실행된다고 가정하지 말고 직접 수행)

- 프로젝트에 설정된 대로 `npm run format`, `npm run lint` 등을 실행하세요.
