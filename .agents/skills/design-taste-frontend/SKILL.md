---
name: design-taste-frontend
description: Anti-slop frontend skill for landing pages, portfolios, and redesigns. The agent reads the brief, infers the right design direction, and ships interfaces that do not look templated. Real design systems when applicable, audit-first on redesigns, strict pre-flight check.
---

# tasteskill: Anti-Slop Frontend Skill

> Landing pages, portfolios, and redesigns. Not dashboards, not data tables, not multi-step product UI.
> Every rule below is **contextual**. None of it fires automatically. First read the brief, then pull only what fits.

---

## 0. BRIEF INFERENCE (Read the Room Before Anything Else)

Before touching code or tweaking dials, **infer what the user actually wants**. Most LLM design output is bad because the model jumps to a default aesthetic instead of reading the room.

### 0.A Read these signals first
1. **Page kind** - landing (SaaS / consumer / agency / event), portfolio (dev / designer / creative studio), redesign (preserve vs overhaul), editorial / blog.
2. **Vibe words** the user used - "minimalist", "calm", "Linear-style", "Awwwards", "brutalist", "premium consumer", "Apple-y", "playful", "serious B2B", "editorial", "agency-y", "glassy", "dark tech".
3. **Reference signals** - URLs they linked, screenshots they pasted, products they named, brands they're competing with.
4. **Audience** - B2B procurement panel vs. design-conscious consumer vs. recruiter scanning a portfolio. The audience picks the aesthetic, not your taste.
5. **Brand assets that already exist** - logo, color, type, photography. For redesigns, these are starting material, not optional input (see Section 11).
6. **Quiet constraints** - accessibility-first audiences, public-sector, regulated industries, trust-first commerce, kids' products. These constraints OVERRIDE aesthetic preference.

### 0.B Output a one-line "Design Read" before generating
Before any code, state in one line: **"Reading this as: \<page kind> for \<audience>, with a \<vibe> language, leaning toward \<design system or aesthetic family>."**

Example reads:
- *"Reading this as: B2B SaaS landing for technical buyers, with a Linear-style minimalist language, leaning toward Tailwind utilities + Geist + restrained motion."*
- *"Reading this as: solo designer portfolio for hiring managers, with an editorial / kinetic-type language, leaning toward native CSS + scroll-driven animation + custom typography."*
- *"Reading this as: redesign of a public-sector service site, with a trust-first language, leaning toward GOV.UK Frontend or USWDS."*

### 0.C If the brief is ambiguous, ask one question, do not guess
Ask exactly **one** clarifying question - never a multi-question dump - and only when the design read genuinely diverges. Example: *"Should this feel closer to Linear-clean or Awwwards-experimental?"*

If you can confidently infer from context, **do not ask**. Just declare the design read and proceed.

### 0.D Anti-Default Discipline
Do not default to: AI-purple gradients, centered hero over dark mesh, three equal feature cards, generic glassmorphism on everything, infinite-loop micro-animations everywhere, Inter + slate-900. These are the LLM defaults. Reach past them deliberately based on the design read.

---

## 1. THE THREE DIALS (Core Configuration)

After the design read, set three dials. Every layout, motion, and density decision below is gated by these.

* **`DESIGN_VARIANCE: 8`** - 1 = Perfect Symmetry, 10 = Artsy Chaos
* **`MOTION_INTENSITY: 6`** - 1 = Static, 10 = Cinematic / Physics
* **`VISUAL_DENSITY: 4`** - 1 = Art Gallery / Airy, 10 = Cockpit / Packed Data

**Baseline:** `8 / 6 / 4`. Use these unless the design read overrides them. Do not ask the user to edit this file - overrides happen conversationally.

### 1.A Dial Inference (design read → dial values)
| Signal | VARIANCE | MOTION | DENSITY |
|---|---|---|---|
| "minimalist / clean / calm / editorial / Linear-style" | 5-6 | 3-4 | 2-3 |
| "premium consumer / Apple-y / luxury / brand" | 7-8 | 5-7 | 3-4 |
| "playful / wild / Dribbble / Awwwards / experimental / agency" | 9-10 | 8-10 | 3-4 |
| "landing page / portfolio / marketing site (default)" | 7-9 | 6-8 | 3-5 |
| "trust-first / public-sector / regulated / accessibility-critical" | 3-4 | 2-3 | 4-5 |
| "redesign - preserve" | match existing | +1 | match existing |
| "redesign - overhaul" | +2 | +2 | match existing |

### 1.B Use-Case Presets
| Use case | VARIANCE | MOTION | DENSITY |
|---|---|---|---|
| Landing (SaaS, mainstream) | 7 | 6 | 4 |
| Landing (Agency / creative) | 9 | 8 | 3 |
| Landing (Premium consumer) | 7 | 6 | 3 |
| Portfolio (Designer / studio) | 8 | 7 | 3 |
| Portfolio (Developer) | 6 | 5 | 4 |
| Editorial / Blog | 6 | 4 | 3 |
| Public-sector service | 3 | 2 | 5 |
| Redesign - preserve | match | match+1 | match |
| Redesign - overhaul | +2 | +2 | match |

### 1.C How the Dials Drive Output
Use these (or user-overridden values) as global variables. Cross-references throughout this document refer to these exact variable names - never invent aliases like `LAYOUT_VARIANCE` or `ANIM_LEVEL`.

---

## 2. BRIEF → DESIGN SYSTEM MAP

Once you have the design read (Section 0) and dials (Section 1), pick the right foundation. Do not invent CSS for things that have an official package. Do not pretend an aesthetic trend is an official system.

### 2.A When to reach for a real design system (use official packages)
| Brief reads as… | Reach for | Why |
|---|---|---|
| Microsoft / enterprise SaaS / dashboards | `@fluentui/react-components` or `@fluentui/web-components` | Official Fluent UI, Microsoft tokens, accessibility done |
| Google-ish UI, Material-flavored product | `@material/web` + Material 3 tokens | Official, theme-able via Material Theming |
| IBM-style B2B / enterprise analytics | `@carbon/react` + `@carbon/styles` | Official Carbon, mature data-density patterns |
| Shopify app surfaces | `polaris.js` web components / Polaris React | Required for Shopify admin UI |
| Atlassian / Jira-style product | `@atlaskit/*` + `@atlaskit/tokens` | Official Atlassian DS |
| GitHub-style devtool / community page | `@primer/css` or `@primer/react-brand` | Official Primer; Brand variant for marketing |
| Public-sector UK service | `govuk-frontend` | Legally / regulatorily expected |
| US public-sector / trust-first | `uswds` | Same |
| Fast local-business / agency MVP | Bootstrap 5.3 | Boring, fast, works |
| Modern accessible React foundation | `@radix-ui/themes` | Primitives + polished theme |
| Modern SaaS where you own the components | shadcn/ui (`npx shadcn@latest add ...`) | You own the code, easy to customise; never ship default state |
| Tailwind-based modern SaaS / AI marketing | Tailwind v4 utilities + `dark:` variant | Default for indie + small team builds |

**Honesty rule:** if the brief reads as one of the systems above, install and use the **official** package. Do not recreate its CSS by hand. Do not import a system's tokens but then override 90% of them.

**One system per project.** Do not mix Fluent React with Carbon in the same tree. Do not import shadcn/ui components into a Material 3 app.

### 2.B When the brief is an aesthetic, not a system
For these directions, there is **no single official package**. Build with native CSS + Tailwind + a maintained component library. Be honest in code comments about what is borrowed inspiration vs. official material.

| Aesthetic | Honest implementation |
|---|---|
| Glassmorphism / "frosted glass" | `backdrop-filter`, layered borders, highlight overlays. Provide solid-fill fallback for `prefers-reduced-transparency`. |
| Bento (Apple-style tile grids) | CSS Grid with mixed cell sizes. No single library owns this. |
| Brutalism | Native CSS, monospace, raw borders. No library. |
| Editorial / magazine | Serif type, asymmetric grid, generous whitespace. No library. |
| Dark tech / hacker | Mono + accent neon, terminal motifs. No library. |
| Aurora / mesh gradients | SVG or layered radial gradients. No library. |
| Kinetic typography | Native CSS animations, scroll-driven animations, GSAP for hijacks. No library. |
| **Apple Liquid Glass** | Apple documents this for Apple platforms only. **There is no official `liquid-glass.css`.** Web implementations are approximations using `backdrop-filter` + layered borders + highlights. Label clearly as approximation. |

---

## 3. DEFAULT ARCHITECTURE & CONVENTIONS

Unless the design read picks a real design system (Section 2.A), these are the defaults:

### 3.A Stack
* **Framework:** React or Next.js. Default to Server Components (RSC).
  * **RSC SAFETY:** Global state works ONLY in Client Components. In Next.js, wrap providers in a `"use client"` component.
  * **INTERACTIVITY ISOLATION:** Any component using Motion, scroll listeners, or pointer physics MUST be an isolated leaf with `'use client'` at the top. Server Components render static layouts only.
* **Styling:** **Tailwind v4** (default). Tailwind v3 only if the existing project demands it.
  * For v4: do NOT use `tailwindcss` plugin in `postcss.config.js`. Use `@tailwindcss/postcss` or the Vite plugin.
* **Animation:** **Motion** (the library formerly known as Framer Motion). Import from `motion/react` (`import { motion } from "motion/react"`). The `framer-motion` package still works as a legacy alias - prefer `motion/react` in new code.
* **Fonts:** Always use `next/font` (Next.js) or self-host with `@font-face` + `font-display: swap`. Never link Google Fonts via `<link>` in production.

### 3.B State
* Local `useState` / `useReducer` for isolated UI.
* Global state ONLY for deep prop-drilling avoidance - Zustand, Jotai, or React context.
* **NEVER** use `useState` to track continuous values driven by user input (mouse position, scroll progress, pointer physics, magnetic hover). Use Motion's `useMotionValue` / `useTransform` / `useScroll`. `useState` re-renders the React tree on every change and collapses on mobile.

### 3.C Icons
* **Allowed libraries (priority order):** `@phosphor-icons/react`, `hugeicons-react`, `@radix-ui/react-icons`, `@tabler/icons-react`.
* **Discouraged:** `lucide-react`. Acceptable only when the user explicitly asks for it or the project already depends on it.
* **NEVER hand-roll SVG icons.** If a glyph is missing, install a second library or compose from primitives - do not draw icon paths from scratch.
* **One family per project.** Do not mix Phosphor with Lucide in the same component tree.
* **Standardize `strokeWidth` globally** (e.g. `1.5` or `2.0`).

### 3.D Emoji Policy
Discouraged by default in code, markup, and visible text. Replace symbols with icon-library glyphs. **Override:** allow emojis only when the user explicitly asks for a playful / chat-style / social-native vibe - and even then use them sparingly with intent.

### 3.E Responsiveness & Layout Mechanics
* Standardize breakpoints (`sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`).
* Contain page layouts using `max-w-[1400px] mx-auto` or `max-w-7xl`.
* **Viewport Stability:** NEVER use `h-screen` for full-height Hero sections. ALWAYS use `min-h-[100dvh]` to prevent layout jumping on mobile (iOS Safari address bar).
* **Grid over Flex-Math:** NEVER use complex flexbox percentage math (`w-[calc(33%-1rem)]`). ALWAYS use CSS Grid (`grid grid-cols-1 md:grid-cols-3 gap-6`).

### 3.F Dependency Verification (mandatory)
Before importing ANY 3rd-party library, check `package.json`. If the package is missing, output the install command first. **Never** assume a library exists.

---

## 4. DESIGN ENGINEERING DIRECTIVES (Bias Correction)

LLMs default to clichés. Override these defaults proactively. Each rule has a context-aware override path.

### 4.1 Typography
* **Display / Headlines:** Default `text-4xl md:text-6xl tracking-tighter leading-none`.
* **Body / Paragraphs:** Default `text-base text-gray-600 leading-relaxed max-w-[65ch]`.
* **Sans font choice:**
  * **Discouraged as default:** `Inter`. Pick `Geist`, `Outfit`, `Cabinet Grotesk`, `Satoshi`, or a brand-appropriate serif first.
  * **Override:** Inter is acceptable when the user explicitly asks for a neutral / standard / Linear-style feel, or when the brief is a public-sector / accessibility-first site.
* **Pairings to know:** `Geist` + `Geist Mono`, `Satoshi` + `JetBrains Mono`, `Cabinet Grotesk` + `Inter Tight`, `GT America` + `IBM Plex Mono`.

* **SERIF DISCIPLINE (VERY DISCOURAGED AS DEFAULT):**
  * Serif is **very discouraged as the default font for any project.** "It feels creative / premium / editorial" is NOT a reason to reach for serif. The agent's default mental model that "creative brief = serif" is the single most-tested AI tell in production rounds.
  * **Serif is only acceptable when ONE of these is explicitly true:**
    - The brand brief literally names a serif font, OR
    - The aesthetic family is genuinely editorial / luxury / publication / manuscript / heritage / vintage AND you can articulate why this specific serif fits this specific brand
  * For everything else (creative agency, design studio, modern brand, premium consumer, portfolio, lifestyle), **default sans-serif display** (Geist Display, ABC Diatype, Söhne Breit, Cabinet Grotesk Display, Migra Sans, GT Walsheim, Inter Display, PP Neue Montreal).
  * **EMPHASIS RULE (related):** When you want to emphasize a word within a headline, use **italic or bold of the SAME font**. Do NOT inject a random serif word into a sans headline. Mixed-family emphasis is amateur.
  * **Specifically BANNED as defaults:** `Fraunces` and `Instrument_Serif` (the two LLM-favorite display serifs).
  * **ITALIC DESCENDER CLEARANCE (mandatory):** When italic is used in display type and the word contains a descender letter (`y g j p q`), `leading-[1]` or `leading-none` will clip the descender. Use `leading-[1.1]` minimum and add `pb-1` or `mb-1` reserve on the wrapping element.

### 4.2 Color Calibration
* Max 1 accent color. Saturation < 80% by default.
* **THE LILA RULE:** The "AI Purple / Blue glow" aesthetic is discouraged as a default. No automatic purple button glows, no random neon gradients. Use neutral bases (Zinc / Slate / Stone) with high-contrast singular accents (Emerald, Electric Blue, Deep Rose, Burnt Orange, etc.).
* **Override:** if the brand or brief explicitly asks for purple / violet / lila, embrace it. But execute with intent: consistent palette, harmonised neutrals, restrained gradients. Not generic AI gradient slop.
* **One palette per project.** Do not fluctuate between warm and cool grays within the same project.
* **COLOR CONSISTENCY LOCK (mandatory):** Once an accent color is chosen for a page, it is used on the WHOLE page.
* **PREMIUM-CONSUMER PALETTE BAN (mandatory):**
  * For premium-consumer briefs the LLM default is **warm beige/cream + brass/clay/oxblood/ochre + espresso dark text**. Concretely banned hex families as default:
    - Backgrounds: `#f5f1ea`, `#f7f5f1`, `#fbf8f1`, `#efeae0`, `#ece6db`, `#faf7f1`, `#e8dfcb`
    - Accents: `#b08947`, `#b6553a`, `#9a2436`, `#9c6e2a`, `#bc7c3a`, `#7d5621`
  * **Default alternatives (rotate, do not reuse):**
    - **Cold Luxury:** silver-grey + chrome + smoke
    - **Forest:** deep green + bone + amber accent
    - **Black and Tan:** true off-black + warm tan, sharp contrast
    - **Cobalt + Cream:** saturated blue against a single neutral
    - **Terracotta + Slate:** warm rust against cool grey
    - **Olive + Brick + Paper:** muted olive plus brick-red accent
    - **Pure monochrome + single saturated pop**

### 4.3 Layout Diversification
* **ANTI-CENTER BIAS:** Centered Hero / H1 sections are avoided when `DESIGN_VARIANCE > 4`. Force "Split Screen" (50/50), "Left-aligned content / right-aligned asset", "Asymmetric white-space", or scroll-pinned structures.

### 4.4 Materiality, Shadows, Cards
* Use cards ONLY when elevation communicates real hierarchy. Otherwise group with `border-t`, `divide-y`, or negative space.
* **SHAPE CONSISTENCY LOCK (mandatory):** Pick ONE corner-radius scale for the page and stick to it.

### 4.5 Interactive UI States
LLMs default to "static successful state only." Always implement full cycles:
* **Loading:** Skeletal loaders matching the final layout's shape.
* **Empty States:** Beautifully composed; indicate how to populate.
* **Error States:** Clear, inline (forms), or contextual (toasts only for transient).
* **Tactile Feedback:** On `:active`, use `-translate-y-[1px]` or `scale-[0.98]`.
* **BUTTON CONTRAST CHECK (mandatory, a11y):** Verify the button text is readable against the button background. WCAG AA min (4.5:1 for body, 3:1 for large text 18px+).
* **CTA BUTTON WRAP BAN (mandatory):** Button text MUST fit on one line at desktop.
* **NO DUPLICATE CTA INTENT (mandatory):** Two CTAs with the same intent on one page is a Pre-Flight Fail. One label per intent.
* **FORM CONTRAST CHECK (mandatory, a11y):** Form inputs, placeholder text, focus rings, helper text, and error text all pass WCAG AA contrast.

### 4.6 Data & Form Patterns
* Label ABOVE input. Helper text optional but present in markup. Error text BELOW input.
* No placeholder-as-label. Ever.

### 4.7 Layout Discipline (Hard Rules)
* **Hero MUST fit in the initial viewport.** Headline max 2 lines on desktop, subtext max **20 words** AND max 3-4 lines, CTAs visible without scroll.
* **Hero font-scale discipline.** Default sensible range: `text-4xl md:text-5xl lg:text-6xl` for most heroes.
* **HERO TOP PADDING CAP (mandatory):** Hero top padding max `pt-24` (~6rem) at desktop.
* **HERO STACK DISCIPLINE (max 4 text elements).** Allowed: eyebrow OR brand strip, headline, subtext, CTAs.
* **"Used by" / "Trusted by" logo wall belongs UNDER the hero, never inside it.**
* **Navigation MUST render on a single line on desktop.** Height cap: 80px max desktop.
* **Bento grids MUST have rhythm, not one-sided repetition.**
* **BENTO CELL COUNT RULE (mandatory):** N items → N cells. If your grid has an empty cell, reshape.
* **Section-Layout-Repetition Ban.** A landing page with 8 sections must use at least 4 different layout families.
* **ZIGZAG ALTERNATION CAP (mandatory):** Max 2 sections in a row with image+text-split pattern.
* **EYEBROW RESTRAINT (mandatory):** Maximum 1 eyebrow per 3 sections.
* **SPLIT-HEADER BAN (mandatory):** The pattern "left big headline + right small explainer paragraph" as a section header is **banned as default**.
* **Bento Background Diversity (mandatory):** At least 2-3 cells in any multi-cell grid need real visual variation.
* **Mobile collapse must be explicit per section.**

### 4.8 Image & Visual Asset Strategy
**Priority order for visual assets:**
1. **Image-generation tool first.** Use `generate_image` or similar to create section-specific assets.
2. **Real web images second.** Picsum with descriptive seed, or real stock.
3. **Last resort: tell the user.** Leave clearly-labeled placeholder slots.

**Real company logos for social proof.** Use Simple Icons CDN or devicon for real SVG logos.
**Div-based fake screenshots are banned.**
**Hero needs a real visual.** Text + gradient blob is not a hero.

### 4.9 Content Density
* Default content shape per section: short headline (~8 words) + short sub-paragraph (~25 words) + one visual asset OR one CTA.
* Long lists need a different UI component, not a longer list.
* **COPY SELF-AUDIT (mandatory before ship):** Re-read every visible string. Flag grammatically broken strings, unclear referents, AI hallucination, LLM-sounding phrases.
* **Fake-precise numbers are flagged.** Numbers come from real data or are explicitly labeled as mock.
* **One copy register per page.**

### 4.10 Quotes & Testimonials
* Max 3 lines of quote body.
* Attribution: name + role + (optionally) company.
* Use real typographic quotes or none at all.

### 4.11 Page Theme Lock (Light / Dark Mode Consistency)
* The page has ONE theme. Sections do not invert.
* Default behaviour: pick light, dark, or auto (`prefers-color-scheme`) at the page level and lock it.

---

## 5. CONTEXT-AWARE PROACTIVITY

These are tools, not defaults. Use them when the design read calls for them.

* **Liquid Glass / Glassmorphism** - Provide a solid-fill fallback under `prefers-reduced-transparency`.
* **Magnetic Micro-physics** - Motion's `useMotionValue` / `useTransform`. Never `useState`.
* **Perpetual Micro-Interactions** - Apply Spring Physics (`type: "spring", stiffness: 100, damping: 20`).
* **"Motion claimed, motion shown."** If `MOTION_INTENSITY > 4`, the page must actually move.
* **MOTION MUST BE MOTIVATED (mandatory).** Every animation needs a reason.
* **MARQUEE MAX-ONE-PER-PAGE (mandatory).**

### 5.A Sticky-Stack - Canonical Skeleton

```tsx
"use client";
import { useRef, useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useReducedMotion } from "motion/react";

gsap.registerPlugin(ScrollTrigger);

export function StickyStack({ cards }: { cards: React.ReactNode[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce || !ref.current) return;
    const ctx = gsap.context(() => {
      const cardEls = gsap.utils.toArray<HTMLElement>(".stack-card");
      cardEls.forEach((card, i) => {
        if (i === cardEls.length - 1) return;
        ScrollTrigger.create({
          trigger: card,
          start: "top top",
          endTrigger: cardEls[cardEls.length - 1],
          end: "top top",
          pin: true,
          pinSpacing: false,
        });
        gsap.to(card, {
          scale: 0.92, opacity: 0.55, ease: "none",
          scrollTrigger: {
            trigger: cardEls[i + 1],
            start: "top bottom", end: "top top", scrub: true,
          },
        });
      });
    }, ref);
    return () => ctx.revert();
  }, [reduce]);

  return (
    <div ref={ref} className="relative">
      {cards.map((card, i) => (
        <div key={i} className="stack-card sticky top-0 min-h-[100dvh] flex items-center justify-center">{card}</div>
      ))}
    </div>
  );
}
```

### 5.B Horizontal-Pan - Canonical Skeleton

```tsx
"use client";
import { useRef, useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useReducedMotion } from "motion/react";

gsap.registerPlugin(ScrollTrigger);

export function HorizontalPan({ children }: { children: React.ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce || !wrap.current || !track.current) return;
    const ctx = gsap.context(() => {
      const distance = track.current!.scrollWidth - window.innerWidth;
      gsap.to(track.current, {
        x: -distance, ease: "none",
        scrollTrigger: {
          trigger: wrap.current, start: "top top",
          end: () => `+=${distance}`, pin: true, scrub: 1,
          invalidateOnRefresh: true,
        },
      });
    }, wrap);
    return () => ctx.revert();
  }, [reduce]);

  return (
    <section ref={wrap} className="relative overflow-hidden">
      <div ref={track} className="flex h-[100dvh] items-center">{children}</div>
    </section>
  );
}
```

### 5.C Scroll-Reveal Stagger - Canonical Skeleton

```tsx
"use client";
import { motion, useReducedMotion } from "motion/react";

export function RevealStagger({ items }: { items: string[] }) {
  const reduce = useReducedMotion();
  return (
    <ul className="grid gap-6">
      {items.map((item, i) => (
        <motion.li key={item}
          initial={reduce ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
        >{item}</motion.li>
      ))}
    </ul>
  );
}
```

### 5.D Forbidden Animation Patterns
* **`window.addEventListener("scroll", ...)`** is banned.
* **Custom scroll progress calculations using `window.scrollY`** in React state.
* **`requestAnimationFrame` loops that touch React state.**

---

## 6. PERFORMANCE & ACCESSIBILITY GUARDRAILS

### 6.A Hardware Acceleration
* Animate ONLY `transform` and `opacity`.

### 6.B Reduced Motion (mandatory)
* Any motion above `MOTION_INTENSITY > 3` MUST honor `prefers-reduced-motion`.

### 6.C Dark Mode (mandatory for any consumer-facing page)
* Design for **both modes from the start**.

### 6.D Core Web Vitals Targets
* **LCP** < 2.5s. **INP** < 200ms. **CLS** < 0.1.

### 6.E Z-Index Restraint
Document the z-index scale in a project constants file.

---

## 7. DIAL DEFINITIONS (Technical Reference)

### DESIGN_VARIANCE (Level 1-10)
* **1-3 (Predictable):** Symmetrical CSS Grid, equal paddings, centered alignment.
* **4-7 (Offset):** `margin-top: -2rem` overlaps, varied image aspect ratios.
* **8-10 (Asymmetric):** Masonry layouts, CSS Grid with fractional units, massive empty zones.
* **MOBILE OVERRIDE:** For levels 4-10, asymmetric layouts MUST collapse to strict single-column.

### MOTION_INTENSITY (Level 1-10)
* **1-3 (Static):** No automatic animations. CSS `:hover` and `:active` states only.
* **4-7 (Fluid CSS):** `transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1)`.
* **8-10 (Advanced Choreography):** Scroll-triggered reveals, parallax, scroll-driven animation.

### VISUAL_DENSITY (Level 1-10)
* **1-3 (Art Gallery):** Lots of white space. `py-32` to `py-48`.
* **4-7 (Daily App):** Standard web app spacing (`py-16` to `py-24`).
* **8-10 (Cockpit):** Tight paddings. Mandatory: `font-mono` for all numbers.

---

## 8. DARK MODE PROTOCOL

Dual-mode by default. Never assume light-only.
* **Tailwind `dark:` variant** or **CSS variables**.
* Respect `prefers-color-scheme` unless the brand insists.
* Test in both modes before finishing.

---

## 9. AI TELLS (Forbidden Patterns)

### 9.A Visual & CSS
* **NO neon / outer glows** by default. Use inner borders or subtle tinted shadows.
* **NO pure black (`#000000`).** Off-black, zinc-950, or charcoal.
* **NO oversaturated accents.**
* **NO excessive gradient text** for large headers.
* **NO custom mouse cursors.**

### 9.B Typography
* **AVOID Inter as default.**
* **NO oversized H1s** that just scream.
* **Serif constraints:** Serif for editorial / luxury / publication. Not for dashboards.

### 9.C Layout & Spacing
* **NO 3-column equal feature cards.** The generic "three identical cards horizontally" is banned.

### 9.D Content & Data ("Jane Doe" Effect)
* **NO generic names.** "John Doe", "Sarah Chan" -- use creative, realistic names.
* **NO generic avatars.** No SVG "egg" or Lucide user icons.
* **NO fake-perfect numbers.** Avoid `99.99%`, `50%`, `1234567`.
* **NO startup-slop brand names.** "Acme", "Nexus", "SmartFlow", "Cloudly".
* **NO filler verbs.** "Elevate", "Seamless", "Unleash", "Next-Gen", "Revolutionize".

### 9.E External Resources & Components
* **NO hand-rolled SVG icons.** Use Phosphor / HugeIcons / Radix / Tabler.
* **NO div-based fake screenshots.**
* **NO broken Unsplash links.** Use `https://picsum.photos/seed/{descriptive-string}/{w}/{h}`.

### 9.F Production-Test Tells (banned outright)
* **NO version labels in the hero.** `V0.6`, `BETA`, `INVITE-ONLY PREVIEW`.
* **NO section-number eyebrows.** `00 / INDEX`, `001 · Capabilities`.
* **NO `01 / 4`-style pagination on images or bento tiles.**
* **The middle-dot (`·`) is rationed.** Maximum 1 per line in metadata strips.
* **NO decorative colored status dots on every list/nav/badge.**
* **NO em-dash (`—`) as a design element OR anywhere else. See 9.G below.**

### 9.G EM-DASH BAN (the single most-violated Tell)
**Em-dash (`—`) is COMPLETELY banned.** There is no "limited use" allowance.
* **Banned in headlines.** Use a period or a comma.
* **Banned in eyebrows / labels / pills / button text / image captions / nav items.**
* **Banned in body copy.** Restructure the sentence.
* **Banned in quote attribution.** Use a normal hyphen with spaces (` - `).
* **Banned in en-dash form too (`–`) when used as a separator.**
* The ONLY permitted dash characters: regular hyphen `-` and minus sign in math (`-5°C`).

---

## 10. REFERENCE VOCABULARY (Pattern Names the Agent Should Know)

### Hero Paradigms
* Asymmetric Split Hero, Editorial Manifesto Hero, Video / Media Mask Hero, Kinetic-Type Hero, Curtain-Reveal Hero, Scroll-Pinned Hero

### Navigation & Menus
* Mac OS Dock Magnification, Magnetic Button, Gooey Menu, Dynamic Island, Contextual Radial Menu, Floating Speed Dial, Mega Menu Reveal

### Layout & Grids
* Bento Grid, Masonry Layout, Chroma Grid, Split-Screen Scroll, Sticky-Stack Sections

### Cards & Containers
* Parallax Tilt Card, Spotlight Border Card, Glassmorphism Panel, Holographic Foil Card, Tinder Swipe Stack, Morphing Modal

### Scroll Animations
* Sticky Scroll Stack, Horizontal Scroll Hijack, Zoom Parallax, Scroll Progress Path, Liquid Swipe Transition

### Galleries & Media
* Dome Gallery, Coverflow Carousel, Drag-to-Pan Grid, Accordion Image Slider, Hover Image Trail, Glitch Effect Image

### Typography & Text
* Kinetic Marquee, Text Mask Reveal, Text Scramble Effect, Circular Text Path, Gradient Stroke Animation, Kinetic Typography Grid

### Micro-Interactions & Effects
* Particle Explosion Button, Liquid Pull-to-Refresh, Skeleton Shimmer, Directional Hover-Aware Button, Ripple Click Effect, Animated SVG Line Drawing, Mesh Gradient Background, Lens Blur Depth

### Animation Library Choice
* **Motion (`motion/react`)** - default for UI / Bento / state-change motion.
* **GSAP + ScrollTrigger** - for full-page scrolltelling and scroll hijacks.
* **Three.js / WebGL** - for canvas backgrounds and 3D scenes.
* **NEVER mix GSAP / Three.js with Motion in the same component tree.**

---

## 11. REDESIGN PROTOCOL

### 11.A Detect the Mode (first action)
* **Greenfield** - no existing site, or full overhaul approved.
* **Redesign - Preserve** - modernise without breaking the brand.
* **Redesign - Overhaul** - new visual language on top of existing content.

### 11.B Audit Before Touching
Document: Brand tokens, Information architecture, Content blocks, Patterns to preserve, Patterns to retire.

### 11.C Preservation Rules
* Do not change IA unless asked. Keep slugs, anchor IDs, nav labels stable.
* Extract brand colors before applying Section 4.2.
* Preserve copy voice unless asked for a rewrite.

### 11.D Modernisation Levers (priority order)
1. Typography refresh
2. Spacing & rhythm
3. Color recalibration
4. Motion layer
5. Hero & key-section recomposition
6. Full block replacement

---

## 12. THE BLOCK LIBRARY (Contract)

Status: schema defined. Blocks will be added iteratively. See Section 10 for reference vocabulary names. Each block lives at `skills/taste-skill/blocks/<category>/<name>.md` with frontmatter including dial_compatibility, when_to_use, not_for, stack, and code sketch sections.

---

## 13. OUT OF SCOPE

This skill is NOT for: Dashboards / dense product UI / admin panels, Data tables, Multi-step forms / wizards, Code editors, Native mobile, Realtime collab UIs.

---

## 14. FINAL PRE-FLIGHT CHECK

**THIS IS NOT OPTIONAL. Run every box. If any box fails, the output is not done.**

- [ ] **Brief inference** declared (Section 0.B one-liner)?
- [ ] **Dial values** explicit and reasoned from the brief?
- [ ] **Design system** chosen from Section 2 if applicable?
- [ ] **ZERO em-dashes (`—`) anywhere on the page.**
- [ ] **Page Theme Lock**: ONE theme for the whole page.
- [ ] **Color Consistency Lock**: one accent color across all sections.
- [ ] **Shape Consistency Lock**: one corner-radius system.
- [ ] **Button Contrast Check**: WCAG AA 4.5:1.
- [ ] **Hero fits the viewport**: headline <= 2 lines, subtext <= 20 words, CTA visible.
- [ ] **EYEBROW COUNT**: count <= ceil(sectionCount / 3).
- [ ] **Split-Header Ban**: no "left headline + right explainer" pattern.
- [ ] **Zigzag Alternation Cap**: no 3+ consecutive image+text-split sections.
- [ ] **No Duplicate CTA Intent**.
- [ ] **Logo wall = logo only**: no industry labels below logos.
- [ ] **Bento Background Diversity**: at least 2-3 cells with real visual variation.
- [ ] **Copy Self-Audit**: no AI hallucinations in copy.
- [ ] **Motion motivated**: every animation can be justified.
- [ ] **Marquee max-one-per-page**.
- [ ] **Navigation on ONE line** at desktop.
- [ ] **Section-Layout-Repetition** check.
- [ ] **Real images used** - NO div-based fake screenshots.
- [ ] **Content density** sane.
- [ ] **Reduced motion** wrapped for everything > 3.
- [ ] **Dark mode** tokens defined.
- [ ] **Mobile collapse** explicit.
- [ ] **Viewport stability**: `min-h-[100dvh]`.
- [ ] **No AI Tells** from Section 9.
- [ ] **Core Web Vitals** plausibly hit.

---

## APPENDICES

### Appendix A - Install Commands per Design System
```bash
npm install @material/web
npm install @fluentui/react-components
npm install @fluentui/web-components @fluentui/tokens
npm install @carbon/react @carbon/styles
npm install @radix-ui/themes
npx shadcn@latest init
npm install --save @primer/css
npm install @primer/react-brand
npm install govuk-frontend
npm install uswds
npm install bootstrap
```

### Appendix B - Apple Liquid Glass: Honest Web Approximation
There is no `liquid-glass.css` from Apple for normal websites.

```css
.liquid-glass-web-approx {
  position: relative; isolation: isolate; overflow: hidden; border-radius: 999px;
  border: 1px solid rgb(255 255 255 / .32);
  background: linear-gradient(135deg, rgb(255 255 255 / .30), rgb(255 255 255 / .08)), rgb(255 255 255 / .12);
  backdrop-filter: blur(24px) saturate(180%) contrast(1.05);
  -webkit-backdrop-filter: blur(24px) saturate(180%) contrast(1.05);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / .48), inset 0 -1px 0 rgb(255 255 255 / .12), 0 18px 60px rgb(0 0 0 / .18);
}
@media (prefers-reduced-transparency: reduce) {
  .liquid-glass-web-approx { background: rgb(255 255 255 / .96); backdrop-filter: none; }
}
```
