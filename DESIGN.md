# DESIGN.md — Designer (트래블 에이전트)

> This file is the single source of truth for visual decisions.
> Every AI agent MUST read this before generating or modifying any UI code.
> Do not fall back on generic defaults. Every choice here is deliberate.

---

## 1. Visual Archetype

**Claude-inspired editorial warmth + subtle sky accent**

- Base: Claude.ai의 미니멀하고 따뜻한 에디토리얼 감성 — 넉넉한 여백, 낮은 대비의 중성 배경, 본문 중심 레이아웃
- Accent: 여행의 경쾌함을 담은 muted skyblue (#7AB8D6)를 강조색으로 사용
- 느낌: "비싼 개인 비서 앱" — 조용하고, 신뢰감 있고, 방해하지 않음
- 절대 NOT: startup-modern, shadcn 기본값, glassmorphism, purple/indigo 그라데이션, 다크모드 기본값

---

## 2. Palette

### Brand Hues (3 active hues only)

| 역할 | 색상 | HSL | 용도 |
|------|------|-----|------|
| **Neutral (60%)** | Warm off-white → warm charcoal | `hsl(40 20% 97%)` → `hsl(40 10% 12%)` | 배경, 본문 텍스트 |
| **Accent (30%)** | Muted skyblue | `hsl(200 50% 65%)` | 버튼, 링크, 포커스링, 인터랙션 |
| **Warm point (10%)** | Soft terracotta | `hsl(25 55% 55%)` | 장식적 아이콘(여행), 구분선 포인트 |

### Semantic Colors (separate from brand)

- Success: `hsl(150 40% 50%)`
- Warning: `hsl(40 70% 55%)`
- Error: `hsl(0 65% 55%)`
- Info: `hsl(200 50% 60%)`

### Neutral Ramp

```
bg (light)   : hsl(40 20% 97%)    /* #f7f6f3 — 따뜻한 오프화이트 */
surface      : hsl(40 15% 99%)    /* 카드, 패널 */
muted        : hsl(40 15% 93%)    /* 호버, 섹션 구분 */
border       : hsl(40 10% 86%)    /* hairline */
muted-fg     : hsl(40 10% 45%)    /* 보조 텍스트 */
fg           : hsl(40 10% 12%)    /* 본문 (거의 검정에 가깝지만 완전 검정은 아님) */
```

### Rules

- **Pure `#fff` / `#000` 사용 금지** — 모든 배경과 텍스트는 톤을 준다
- **Tailwind blue 계열(`blue-*`), indigo 계열(`indigo-*`), purple 계열(`purple-*`) 절대 사용 금지**
- 그라데이션 사용 금지 (단, 버튼이나 배너에도 NO)
- 그림자는 단일 레이어 `0 1px 3px rgba(0,0,0,0.06)` 만 허용 (multiple shadow 금지)

---

## 3. Typography

### Font Pairing

| 용도 | 폰트 | 비고 |
|------|------|------|
| **Display / Heading** | `Instrument Serif` (400 only) | Claude.ai 스타일의 serif 강조, 이탤릭도 가능 |
| **UI / Body** | `Geist Sans` | 깔끔하고 중성적인 sans |
| **Mono** | `Geist Mono` | 코드블록, 메타데이터, tool call 로그 |

### Size Scale (1.25 modular scale, app rhythm)

```
display : 48px (text-5xl)
h1      : 36px (text-4xl)
h2      : 28px (text-3xl)
h3      : 22px (text-2xl)
h4      : 18px (text-xl)
body    : 15px (text-base / 0.938rem)
small   : 13px (text-sm)
xs      : 11px (text-xs)
```

### Weight Usage

- Headings: 500 (medium) — serif는 400 (regular italic 쓰려면 `font-serif italic`)
- Body: 400 (regular)
- Labels / 버튼: 500 (medium)
- Bold (700) 사용 금지 — 무게 대신 계층으로 해결

### Measure (line length)

- 본문: 60–75자
- 채팅 메시지: 최대 720px 너비

### Rules

- **Inter, Poppins, Plus Jakarta Sans, Space Grotesk 절대 사용 금지** (AI slop default)
- 한글 본문은 `Geist Sans`가 기본이지만, 필요시 `Noto Sans KR` fallback 고려
- 올캡스 레이블은 `text-xs font-medium tracking-wider`만 허용, 과용 금지

---

## 4. Spacing System

### Base unit: 4px (Tailwind v4 spacing scale)

```
gap-1   = 4px
gap-2   = 8px
gap-3   = 12px
gap-4   = 16px
gap-6   = 24px
gap-8   = 32px
gap-12  = 48px
gap-16  = 64px
gap-20  = 80px
```

### Proximity Rule
```
내부 간격(컴포넌트 내) < 컴포넌트 간격 < 섹션 간격
button 내부:  gap-2
card 내부:    gap-3 (vertical) / gap-4 (horizontal)
section 간:   gap-12 ~ gap-20
```

### Section Padding Variation
- Hero: `py-24` 
- Content: `py-16`
- CTA / Footer: `py-12`
- **모든 섹션이 같은 패딩이면 monotonous → 반드시 다르게**

---

## 5. Border Radius

| 요소 | Radius | 값 |
|------|--------|-----|
| Button (interactive) | `rounded-md` | 6px |
| Card (container) | `rounded-xl` | 12px |
| Input | `rounded-md` | 6px |
| Badge | `rounded-full` | pill |
| Panel / Sidebar | `rounded-none` | 0px |
| Tool call card | `rounded-lg` | 8px |
| Avatar | `rounded-full` | pill |

### Rules

- **`rounded-2xl` / `rounded-3xl` 절대 사용 금지** — AI slop signature
- 버튼 radius와 카드 radius는 반드시 다르게 (mismatch = choice의 증거)
- `rounded-lg` (8px)는 한 곳에서만 사용 (tool call card)

---

## 6. Card & Container Rules

1. **첫 번째 분리 수단: whitespace** → 안 되면 배경 차이(3-5% lightness shift)
2. **보더는 최후의 수단** — 절대 flat gray 1px border를 기본으로 쓰지 않음
3. **좌측 컬러 보더 스트립 금지** — 가장 확실한 AI tell
4. 카드 중첩("cardocalypse") 금지 — 카드 안에 카드 넣지 않음
5. 그림자는 `shadow-sm` 하나로 통일 (shadcn 기본 `shadow-md` 금지)

---

## 7. Layout Rules

### Channel / Page Skeleton

```
[Left Sidebar (w-64)] [Main Content (flex-1)]
```

- 사이드바: session list, 고정 너비 256px
- 메인 영역: 채팅 메시지 목록 + 입력창

### Message Area (Claude.ai style)

- 최대 너비: `max-w-3xl` (720px), 가운데 정렬
- User bubble: 우측 정렬, soft accent background (`bg-primary/10`), rounded-2xl
- Assistant message: 좌측 정렬, full width, 일반 텍스트 흐름
- 사이드바와 메인 사이: `border-r` 1px

### Anti-patterns (금지 목록)

- **3등분 카드 그리드** (`grid-cols-3`) — 절대 금지
- **"Trusted by" 로고 줄** — 절대 금지
- **숫자 "1·2·3" 단계** — 절대 금지
- **통계 숫자 배너 줄** — 절대 금지
- **아이콘 + 라벨 피쳐 카드 3개** — 절대 금지
- **Pricing 테이블 3단 "Most Popular"** — 절대 금지 (필요 없음)
- **가운데 정렬 hero + floating 스크린샷** — 절대 금지
- **인용에 동그란 아바타 + 이름 + 역할** — 절대 금지
- **자동 재생 숫자 카운터 애니메이션** — 절대 금지
- **blob SVG / 추상 도형 장식** — 절대 금지
- **glassmorphism (frosted glass)** — 절대 금지
- **Lottie 애니메이션** — 절대 금지
- **푸터 4단 컬럼 (Product / Company / Resources / Legal)** — 절대 금지

---

## 8. Component Styles

### Button
- Flat (no gradient), `rounded-md`, 6px
- Primary: accent skyblue bg, white text
- Ghost: transparent, hover 시 muted bg
- Size: `h-9 px-4` (default), `h-8 px-3` (sm)
- Transition: `transition-all duration-150` (snap 느낌 최소화)

### Input / Textarea
- 배경: surface, border: border color
- Focus: `ring-2 ring-accent/30` (skyblue)
- Textarea: borderless design inside message bar, `min-h-[44px] max-h-32`
- 비밀번호 게이트: 중앙 정렬, 넉넉한 여백, minimal

### Badge
- `rounded-full`, `px-2.5 py-0.5`, `text-xs font-medium`
- Background: `muted` or `primary/10` (tool call 상태 표시용)

### Tool Call Card
- collapse/expand 토글
- Header: tool icon + name + state badge
- State colors:
  - running: `bg-blue-100 text-blue-700` (muted skyblue)
  - complete: `bg-green-100 text-green-700`
  - error: `bg-red-100 text-red-700`
- JSON body: `font-mono text-xs`, pre 포맷

### Session Sidebar
- 배경: sidebar color (muted보다 한 단계 더 진함)
- Active session: accent background highlight
- Hover: subtle bg shift
- New chat button: accent outline 버튼

### Password Gate
- 중앙 정렬, 여백 넉넉 (`py-32`)
- Decorative icon: 여행 관련 (MapPin / Compass) — terracotta warm point color
- Input: centered, 제한된 너비 (`w-80 max-w-full`)
- Error: shake 애니메이션 + 피드백 텍스트

---

## 9. Motion & Animation

### Principles
- 과장된 motion NO — 미묘함이 핵심
- 모든 scroll animation 1회만 실행 (반복 금지)

### 허용 목록

| 요소 | 애니메이션 | 타이밍 |
|------|-----------|--------|
| Message appear | `fadeIn` (opacity 0→1) | 200ms ease-out |
| Sidebar appear | slide from left | 250ms ease-out |
| Loading dot (Claude style) | 3-dot pulse | infinite, 1.4s cycle |
| Button hover | bg tint shift | 150ms ease |
| Tool call expand | height transition | 200ms ease |

### Keyframes (globals.css)
```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(-12px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes dotPulse {
  0%, 80%, 100% { opacity: 0; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}
```

### 금지
- **fade-up (translateY + opacity)** — AI slop default, 절대 금지
- stagger animation
- scroll-triggered number counter
- glowing effect
- hover시 scale transform (카드 떠있는 느낌)

---

## 10. Voice & Microcopy

### Tone
- **한국어**, 친구에게 말하듯 자연스럽게
- 존댓말 기본, 필요시 반말 (여행 일정 제안처럼 캐주얼한 맥락)
- "~합니다" 체, "~해요" 혼용 가능

### 금지 단어 (절대 사용 금지)
- empower, leverage, seamless, robust, harness, delve, tapestry, revolutionize
- "오늘날의 빠르게 변화하는 세상에서"
- "혁신적인", "최첨단", "스마트한"

### Microcopy 예시
- 버튼: "시작하기", "질문하기" — NOT "Get Started", "Submit"
- 빈 상태: "무엇을 도와드릴까요?" (Claude.ai 스타일)
- 로딩: "생각 중...", "장소 검색 중..."
- 에러: "다시 시도해 주세요" — NOT "An error occurred"

---

## 11. Dark Mode (optional, 제한적)

- **기본값은 라이트 모드** — 다크모드는 사용자 OS 설정에 따라 자동 전환
- 다크모드는 Accent skyblue를 한 단계 어둡게 (`hsl(200 45% 50%)`)
- 모든 대비 APCA Lc ≥ 75 (본문), ≥ 45 (큰 텍스트) 측정 필수
- `bg-background`는 완전 검정(`#000`)이 아닌 `hsl(40 15% 8%)`

---

## 12. APCA Contrast Targets

모든 text/background 쌍은 아래 기준 통과해야 함 (눈대기 금지):

| 용도 | 최소 APCA Lc |
|------|-------------|
| 본문 (15px / 400 weight) | ≥ 75 |
| 큰 텍스트 (24px+ / 700) | ≥ 45 |
| 비텍스트 UI (icon, border) | ≥ 30 |
| 비활성 상태 | ≥ 15 |

- 이미지나 그라데이션 위 텍스트는 반투명 오버레이 필수
- CI에 contrast check 스크립트 포함 권장

---

## 13. Design Review Checklist

배포 전에 아래 항목을 전부 검토하세요. 하나라도 fail이면 수정 후 재검토:

- [ ] 하나의 명확한 aesthetic 방향이 유지되는가?
- [ ] 폰트가 Inter/Poppins/Geist 단독이 아닌가? (페어링 사용)
- [ ] Tailwind blue/indigo/purple 계열이 전혀 없는가?
- [ ] `rounded-2xl` 이상 radius가 사용되지 않았는가?
- [ ] 카드에 flat gray border가 없는가? (whitespace/bg로 대체)
- [ ] 좌측 컬러 보더 스트립이 없는가?
- [ ] 3등분 카드 그리드가 없는가?
- [ ] 그라데이션/glassmorphism/blob SVG가 없는가?
- [ ] 다크모드가 기본값이 아닌가?
- [ ] 모든 인터랙티브 상태(hover, focus, active, disabled)가 정의되었는가?
- [ ] APCA 대비가 모든 text/bg 쌍에서 통과하는가?
- [ ] "fade-up" 애니메이션이 사용되지 않았는가?
- [ ] 인터랙션마다 같은 애니메이션(motion uniformity)이 아닌가?
- [ ] 금지 단어(empower, leverage 등)가 microcopy에 없는가?

---

*Last updated: 2026-07-15*
*Apply this file before every UI generation pass. If a component doesn't match, reject and regenerate.*
