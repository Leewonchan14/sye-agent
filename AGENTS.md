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

# Development server rule

- **직접 개발 서버를 실행하지 마세요.**
- 현재 `localhost:3000`에 개발 서버가 이미 실행 중입니다.
- 만약 3000 포트가 열려 있지 않다면, 직접 실행하지 말고 **내게 열어달라고 요청**하세요.

# Package manager

**`npm`**, **`npx`** 만 사용하세요. `bun`, `yarn`, `pnpm` 등 다른 패키지 매니저는 사용하지 마세요.

# Library preference

코드를 직접 구현하기 전에, 해당 기능을 해결해주는 라이브러리가 있는지 먼저 조사하세요. 라이브러리로 해결 가능한 코드는 라이브러리를 적극 사용하고 직접 구현을 피하세요.

# Web search verification

코드 구현, 아키텍처 결정, 라이브러리 선택 등 어떤 동작을 수행하기 전에 **반드시** `web_search` 도구를 이용해 해당 접근 방식이 적절한지, 더 나은 대안이 있는지, 최신 모범 사례를 따르고 있는지 확인하세요. 추측하거나 오래된 지식에 의존하지 마세요.

# Code style

- 함수 선언 시 `function` 키워드 대신 **arrow function** (`const fn = (...) => { ... }`)만 사용하세요.

# Formatting & Linting

코드 수정 후 **반드시** `prettier`와 `eslint`를 실행하여 스타일 일관성을 유지하세요. (커밋 전에 자동으로 실행된다고 가정하지 말고 직접 수행)

- 프로젝트에 설정된 대로 `npm run format`, `npm run lint` 등을 실행하세요.
