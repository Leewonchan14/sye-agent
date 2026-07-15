# DESIGN.md — Designer

> 연인 둘만의 데이트 플래너. 핑크 팔레트, 따뜻하고 부드러운 무드.
> 모든 UI 생성 전 이 파일을 읽어야 합니다. 기본값(fallback)은 금지입니다.

---

## 1. Visual Archetype

**Warm Pink Boudoir — Romantic Editorial**

Claude.ai의 에디토리얼 구조를 베이스로, 팔레트를 dried rose & blush pink 계열로 전환.
"따뜻한 핑크 부케" 같은 분위기 — 부드럽고, 낭만적이고, 둘만의 공간 같은 느낌.

- **핵심 대비**: 블러쉬 핑크 캔버스 (`#fdf6f5`) + dried rose primary (`#d96c75`) + rosewood accent (`#b85d65`)
- **AI Slop 금지 목록**: vibecode purple 없음, cool gray 없음, pure white 없음, glassmorphism 없음
- **NOT**: "아기자기한", "장난감 같은" — 럭셔리하고 차분한 핑크, 절제된 로맨틱
- **Reference 감성**: Aesop의 핑크 에디션, Journal de la beauté, 톤 다운된 로맨틱 editorial

---

## 2. Palette

### Brand & Accent

| 토큰 | 역할 | Hex | 용도 |
|------|------|-----|------|
| `--primary` | **Dried Rose** | **`#d96c75`** | CTA 버튼, 링크, 강조 — 시든 장미 같은 차분한 핑크 |
| `--primary-active` | Rose pressed | `#c25660` | 버튼 active/pressed |
| `--primary-disabled` | Rose disabled | `#efd3d0` | 비활성화 상태 |
| `--accent-rosewood` | Rosewood | `#b85d65` | 보조 악센트 (아이콘, 장식) |
| `--accent-blush` | Soft Blush | `#f0b7b9` | 배지, 약한 강조 |

### Surface

| 토큰 | Hex | 용도 |
|------|-----|------|
| `--canvas` | **`#fdf6f5`** | **기본 배경 — 블러쉬 핑크 빛 도는 크림** |
| `--surface-soft` | `#fcf0ee` | 살짝 더 진한 레이어, 호버 |
| `--surface-card` | `#f7e8e5` | 카드 배경 |
| `--surface-strong` | `#f0dbd7` | 강한 핑크 표면 |
| `--surface-dark` | **`#1c1517`** | **다크 표면 (코드블록)** — 따뜻한 레드빛 블랙 |
| `--surface-dark-elevated` | `#2a1f21` | 다크 표면 elevated |
| `--surface-dark-soft` | `#231a1b` | 다크 표면 소프트 |

### Text

| 토큰 | Hex | 용도 |
|------|-----|------|
| `--ink` | **`#141312`** | **본문/헤딩 — 따뜻한 near-black** |
| `--body` | `#3d3837` | 보조 텍스트 |
| `--body-strong` | `#252222` | 진한 보조 텍스트 |
| `--muted` | `#6c5d5b` | 메타데이터, 플레이스홀더 — 로즈 브라운 |
| `--muted-soft` | `#8e7d7a` | 가장 흐린 텍스트 |
| `--on-primary` | `#ffffff` | Primary 위 텍스트 |
| `--on-dark` | `#fdf6f5` | 다크 표면 위 텍스트 |
| `--on-dark-soft` | `#a0908d` | 다크 표면 위 흐린 텍스트 |

### Border & Hairline

| 토큰 | Hex | 용도 |
|------|-----|------|
| `--hairline` | `#e8d6d3` | 표준 구분선/보더 — 소프트 핑크 |
| `--hairline-soft` | `#f0e3e0` | 흐린 구분선 |

### Semantic

| 토큰 | Hex |
|------|-----|
| `--success` | `#7db8a0` (민트, 핑크 대비용) |
| `--warning` | `#d4a017` |
| `--error` | `#c64545` |

### Rules

- **pink에 warm undertone** — 차가운 핫핑크(barbie pink), 형광 금지
- **Pure `#ffffff` 금지** — 기본 배경은 항상 `#fdf6f5` (블러쉬 크림)
- **Pure `#000000` 금지** — 텍스트는 `#141312`
- **Tailwind `blue-*`, `indigo-*`, `purple-*` 계열 절대 금지** (특히 vibecode lavender-purple)
- **Tailwind `rose-*`, `pink-*` 기본값 사용 금지** — 직접 정의한 hex만 사용
- **그라데이션 완전 금지** — 깊이는 레이어링으로만 표현

---

## 3. Typography

### Font Family

| 역할 | 폰트 | Fallback |
|------|------|----------|
| **Display (h1-h3)** | `Instrument Serif` | `Georgia`, `serif` |
| **Body / UI** | `Geist` | `system-ui`, `sans-serif` |
| **Code** | `Geist Mono` | `ui-monospace`, `monospace` |

### Type Scale (Claude.ai 그대로 — 구조는 유지)

| Level | Size | Weight | Line Height | Letter Spacing | Font |
|-------|------|--------|-------------|----------------|------|
| **Display XL** (hero) | 64px | 400 | 1.05 | -1.5px | Serif |
| **Display LG** (h1) | 48px | 400 | 1.1 | -1px | Serif |
| **Display MD** (h2) | 36px | 400 | 1.15 | -0.5px | Serif |
| **Display SM** (h3) | 28px | 400 | 1.2 | -0.3px | Serif |
| **Title LG** | 22px | 500 | 1.3 | 0 | Sans |
| **Title MD** (h4) | 18px | 500 | 1.4 | 0 | Sans |
| **Title SM** | 16px | 500 | 1.4 | 0 | Sans |
| **Body MD** | 16px | 400 | 1.55 | 0 | Sans |
| **Body SM** | 14px | 400 | 1.55 | 0 | Sans |
| **Caption** | 13px | 500 | 1.4 | 0 | Sans |
| **Caption uppercase** | 12px | 500 | 1.4 | 1.5px | Sans |
| **Code** | 14px | 400 | 1.6 | 0 | Mono |
| **Button** | 14px | 500 | 1 | 0 | Sans |

### Weight Usage

- Serif Display: 400 only (italic 가능)
- Body: 400 (regular)
- Labels / UI: 500 (medium)
- **700 (bold) 사용 금지**

### Measure

- 채팅 메시지 최대 너비: **720px** (`max-w-3xl`), 가운데 정렬

---

## 4. Radius System

| Level | px | 용도 |
|-------|----|------|
| `--radius-xs` | **4px** | 작은 UI 요소 |
| `--radius-sm` | **6px** | 버튼 |
| `--radius-md` | **8px** | **기본 radius** — input, CTA |
| `--radius-lg` | **12px** | 카드, 모달, 코드블록 |
| `--radius-xl` | **16px** | 유저 버블, 특수 컨테이너 |
| `--radius-pill` | 9999px | pill/badge |

### Key Rule

- **`rounded-2xl` (16px+), `rounded-3xl` 절대 금지**
- 버튼 `rounded-md`(8px), 카드 `rounded-lg`(12px)
- 용도별로 radius 다르게 — 통일 금지

---

## 5. Spacing

| Token | px | Tailwind |
|-------|----|----------|
| `--space-xxs` | 4px | `gap-1` |
| `--space-xs` | 8px | `gap-2` |
| `--space-sm` | 12px | `gap-3` |
| `--space-md` | 16px | `gap-4` |
| `--space-lg` | 24px | `gap-6` |
| `--space-xl` | **32px** | `gap-8` — 카드 내부 패딩 |
| `--space-xxl` | 48px | `gap-12` |
| `--space-section` | **96px** | `gap-24` — 섹션 간격 |

---

## 6. Component Styles

### 6.1 전체 레이아웃

```
┌──────────────────────────────────────────────────┐
│  ┌──────────────┬──────────────────────────────┐  │
│  │  Sidebar     │  Main Content                │  │
│  │  w-64        │  flex-1                      │  │
│  │  bg-canvas   │  flex items-center           │  │
│  │  border-r    │  max-w-3xl 가운데             │  │
│  │  hairline    │                              │  │
│  └──────────────┴──────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### 6.2 Sidebar

| 속성 | 값 |
|------|-----|
| 너비 | 256px (`w-64`) |
| 배경 | `bg-[#fdf6f5]` (canvas) |
| 우측 보더 | `border-r border-[#e8d6d3]` |
| New Chat 버튼 | `h-9 px-4`, `rounded-md`, border `#e8d6d3` |
| Session item | `h-9 px-3 rounded-md`, hover `bg-[#fcf0ee]` |
| Active session | `bg-[#f7e8e5] text-[#141312]` |
| Icons | Rosewood `#b85d65` |

### 6.3 Chat Message Area

- **메시지 영역 너비**: `max-w-3xl` (720px), 가운데 정렬
- **Empty state greeting**: "무엇을 도와드릴까요?" — Instrument Serif, 28px
- **Sub**: "우리 데이트를 치이카와가 도와줄게요" — 14px, muted

### 6.4 User Bubble (연인 메시지)

- 우측 정렬
- 배경: **`bg-[#f0dbd7]`** (surface-strong — 핑크빛 도는 크림)
- Radius: `rounded-[16px] rounded-br-[4px]` (하단만 sharp)
- Padding: `px-4 py-2.5`
- Max-width: `max-w-[80%]`
- Text: 15px, `#141312` (ink)

### 6.5 Assistant Message

- 좌측 정렬, 배경 없음 (transparent)
- 텍스트: 16px, `#141312`, line-height 1.55
- 최대 너비: `max-w-3xl` (720px)

### 6.6 Input Bar

- 위치: 페이지 하단 fixed
- 배경: `bg-[#fdf6f5]` (canvas)
- 상단 보더: `border-t border-[#e8d6d3]`
- Textarea: `bg-transparent`, `border-none`, `min-h-[44px] max-h-32`, 15px
- Placeholder: `text-[#8e7d7a]`
- Send 버튼: `w-8 h-8 rounded-md bg-[#d96c75] text-white` — ArrowUp icon
- Stop 버튼: Square icon

### 6.7 Tool Call Card

- `rounded-lg` (12px), `border border-[#e8d6d3]`
- 배경: `bg-[#fcf0ee]` (surface-soft)
- State badge running: `bg-[#d96c75]/10 text-[#d96c75]`
- State badge complete: `bg-[#7db8a0]/10 text-[#7db8a0]`
- State badge error: `bg-[#c64545]/10 text-[#c64545]`

### 6.8 Code Block

- 배경: `#1c1517` (surface-dark, 레드빛 블랙)
- `rounded-lg` (12px), padding `p-4`
- 폰트: `font-mono text-sm`, text `#fdf6f5`

### 6.9 Password Gate

- 중앙 정렬 full-screen
- 배경: `bg-[#fdf6f5]`
- Input: `w-80`, `rounded-md`, `border-[#e8d6d3]`
- 버튼: `bg-[#d96c75] text-white rounded-md h-9 px-4`
- Icon: Heart 기반 장식 (lucide Heart 또는 MapPin, rosewood `#b85d65`)

### 6.10 Button Variants

| Variant | 스타일 |
|---------|--------|
| **Primary** | `bg-[#d96c75] text-white rounded-md h-10 px-5 text-sm font-medium` |
| Primary hover | `bg-[#c25660]` |
| **Secondary** | `bg-[#fdf6f5] text-[#141312] rounded-md h-10 px-5 border border-[#e8d6d3]` |
| Secondary hover | `bg-[#fcf0ee]` |
| **Ghost** | `bg-transparent text-[#141312] rounded-md h-9 px-3` |
| Ghost hover | `bg-[#fcf0ee]` |

---

## 7. Elevation / Shadow

| Level | 값 |
|-------|-----|
| **Flat** | `none` — 기본 |
| **Ring** | `0 0 0 1px #e8d6d3` |
| **Raised** | `0 4px 24px rgba(0,0,0,0.04)` |

- Tailwind `shadow-sm`/`shadow-md` 기본 shadow 금지

---

## 8. Layout Anti-Patterns (금지 목록)

```
❌ 3등분 카드 그리드
❌ "Trusted by" 로고 줄
❌ 숫자 "1·2·3" 단계
❌ 통계 숫자 배너 줄
❌ 아이콘 + 라벨 피쳐 카드 3개
❌ 가운데 정렬 hero + floating 스크린샷
❌ 그라데이션 / blob SVG / abstract shape
❌ glassmorphism (frosted glass)
❌ Lottie 애니메이션
❌ fade-up (translateY + opacity)
❌ hover 시 scale transform
❌ scroll-triggered number counter
❌ glowing border / neon effect
❌ 좌측 컬러 보더 스트립
❌ rounded-2xl / rounded-3xl
❌ Pure #fff / #000 배경
❌ vibecode purple / indigo gradient 가장 금지
```

---

## 9. Motion

### Minimal motion (Claude.ai 스타일 유지)

| 요소 | 애니메이션 | Timing |
|------|-----------|--------|
| Message appear | `fadeIn` (opacity 0→1) | 200ms ease-out |
| Loading dots | 3-dot pulse | 1.4s cycle infinite |
| Button hover | bg tint shift | 150ms ease |
| Tool call expand | height transition | 200ms ease |

### 금지
- translateY 기반 fade-up
- stagger animation
- glowing / pulsing (loading dot 제외)

---

## 10. Voice & Microcopy

### Tone
- **한국어**, 부드러운 말투, "~해요" / "~예요" 체
- 연인 사이의 대화처럼 편안하지만 AI라는 점을 고려한 적절한 격식
- 데이트 제안 시: 부드럽고 따뜻하게

### Greeting 예시
- "무엇을 도와드릴까요?"
- "우리 데이트, 같이 계획해볼까요?"
- "오늘은 어디로 갈까요?"

### 금지 단어
- empower, leverage, seamless, robust, harness, revolutionize
- "혁신적인", "최첨단", "스마트한"

---

## 11. Dark Mode

- **기본값 라이트 모드**
- OS 설정 자동 전환
- Dark canvas: `#1c1517`
- Dark text: `#fdf6f5`
- pink accent 유지 (약간 더 어둡게: `#c25660`)

---

## 12. APCA Contrast Targets

| 용도 | 최소 Lc |
|------|---------|
| 본문 (16px / 400) | ≥ 75 |
| 큰 텍스트 (24px+ / 500) | ≥ 45 |
| 비텍스트 UI | ≥ 30 |

---

## 13. Design Review Checklist

- [ ] 배경이 `#fdf6f5` (블러쉬 핑크 크림)인가?
- [ ] primary가 `#d96c75` (dried rose)인가?
- [ ] 모든 gray가 pink warm undertone을 가지는가? (cool gray 없음)
- [ ] Tailwind blue/indigo/purple 계열이 전혀 없는가?
- [ ] vibecode lavender-purple이 없는가?
- [ ] `rounded-2xl` 이상이 사용되지 않았는가?
- [ ] flat gray border가 카드 기본값이 아닌가? (hairline `#e8d6d3`)
- [ ] 3등분 카드 그리드가 없는가?
- [ ] 그라데이션/glassmorphism/blob SVG가 없는가?
- [ ] dark mode가 기본값이 아닌가?
- [ ] 모든 인터랙티브 상태가 정의되었는가?
- [ ] 모든 text/bg 쌍이 APCA 대비를 통과하는가?
- [ ] translateY fade-up이 없고 Claude dot pulse를 쓰는가?

---

*Warm Pink Boudoir 테마 — 2026-07-15*
*연인 둘만의 데이트 플래너를 위한 디자인 시스템*
