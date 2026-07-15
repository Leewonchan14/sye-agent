
# Hero enrichment — when, what, and how much

This file is loaded after the macrostructure pick (Step 3 in the design flow), when you reach Step 4: "Decide on hero enrichment." It tells you whether to enrich the hero with media at all, and if so, which archetype and how to build it.

**The promise.** Enrichment is an option, not a default. A typographic-only hero is *always* an acceptable answer. Visual enrichment — demo video, illustration, mockup, animated loop, abstract background, photography — has to *earn its place*. If the hero can be deleted of its enrichment and still works, the enrichment earned its place. If the hero collapses without the enrichment, you propped weak typography on a crutch.

**The bar.** Better nothing than bad something. A page that ships a quiet, well-set typographic hero is always better than a page that ships a stock illustration, a Lottie checkmark, an aurora-blob background, or a generic centred demo video block.

---

## Image-need detection — does this brief need imagery at all?

Before picking an enrichment tier, decide whether the brief actually wants imagery. The default is **typography-only**. Match the brief against this table; act on the *first* row that fires:

| Brief signal (any of these words / intents) | Image strategy |
| --- | --- |
| e-commerce, shop, store, product catalogue, brand, fashion, lookbook | Real product photos required — placeholder until user provides |
| photography, portfolio, gallery, artist | Imagery *is* the page — placeholder until user provides |
| food, restaurant, menu, dish, coffee, wine, recipe | Hero photo + product crops — placeholder until user provides |
| team, staff, "about us", portraits, hiring, careers | Portrait crops — placeholder until user provides |
| travel, hotel, destination, real estate, listing, property | Cover photo + tile photos — placeholder until user provides |
| news, blog, magazine, journal, publication | Feature image per post — placeholder until user provides |
| SaaS landing, manifesto, agency, studio, atmospheric, slow-and-editorial | **Kit-led.** Use Hallmark imagery kit (washes, transparent abstracts, ornaments) — see [`assets.md` § Placeholder strategy](assets.md) and [`imagery-kit.md`](imagery-kit.md). |
| API, docs, changelog, CLI, library, dev-tool, SDK, package | **No imagery.** Typography-only. Code blocks if needed. |
| editorial, essay, letter, foundry, type-specimen, broadside | **No imagery.** Display typography is the design. |
| (all other / vague / unspecified) | **Default: typography-only.** When in doubt, no images. |

Rules:

- When the user has attached an image asset (or `.hallmark/preflight.json` cached one), use it. Never overwrite with a placeholder.
- When the brief is genuinely ambiguous between a "needs photos" row and a "no imagery" row, ask one short question: *"Will you have product photos, or should I leave swappable placeholders?"*
- A placeholder must look like a placeholder, not like a confident decision. The skill refuses to invent stock photos as if they were the final design.
- Imagery rows above don't override genre overlays. Modern-minimal genre still suppresses decorative kit imagery (gate in `imagery-kit.md` anti-patterns).

The hierarchy below picks the tier *after* this gate decides imagery is needed at all. Skipping this gate is what produces "blob illustration on every page" outputs — exactly the AI-default Hallmark refuses.

---

## The enrichment hierarchy

Reach for the highest tier the brief lets you ship in the time you have. Skipping tiers is the new tell.

| Tier | What | When |
| --- | --- | --- |
| **0 · Typography only** | No enrichment. Display, lede, optional CTA. | Always acceptable. The strongest fail-state. |
| **A · Custom-built CSS art** | Pure-CSS shapes, gradients, clip-paths, no asset, zero dependency. | Geometric shapes, gradient compositions, glyph-style decoration. |
| **B · Hand-built SVG** | Designed in Figma, optimised, animated declaratively. | Illustrations more complex than CSS handles cleanly — a loaf, a mascot, a workflow diagram. |
| **C · Generated illustration** | Nanobanana / Recraft V4 / Midjourney, with provenance + post-processing. | Characters or specific scenes that hand-build can't economically reach. Always post-processed. |
| **D · Library illustration** | Storyset / Humaaans / unDraw, customised with brand colours. | When budget and timeline force a shortcut — and even then, never unmodified. |
| **E · Lottie animation** | LAST RESORT. Only when complex character motion can't be hand-built. | Articulated figures, multi-frame mascot loops. Never for "spinning logo" or "checkmark draw" — those are CSS. |

**The discipline.** If you can do it in tier A, do it in tier A. If A can't reach it, try B. Only drop to C when characters demand it. Only D when the brief is explicit about "fast and cheap". Only E when E is genuinely the only option. Reaching for E because it's familiar — and many AI tools do — is the signature of a templated page.

See [`custom-craft.md`](custom-craft.md) for *how* to build at tiers A and B. See [`assets.md`](assets.md) for the catalogue of sources at tiers C, D, and E.

---

## Eyeball or ask — the decision protocol

Two paths to picking enrichment:

```
If the brief contains explicit visual cues, pick from this map:

  • "demo", "show how it works", "product tour"           -> E1 / E2 demo video
  • "platform", "tool", "infra", "dashboard", "developer" -> E3 / E4 mockup
  • "shop", "store", "menu", "products", "items"          -> E8 photography (or F6 product grid)
  • "bakery", "kitchen", "café", "atelier" + craft brief  -> E5 custom illustration (Tier B SVG)
  • "agency", "studio", "portfolio"                       -> E8 photography or no enrichment
  • "manifesto", "essay", "book", "letter"                -> no enrichment (typography only)
  • Coral theme picked                                    -> no enrichment (the theme IS restraint)

Else if the brief is genuinely ambiguous, ask one question:
  "Want me to add a demo video, an illustration, or keep it
   typography-only? I default to typography-only because it's
   the strongest fail-state."

Else default to no enrichment. State the inference in one sentence
in your reply, alongside the macrostructure inference.
```

When in doubt: don't enrich. The hero will be fine. Most great landing pages are typographic.

---

## Eight enrichment archetypes

Each archetype has a one-line definition, "use when", "avoid when", a short code sketch, and 2–3 within-archetype variation knobs (consistent with [`component-cookbook.md`](component-cookbook.md)).

### E1 · Demo Video — Clipped-by-viewport-edge

A display headline left, a demo video right, and the rightmost ~10–20 % of the video extending past the viewport so it's intentionally cut off. The clip *is* the design — it implies "there's more product than fits on this screen". Pioneered by Linear; refined by Vercel, Resend, Cursor.

*Use when:* the brief is a SaaS / dev tool / dashboard / platform and you have real footage of the product.
*Avoid when:* you don't have real footage. A clipped-edge video of a stock-footage city skyline reads as filler.

**Knobs:**
- Clip side (right · left · both)
- Aspect ratio (16/10 · 16/9 · 4/3)
- Frame treatment (hairline 1 px frame · browser chrome · none)

**Example.** Tracejam (SaaS observability — see [`site/_tests/05-tracejam-saas/`](../../../site/_tests/05-tracejam-saas/)). Display headline left ("Distributed tracing that explains itself."); hand-built CSS-art trace waterfall right, tilted -0.4°, extending 12 vw past the viewport's right edge. Aspect 16/10. Hairline frame. **Not a real video** — the mockup is custom-built CSS at Tier A (rectangles on a percentage grid simulating a flame chart). Mobile (< 60 rem): drop the clip, stack vertically.

```html
<section class="hero hero--clipped">
  <div class="hero__copy">
    <h1>Plan, build, ship.</h1>
    <p>The project tracker your engineering team won't ignore.</p>
    <a class="btn" href="/signup">Try it free</a>
  </div>
  <figure class="hero__media">
    <video autoplay muted loop playsinline preload="metadata"
           poster="/hero-poster.webp" fetchpriority="high"
           aria-label="Tour of the dashboard interface">
      <source src="/hero.av1.mp4"  type='video/mp4; codecs="av01.0.05M.08"'>
      <source src="/hero.vp9.webm" type="video/webm">
      <source src="/hero.h264.mp4" type="video/mp4">
    </video>
  </figure>
</section>
```

```css
.hero--clipped {
  display: grid;
  grid-template-columns: minmax(20rem, 1fr) 1.4fr;
  gap: var(--space-2xl);
  align-items: center;
  overflow: visible;        /* let the media spill past the page edge */
}
.hero__media {
  width: calc(100% + 12vw); /* the 12 % of viewport that sits beyond the right edge */
  aspect-ratio: 16 / 10;
  border-radius: 12px;
  border: var(--rule-hair) solid var(--color-rule);
  overflow: hidden;
}
.hero__media video { width: 100%; height: 100%; object-fit: cover; }

@media (max-width: 60rem) {
  .hero--clipped { grid-template-columns: 1fr; }
  .hero__media { width: 100%; }    /* don't try to clip on mobile — reads as broken */
}

@media (prefers-reduced-motion: reduce) {
  .hero__media video { display: none; }
  .hero__media { background: url('/hero-poster.webp') center/cover; }
}
```

**Critical:** never `loading="lazy"` on the hero video — that kills LCP. Use `preload="metadata"` and `fetchpriority="high"`. Always include a `poster=""` and a `<track kind="captions">` for accessibility.

### E2 · Demo Video — Full-bleed muted loop with ghost overlay

Video fills the fold, ghost-tinted via `mix-blend-mode: multiply` over a paper-coloured overlay so the type stays readable. The video is wallpaper, not subject.

*Use when:* the product's *feel* is the message (mood, tactility, atmosphere).
*Avoid when:* the product needs to be *seen* clearly — use E1 or E3 instead.

**Knobs:**
- Ghost opacity (0.3 / 0.5 / 0.7)
- Text alignment (left-bias / centred)
- Pause behaviour (always-loop · pause-on-hover · pause-when-out-of-viewport)

**Example.** A small fashion brand's spring lookbook. 8-second muted loop of fabric draping in a studio. `mix-blend-mode: multiply` over a 0.5-opacity warm-cream overlay so the italic display headline ("Spring · 2026 · Lookbook 04") reads cleanly over the moving footage. Pauses on hover so the user can read the lede without distraction. Caption track (VTT) describes the footage for accessibility.

### E3 · Mock App Screenshot — Browser-framed split

Display headline left, a browser-frame mockup right, the mockup window slightly tilted (1–3°) for life. Frames are from [Browserframe](https://browserframe.com) or hand-built (a 1-px hairline + three macOS dots).

*Use when:* you're selling a web app and you have a clean, well-lit screenshot.
*Avoid when:* the screenshot is busy or blurry — the frame draws attention to the mess.

**Knobs:**
- Frame style (browser chrome · macOS toolbar · minimal hairline · none)
- Tilt angle (0° · 1.5° · 3°)
- Screenshot count (1 · stack-of-3 · orbit-of-3)

**Example.** A Linear-style SaaS landing for a project tracker. Headline left ("Plan, build, ship."), browser-frame screenshot of the kanban view right, tilted 1.5° clockwise. Three numbered annotations (1 · assigns automatically · 2 · real-time presence · 3 · keyboard-first), each with a small numbered pin and a margin-aligned caption — never arrows-and-labels. Single screenshot, not a stack — fewer assets to load, sharper read.

### E4 · Mock App Screenshot — Floating no-frame

Same composition as E3 but without browser chrome — the screenshot floats with a soft shadow and 12 px corner radius. Cleaner; demands a higher-quality screenshot since the chrome isn't there to forgive.

*Use when:* the screenshot itself is beautiful enough to stand naked.
*Avoid when:* the product needs the "this is a real web app" cue from the chrome.

**Knobs:**
- Shadow depth (subtle / medium / dramatic)
- Corner radius (0 · 8 px · 16 px)
- Background reveal (gradient / solid / none)

**Example.** A code-formatting CLI marketing page. Headline left ("Format anything, in eight lines."), a single floating screenshot right showing `before` / `after` code side by side. 12 px corner radius, a soft 24 px shadow at -10 px offset, sitting on a barely-tinted gradient surface. **No browser chrome** — the screenshot itself is composed and beautiful enough to stand naked. Use this when the screenshot is unusually high-quality; otherwise switch to E3 (the chrome forgives messier captures).

### E5 · Custom Illustration Centerpiece

A hand-built SVG (the default, Tier B) or a generated raster (Tier C, when characters demand it) sitting on the hero as a single illustrative element — the bakery loaf, the studio's mascot, the diagram of how the workflow flows.

*Use when:* the brand has a story or a thing-it-makes that benefits from being drawn.
*Avoid when:* the brand is "modern professional team" generic — illustrating that is the new template.

**Knobs:**
- Build method (Tier A pure-CSS / Tier B hand-SVG / Tier C generated / Tier D library)
- Animation (none · loop · scroll-linked)
- Scale (small accent · dominant)

**Example.** Maple Street Bread (bakery — see [`site/_tests/03-maple-bakery/`](../../../site/_tests/03-maple-bakery/)). Letter-style hero copy left ("Saturday, 6:14 a.m. The dough went in at midnight."), 60-line hand-built SVG loaf right, 3 paths (body, shade, score-marks). Animated with `@property --rise` for a subtle 4 px breathing-loop over 6 s, alternating; the score-marks draw themselves on first paint via `stroke-dasharray`. Tier B, dominant scale, animation: loop. Reduced-motion fallback is a static keyframe.

For *how* to build a hand-drawn loaf in 60 lines of SVG and animate its breath with `@property`, see [`custom-craft.md`](custom-craft.md) — there's a full bakery worked example, plus four more recipes (workflow diagram, mascot, architectural diagram, botanical accent).

### E6 · Animated Loop — pure CSS / SVG / Motion

A small custom-built loop — an orbiting dot, a breathing rectangle, an animated gradient stop, a type-mask reveal. The point is *small*, custom, and looped *only when reduced-motion is off*.

*Use when:* the page is otherwise still and one small animated element gives it life.
*Avoid when:* the page already has movement — adding more reads as anxious.

**Knobs:**
- Medium (CSS keyframes · SVG SMIL/CSS · Motion)
- Placement (margin · inline-with-headline · corner-accent)
- Loop duration (≤ 4s — anything longer drags)

**Example.** A collaborative whiteboard app. A 2-second pure-CSS loop next to the headline: a single dot orbiting a slow ellipse, suggesting "real-time collaboration" without a Lottie. Built with `@property --angle` interpolating 0deg -> 360deg on a `transform: rotate()`. Margin-placed, ~64 × 64 px, accent colour at low chroma. **Not a Lottie** — pure CSS keeps the bundle at zero bytes and respects reduced-motion gracefully (animation: none on the media query).

### E7 · Abstract Background — subtle gradient + grain

A two-colour CSS gradient at low chroma, overlaid with SVG `<feTurbulence>` grain at < 0.1 opacity. *Not* aurora; *not* purple-to-cyan mesh; *not* floating orbs. The point is *texture you can barely see* — paper-quality, not decoration.

*Use when:* the page would feel synthetic with a flat surface.
*Avoid when:* the theme already has a paper feel (Specimen, Atelier, Riso). Doubling the grain is muddy.

**Knobs:**
- Gradient direction (45° / 135° / radial)
- Grain amount (off · subtle · textured)
- Animation (none · slow drift · scroll-linked parallax)

**Example.** A small podcast site (when the host wants more visual heat than Tide's typography-only quote). Two-stop CSS gradient at 135° (warm-cream -> barely-orange, both at < 0.04 chroma) over the *hero only* — never page-wide. SVG `<feTurbulence>` grain overlay at 0.06 opacity, `mix-blend-mode: multiply`. No animation. Resists every aurora-blob temptation.

```html
<section class="hero hero--bg">
  <div class="hero__bg" aria-hidden="true">
    <svg width="0" height="0" style="position: absolute;">
      <filter id="grain"><feTurbulence baseFrequency="0.9" numOctaves="2"/></filter>
    </svg>
  </div>
  <div class="hero__copy"> ... </div>
</section>
```
```css
.hero { position: relative; isolation: isolate; }
.hero__bg {
  position: absolute; inset: 0; z-index: -1;
  background:
    linear-gradient(135deg,
      color-mix(in oklch, var(--color-paper) 100%, var(--color-accent) 4%),
      color-mix(in oklch, var(--color-paper) 100%, var(--color-paper-2) 50%));
}
.hero__bg::after {
  content: ""; position: absolute; inset: 0;
  filter: url(#grain);
  opacity: 0.06;
  mix-blend-mode: multiply;
  pointer-events: none;
}
```

### E8 · Hero Photography — single tightly-cropped image

Existing H6 archetype in the cookbook. Cross-referenced here for completeness. See [`component-cookbook.md`](component-cookbook.md) for variation knobs.

**Example.** A small Lisbon café. One tightly-cropped photograph of the espresso machine at dawn, 4/3 ratio, no full-bleed. Caption sits margin-aligned at lower-left in mono small-caps ("Plate 04 · 6:42 a.m."). The photograph is desaturated 8 % from the source to harmonise with the page's warm-paper tone. Always pair photography with a tone-matched typography pairing (see [`typography.md`](typography.md)) — a luxury-tone photo on a brutalist page jars.

---

## Hero shape polish — patterns beyond enrichment

The eight enrichment archetypes above (E1–E8) decide *what sits next to the headline*. The four polish patterns below decide *how the headline itself sits* — they affect layout, type, motion, not decoration on top. They are admissible on top of any hero macrostructure (Marquee Hero, Stat-Led, Quote-Led, Letter, Photographic, Clipped). Pick one polish pattern when the hero feels shape-flat — colour-only, symmetric, predictable.

You can ship a hero with one polish pattern *and* one enrichment archetype, but never two polish patterns at once. The hero is a high-stakes surface; one structural choice carries it.

### HP1 · Vertical-rail title

The wordmark or a pull-label runs *vertically* alongside the centred body. CSS: `writing-mode: vertical-rl; text-orientation: mixed;` on the rail; the body sits in normal flow beside it. Reads as studio · atelier · editorial — Japanese-print rhythm, hand-set page furniture.

*Use when:* the hero is otherwise centred or marquee-shaped and the page wants a structural anchor that isn't a rule or a numeral.
*Avoid when:* the body title is itself big and centred — vertical rail beside huge horizontal display reads as competing axes; pick one direction.

```html
<header class="hero hero--rail">
  <p class="hero__rail" aria-hidden="true">STUDIO · 2026 · WORK · LETTERS</p>
  <div class="hero__body">
    <h1 class="hero__display">A working archive.</h1>
    <p class="hero__lede">Twelve years. Selected projects, in their own time.</p>
```
