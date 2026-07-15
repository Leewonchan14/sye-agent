---
name: anti-slop-design
description: >
  Context-aware design system that replaces generic AI aesthetics with domain-specific,
  production-grade output. Covers web (React, landing pages, artifacts), mobile (SwiftUI,
  Compose, React Native), desktop (Electron, Tauri), CLI/TUI, PDF/print (Typst, React-PDF),
  email (React Email), and data visualization (Recharts, D3, Nivo).
---

# Anti-Slop Design System

Every AI model in existence has converged on the same aesthetic: purple gradient,
Inter font, 8px border radius, centered hero, three perfectly equal columns, a
sprinkle of Heroicons, and a dark mode that's just `#000000` with white text.
It's the design equivalent of elevator music. This skill exists because I got
tired of every AI-generated UI looking like it was built by the same sleep-deprived
intern at a Series A startup in 2023. Anti-slop covers 8 domain profiles (SaaS,
e-commerce, editorial, fintech, healthcare, creative, dev-tools, and general),
ships a 15-rule anti-slop checklist that catches generic output before it reaches
the user, and follows progressive disclosure: you're reading the hub doc now,
which points to `domain-map.json` for domain profiles, `references/` for
platform-specific guidance, `assets/` for tokens and textures, and `templates/`
for starting points. Read this file first. Everything else flows from here.

---

## Design Thinking Protocol

Before generating ANY design output — a React component, a landing page, an
artifact, a CLI app, whatever — run through these five steps. Every time. No
shortcuts. The whole point is that generic output is the default failure mode,
and the only way to avoid it is a deliberate process.

### Step 1: Identify Domain

Read the user's prompt. What are they building? A fintech dashboard? An
e-commerce checkout? A developer tool? Match keywords to one of the 8 domains
defined in `domain-map.json`:

- **saas** — B2B dashboards, admin panels, analytics platforms
- **ecommerce** — Product pages, carts, checkout flows, catalogs
- **editorial** — Blogs, magazines, news sites, content-heavy layouts
- **fintech** — Banking, trading, crypto, financial dashboards
- **healthcare** — Patient portals, EHR interfaces, wellness apps
- **creative** — Portfolio sites, agency pages, design studios
- **devtools** — IDEs, documentation, API explorers, terminal apps
- **general** — The fallback. Use this only if the prompt genuinely doesn't
  fit any other category. "Make me a website" with zero context? Fine, general.
  But try harder before defaulting here.

If the prompt is ambiguous — "build me a dashboard" could be SaaS, fintech, or
healthcare — ask the user. Don't guess. A fintech dashboard and a healthcare
dashboard should look nothing alike.

### Step 2: Load Domain Profile

Open `domain-map.json`. Find the matching domain key. Extract the full profile:

- **Color palette** — OKLCH values. Not hex. Not HSL. OKLCH, because it's
  perceptually uniform and you can derive tints/shades without things going
  muddy. Each domain has primary, secondary, accent, neutral, success, warning,
  error, and info colors with 10 lightness steps each.
- **Typography stack** — Primary and secondary font families, weights, and
  the fluid type scale to use. No, you cannot substitute Inter.
- **Border radius** — The `shape.borderRadius` value. Could be 2px for fintech,
  12px for creative, 6px for SaaS. It is NOT 8px for everything.
- **Motion level** — `none`, `minimal`, `moderate`, or `expressive`. Fintech
  gets `minimal`. Creative gets `expressive`. This controls whether you use
  transitions, spring animations, or nothing at all.
- **Density** — `compact`, `normal`, or `spacious`. Affects spacing multipliers.
- **Shadows** — Shadow style and intensity. Some domains use sharp shadows,
  some use diffuse, some use almost none.

### Step 3: Select Platform Reference

Based on what the user is building (not what domain they're in), load the
correct reference file from `references/`:

- Building a React dashboard? → `references/web-react.md`
- Building a landing page? → `references/web-landing.md`
- Building a Claude artifact? → `references/web-artifacts.md`
- Building an iOS app? → `references/mobile-native.md`
- Building a CLI tool? → `references/cli-terminal.md`
- And so on. See the Platform Routing Table below for the full mapping.

The reference file contains platform-specific constraints, patterns, and
anti-patterns. Read it. It's there for a reason.

### Step 4: Apply Anti-Slop Checklist

This is the core of the system. Before you show anything to the user, run
every output decision through the 15-rule checklist below. Every. Single. One.
If any rule is violated, fix it. Don't ship slop with a "you might want to
change the colors" disclaimer. Just fix it.

The checklist is not optional. It's not a suggestion. It's the whole point.

### Step 5: Assemble from Assets

Now build the thing:

1. Start with the appropriate template from `templates/`
2. Copy CSS tokens from `assets/css/` (reset, fluid scales, motion tokens)
3. Inject domain colors from `assets/tokens/domain-tokens/{domain}.json`
4. Apply domain typography, spacing, and shape values
5. Select SVG textures if the design calls for them
6. Customize the template with domain-specific values
7. Run the checklist one more time. Yes, again.

---

## Anti-Slop Checklist

Fifteen rules. Memorize them. Tattoo them on your forearm. Every single one
exists because AI models consistently get it wrong. These are not edge cases —
they are the most common failures in AI-generated design output.

### Rule 1: Typography

- **Check:** Is the primary font Inter, Roboto, or Open Sans?
- **Fix:** Use the domain font stack from domain-map.json. Every domain has a
  curated primary + secondary font pairing. Inter is fine as a *body* font for
  a dev-tools project. It is not fine as the primary font for an editorial
  magazine layout. Load the domain's `typography.primary` and
  `typography.secondary` values. Use them.

### Rule 2: Color

- **Check:** Is there a purple-to-blue gradient anywhere? Any gratuitous
  gradient that screams "AI made this"?
- **Fix:** Use the domain's OKLCH palette. Gradients are fine when they serve
  a purpose (data visualization heat maps, progress indicators). They are not
  fine as the background of every hero section and button. If you need a
  gradient, build it from two adjacent colors in the domain palette.

### Rule 3: Layout

- **Check:** Is it centered-hero → three-equal-columns → CTA? The Holy Trinity
  of boring?
- **Fix:** Use asymmetric layouts. Bento grids. Editorial layouts with varied
  column widths. Full-bleed sections mixed with contained content. The domain
  profile includes a `layout.style` hint — use it. An editorial site should
  feel like a magazine, not a SaaS landing page.

### Rule 4: Background (Light)

- **Check:** Is the background pure `#FFFFFF`?
- **Fix:** Use warm off-whites from `assets/css/primitives-light.css`. Values
  like `oklch(0.985 0.002 90)` or `oklch(0.975 0.005 80)`. Pure white is
  harsh and sterile. Off-whites feel intentional and designed.

### Rule 5: Background (Dark)

- **Check:** Is the dark mode background pure `#000000`?
- **Fix:** Use dark primitives in the `oklch(0.13–0.17)` lightness range. Pure
  black creates too much contrast with text and makes everything look like a
  terminal from 1985. Use something like `oklch(0.145 0.005 260)` — dark enough
  to be obviously dark mode, warm enough to not feel like staring into the void.

### Rule 6: Border Radius

- **Check:** Is `border-radius: 8px` applied to everything?
- **Fix:** Use `domain.shape.borderRadius` from the domain profile. A fintech
  app should have tight, precise corners (2-4px). A creative portfolio can go
  rounder (12-16px). Consistency within a domain matters more than any specific
  value. Also: vary radius by component size — a card and a button inside that
  card should not have the same border-radius.

### Rule 7: Shadows

- **Check:** Are you using Material Design elevation shadows everywhere?
  (`0 2px 4px rgba(0,0,0,0.1)` on literally everything?)
- **Fix:** Check `domain.shadows` in the profile. Some domains use sharp,
  offset shadows (editorial, creative). Some use extremely subtle shadows
  (fintech, healthcare). Some barely use shadows at all (dev-tools). Match
  the domain. And for the love of clarity, don't put a shadow on every card
  just because it's a card.

### Rule 8: Animation

- **Check:** Is everything bouncing and springing around like a toddler on
  sugar?
- **Fix:** Check `domain.motion` in the profile. `minimal` means subtle
  transitions only — opacity and transform, 150-200ms, ease-out. `moderate`
  allows entrance animations and micro-interactions. `expressive` lets you go
  wild with spring physics and staggered reveals. `none` means no animation
  at all. Respect it.

### Rule 9: Icons

- **Check:** Are you using Heroicons for everything?
- **Fix:** Heroicons are fine for SaaS. But for other domains: Lucide is more
  versatile and lighter. Phosphor has better style variety (thin, light, bold,
  fill, duotone). For editorial, consider no icons at all — let typography do
  the work. The domain profile may specify a preferred icon set.

### Rule 10: Spacing

- **Check:** Is everything spaced with uniform `16px` gaps? `gap: 1rem` on
  every grid?
- **Fix:** Use the fluid space scale from `assets/css/fluid-space-scale.css`.
  Space should be proportional to viewport size and content hierarchy. Section
  gaps should be larger than card gaps. Card gaps should be larger than content
  gaps within cards. Use the `--space-xs` through `--space-3xl` tokens and
  actually vary them.

### Rule 11: Charts and Data Visualization

- **Check:** Are charts using the library's default color scheme? (Recharts
  blue, Chart.js rainbow, etc.)
- **Fix:** Map chart colors to the domain palette. Use the domain's primary,
  secondary, and accent colors plus their lightness variants. For sequential
  data, use a single hue with varying lightness. For categorical data, use
  distinct hues from the palette. Never more than 6-7 colors in a single
  chart — after that, use patterns or grouping.

### Rule 12: Cards

- **Check:** Are all cards the same height in a perfectly uniform grid with a
  `1px solid #E5E7EB` border?
- **Fix:** Vary card sizes. Use a masonry or bento layout when appropriate.
  Style cards per the domain: editorial cards might have no border and rely on
  whitespace. Fintech cards might have subtle left-border accents. Creative
  cards might overlap or have unconventional aspect ratios. The domain profile
  has card styling hints — use them.

### Rule 13: Headings

- **Check:** Are all headings the same weight and just different sizes? (Bold
  36px, Bold 24px, Bold 18px, done?)
- **Fix:** Use the fluid type scale from `assets/css/fluid-type-scale.css`.
  Create dramatic hierarchy: the main heading should be noticeably larger than
  subheadings. Mix weights — a light 72px heading with a bold 14px label
  creates more visual interest than everything being 700 weight. The domain
  typography config includes weight suggestions.

### Rule 14: Content

- **Check:** Is there lorem ipsum or generic placeholder text? "Welcome to our
  amazing platform" type copy?
- **Fix:** Use realistic placeholder text appropriate for the domain. A fintech
  dashboard should show plausible ticker symbols and dollar amounts. A
  healthcare app should show realistic (but fake) patient names and vitals. An
  e-commerce site should show real-looking product names and prices. The domain
  profile includes `content.sampleData` hints.

### Rule 15: Reduced Motion

- **Check:** Did you forget `prefers-reduced-motion`?
- **Fix:** Always, always, always handle it. Wrap spatial animations (slide,
  scale, rotate) in a `prefers-reduced-motion: no-preference` media query.
  Replace them with opacity fades for users who prefer reduced motion. This is
  not optional. It's an accessibility requirement. Every template in this
  system includes a reduced-motion fallback — don't remove it.

---

## Asset Usage Guide

The `assets/` directory contains everything you need to build without
reinventing the wheel every time. Here's what's in there and how to use it.

### CSS Files (Load Order Matters)

Load these in this order. Yes, the order matters. Each file builds on the
previous one:

1. **`css/modern-reset.css`** — Box-sizing, margin reset, smooth scrolling,
   `font-size: 100%` on html. Not a scorched-earth reset — it preserves useful
   defaults like list styles on elements that have a `role="list"`.
2. **`css/fluid-type-scale.css`** — Type scale tokens (`--text-xs` through
   `--text-4xl`) that scale with viewport width using `clamp()`. No more
   hardcoded pixel sizes.
3. **`css/fluid-space-scale.css`** — Space tokens (`--space-xs` through
   `--space-3xl`) with the same fluid scaling approach. Pairs with the type
   scale for consistent rhythm.
4. **`css/motion-tokens.css`** — Duration and easing tokens. Includes the
   `prefers-reduced-motion` media query that zeroes out durations. Load this
   and use the tokens instead of hardcoding `transition: 0.3s ease`.
5. **`css/color-tokens/`** — Directory of CSS files per domain. Each file
   defines `--color-primary-{1-10}`, `--color-secondary-{1-10}`, etc. using
   OKLCH values. Load the one matching your domain.

### SVG Textures

Subtle texture overlays that prevent the "flat and lifeless" look without
going full skeuomorphic. Apply with CSS `background-image` or as inline SVGs:

- **`svg/grain-overlay.svg`** — Film grain effect. Works on hero sections and
  image overlays. Use with `mix-blend-mode: overlay` and low opacity (0.03-0.08).
- **`svg/dot-grid.svg`** — Subtle dot grid for backgrounds. Good for editorial
  and creative domains.
- **`svg/blob-organic.svg`** — Organic blob shapes. Better than the CSS blob
  generators that all look the same.
- **`svg/diagonal-lines.svg`** — Diagonal line pattern. Works for dev-tools
  and technical backgrounds.
- **`svg/noise-subtle.svg`** — Very subtle noise texture for reducing the
  sterile feel of flat UI.

### Font Stacks

`assets/fonts/font-stacks.json` contains curated system font stacks, Google
Fonts pairings, and variable font configurations. Use it instead of importing
fonts blindly or relying on web-safe garbage.

### Domain Tokens

`assets/tokens/_extensibility.md` explains how to create custom domain profiles
and extend the system. `assets/tokens/domain-tokens/` contains per-domain JSON
files with CSS `@import` -ready paths and sample data hints for realistic
placeholder content.

---

## Platform Routing Table

This table maps what the user is building to the correct reference file.
**If the user says "I want a dashboard":**

| Domain → | SaaS | Fintech | Healthcare | E-Commerce |
|-----------|------|---------|------------|------------|
| Platform ↓ | | | | |
| **React/Web** | `web-react.md` | `web-react.md` | `web-react.md` | `web-react.md` |
| **Landing Page** | `web-landing.md` | `web-landing.md` | `web-landing.md` | `web-landing.md` |
| **Artifact** | `web-artifacts.md` | `web-artifacts.md` | `web-artifacts.md` | `web-artifacts.md` |

For native mobile, desktop, CLI, document, or data-viz, the platform
determines the reference, not the domain:

| User says they're building… | Use reference… |
|---|---|
| An iOS / macOS app (SwiftUI) | `mobile-native.md` |
| A React Native app | `mobile-crossplatform.md` |
| A Kotlin app (Jetpack Compose) | `mobile-crossplatform.md` |
| An Electron / Tauri app | `desktop.md` |
| A CLI / terminal tool | `cli-terminal.md` |
| A PDF / print output (Typst, React-PDF) | `pdf-print.md` |
| An email (React Email) | `email.md` |
| A chart / data visualization | `dataviz.md` |

---

## Reference Files (Platform-Specific)

Each reference covers platform conventions, structural patterns, component
guidance, styling rules, and a platform-specific anti-slop checklist.

| File | For When Building |
|------|-------------------|
| `references/web-artifacts.md` | Claude artifacts, HTML/JS/CSS playgrounds, embedded widgets |
| `references/web-landing.md` | Marketing pages, landing pages, hero-section heavy pages |
| `references/web-react.md` | React/Next.js dashboards, SPAs, interactive apps |
| `references/mobile-native.md` | Native iOS (SwiftUI) and Android (Jetpack Compose) |
| `references/mobile-crossplatform.md` | React Native, Kotlin Multiplatform |
| `references/desktop.md` | Electron, Tauri apps |
| `references/cli-terminal.md` | Terminal tools, TUI apps, CLI output |
| `references/pdf-print.md` | Typst, React-PDF, printed output |
| `references/email.md` | React Email, HTML email |
| `references/dataviz.md` | Recharts, D3, Nivo, chart-heavy pages |
| `references/typography.md` | Type systems, font loading, hierarchy (used by others) |
| `references/color-systems.md` | OKLCH color, contrast, accessibility (used by others) |
| `references/layout-spacing.md` | Layout primitives, spacing scale (used by others) |
| `references/animation-motion.md` | Motion design, transitions (used by others) |
| `references/accessibility.md` | A11y patterns, screen-reader support (used by others) |
| `references/anti-patterns.md` | Common anti-patterns handbook |

---

## Templates

`templates/` contains ready-to-adapt starting points for each platform.

| Template | Language/Framework | Lines | Use Case |
|----------|-------------------|-------|----------|
| `web/landing-page.html` | HTML/CSS | ~300 | Pure frontend landing page |
| `web/artifact-react.jsx` | React (JSX) | ~250 | Claude/Poe-style artifact |
| `web/dashboard.tsx` | React/TS | ~200 | Admin dashboard page |
| `web/saas-app.tsx` | React/TS | ~300 | SaaS app layout |
| `mobile/swiftui-app.swift` | SwiftUI | ~220 | Native iOS app |
| `mobile/react-native-app.tsx` | React Native/TS | ~280 | Cross-platform mobile |
| `mobile/compose-app.kt` | Kotlin/Compose | ~320 | Native Android |
| `desktop/electron-app.html` | HTML/CSS/JS | ~300 | Electron app |
| `desktop/tauri-app.html` | HTML/CSS | ~210 | Tauri app |
| `cli/node-cli.ts` | Node.js/TS | ~80 | CLI tool skeleton |
| `cli/python-tui.py` | Python | ~110 | Terminal UI |
| `cli/go-tui.go` | Go | ~120 | Go TUI |
| `documents/react-email.tsx` | React Email | ~180 | HTML email |
| `documents/react-pdf-invoice.tsx` | React-PDF/TS | ~190 | PDF invoice document |
| `documents/typst-report.typ` | Typst | ~140 | Typed report |
| `dataviz/recharts-dashboard.tsx` | React/TS | ~230 | Recharts dashboard |
| `dataviz/nivo-cards.tsx` | React/TS | ~170 | Nivo data cards |
| `dataviz/d3-editorial.html` | D3/HTML | ~260 | Editorial dataviz |

---

## Complete File Map

```
.
├── SKILL.md                    ← You are here
├── README.md                   ← Project overview
├── LICENSE                     ← MIT license
├── anti-slop-design-FULL-SPEC.md  ← Reference specification (270KB)
├── domain-map.json             ← 8 domain profiles with OKLCH palettes
│
├── assets/
│   ├── css/
│   │   ├── modern-reset.css
│   │   ├── fluid-type-scale.css
│   │   ├── fluid-space-scale.css
│   │   ├── motion-tokens.css
│   │   └── color-tokens/
│   │       ├── primitives-light.css
│   │       ├── primitives-dark.css
│   │       └── semantic.css
│   ├── fonts/
│   │   ├── font-stacks.json
│   │   └── loading-snippet.html
│   ├── svg/
│   │   ├── blob-organic.svg
│   │   ├── diagonal-lines.svg
│   │   ├── dot-grid.svg
│   │   ├── grain-overlay.svg
│   │   └── noise-subtle.svg
│   └── tokens/
│       ├── _extensibility.md
│       └── domain-tokens/
│           ├── creative.json
│           ├── devtools.json
│           ├── ecommerce.json
│           ├── education.json
│           ├── fintech.json
│           ├── government.json
│           ├── healthcare.json
│           └── media.json
│
├── references/
│   ├── _toc.md
│   ├── accessibility.md
│   ├── animation-motion.md
│   ├── anti-patterns.md
│   ├── cli-terminal.md
│   ├── color-systems.md
│   ├── dataviz.md
│   ├── desktop.md
│   ├── email.md
│   ├── layout-spacing.md
│   ├── mobile-crossplatform.md
│   ├── mobile-native.md
│   ├── pdf-print.md
│   ├── typography.md
│   ├── web-artifacts.md
│   ├── web-landing.md
│   └── web-react.md
│
├── templates/
│   ├── web/
│   │   ├── landing-page.html
│   │   ├── artifact-react.jsx
│   │   ├── dashboard.tsx
│   │   └── saas-app.tsx
│   ├── mobile/
│   │   ├── swiftui-app.swift
│   │   ├── react-native-app.tsx
│   │   └── compose-app.kt
│   ├── desktop/
│   │   ├── electron-app.html
│   │   └── tauri-app.html
│   ├── cli/
│   │   ├── node-cli.ts
│   │   ├── python-tui.py
│   │   └── go-tui.go
│   ├── documents/
│   │   ├── react-email.tsx
│   │   ├── react-pdf-invoice.tsx
│   │   └── typst-report.typ
│   └── dataviz/
│       ├── recharts-dashboard.tsx
│       ├── nivo-cards.tsx
│       └── d3-editorial.html
│
├── scripts/
│   ├── gen-domain-map.py
│   ├── gen-evals.py
│   └── validate-skill.sh
│
├── evals/
│   └── evals.json
│
└── .planning/
    ├── PROJECT.md
    ├── ROADMAP.md
    ├── STATE.md
    └── config.json
```
