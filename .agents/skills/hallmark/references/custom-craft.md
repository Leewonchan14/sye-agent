
# Custom craft — how to hand-build hero artwork

This file is loaded only when an enrichment archetype requires construction (Tier A or B in [`hero-enrichment.md`](hero-enrichment.md)). It tells you *which technique* to reach for at *which complexity tier* — and what each looks like done well.

**The principle.** Custom-built artwork is the design. Library-picked artwork is a shortcut, and a good audience reads it as one. The skill's job is to make custom-build the path of least resistance — by knowing when CSS alone suffices, when SVG is right, when JS-driven animation earns its bundle cost, and when (rarely) Three.js is justified.

The 2026 canon is set by Lynn Fisher (*A Single Div*), Diana Smith (*Pure CSS Francine* / *Lace*), Rauno Freiberg, Paco Coursey, Jhey Tompkins, and Adam Argyle. The thread: constraint-driven, hand-crafted, performance-respecting, accessibility-embedded. Use the platform; don't fight it.

---

## Tier A · Pure CSS art

**When.** Geometric forms, gradient compositions, glyph-style decoration. Bars, dots, badges, icons, simple loaves, sliced spheres, abstract logos. Anything that's *shapes plus colour*.

**Effort:** high (mastering `clip-path` + `conic-gradient` takes practice).
**Payoff:** very high (zero bytes, browser-native, infinitely scalable).
**Bundle cost:** zero.

### The CSS-art toolkit (2026)

| Feature | Use for | Browser support |
| --- | --- | --- |
| `clip-path: polygon(…)` | Multi-sided shapes (chevrons, hexagons, custom blobs) | 96 %+ |
| `clip-path: path("M …")` | Curved hand-drawn outlines from an SVG path | 88 %+ (use feature query for fallback) |
| `conic-gradient()` | Pie segments, radial dividers, mandalas, rotating colour wheels | 96 %+ |
| `radial-gradient()` | Spheres, glow points, sun-burst centres | 100 % |
| `linear-gradient()` (multi-stop) | Composite shapes via stacked stops | 100 % |
| `mask-image: url(…)` | Layered transparency, morphing shapes, text-clip effects | 95 %+ |
| `mix-blend-mode` | Compositional depth (multiply, overlay, screen) | 95 %+ |
| `filter` (drop-shadow, blur, hue-rotate) | Soft shadows on irregular shapes (uses the alpha channel) | 100 % |
| `@property` | Smoothly-interpolated custom properties (colour, length, angle) | 88 %+ |
| `animation-timeline: scroll() / view()` | Declarative scroll-linked motion, hardware-composited | Baseline 2025 (88 %) |

### A worked example — the bakery loaf as a single div

```html
<div class="loaf" aria-label="A loaf of bread"></div>
```

```css
@property --rise {
  syntax: "<length>";
  initial-value: 0px;
  inherits: false;
}

.loaf {
  width: 12rem;
  height: 7rem;
  background:
    /* crust ridges */
    radial-gradient(ellipse at 30% 70%, transparent 1.2rem, var(--color-ink-2) 1.21rem 1.3rem, transparent 1.31rem),
    radial-gradient(ellipse at 50% 70%, transparent 1.2rem, var(--color-ink-2) 1.21rem 1.3rem, transparent 1.31rem),
    radial-gradient(ellipse at 70% 70%, transparent 1.2rem, var(--color-ink-2) 1.21rem 1.3rem, transparent 1.31rem),
    /* loaf body */
    linear-gradient(180deg, oklch(78% 0.12 60), oklch(64% 0.16 50));
  border-radius: 50% 50% 14% 14% / 70% 70% 30% 30%;
  transform: translateY(var(--rise));
  animation: rise 6s ease-in-out infinite alternate;
  box-shadow: 0 1.2rem 1.5rem -0.8rem oklch(20% 0.02 60 / 0.18);
}

@keyframes rise {
  to { --rise: -4px; }   /* the breath: 4px over 6s, the loaf is alive */
}

@media (prefers-reduced-motion: reduce) {
  .loaf { animation: none; --rise: 0px; }
}
```

That's a hand-built bakery centerpiece in about 25 lines, no asset, animated, accessible. The next bakery brief Hallmark touches gets a *different* loaf because the variation knobs change (rise distance, loaf curvature, crust-ridge spacing, colour stop).

### Anti-patterns of CSS art

- **Recalculating `clip-path` on every scroll.** Tanks framerate. Animate `transform` instead, or use `animation-timeline` (which composites off-thread).
- **Over-nested wrapper divs.** A pure-CSS illustration should fit in one to three elements. Eight nested wrappers reads as "I gave up structuring this".
- **No reduced-motion fallback.** Every animation must have a `@media (prefers-reduced-motion: reduce)` block.
- **Random gradient noise.** If the gradient looks generated rather than designed, redo it. Three stops max for any single gradient layer.

---

## Tier B · Hand-built SVG illustration

**When.** Complex illustrations CSS can't express cleanly — characters, articulated figures, organic curves, multi-element scenes. The bakery's full storefront, the studio mascot, the workflow diagram with seven labelled paths.

**Effort:** medium (designing in Figma + cleaning the export).
**Payoff:** very high (scales infinitely, compresses to < 10 KB, animatable).
**Bundle cost:** the file size of the SVG — typically 4–15 KB inline.

### Pipeline

1. **Design in Figma.** Use a component system (constraints, variants). Keep paths as paths — don't rasterise. Name layers; the export honours them.
2. **Export as SVG.** Figma's export is decent. Set "Outline strokes" only if you need stroke-as-fill animation; otherwise keep them strokes.
3. **Run through [SVGOMG](https://jakearchibald.github.io/svgomg/)** — removes Figma metadata, unnecessary `<defs>`, redundant transforms. 30–60 % size reduction is typical.
4. **Inline the result in HTML** for animation, or save as `static.svg` and reference via `<img>` or CSS `background-image` for caching.
5. **Animate declaratively** — CSS keyframes on `<path d="">` (Chrome, Edge, Safari support the `d` property), `@property`-driven attribute interpolation, or [Motion](https://motion.dev) for orchestrated sequences.

### A hand-built SVG with declarative animation

```html
<svg viewBox="0 0 200 100" class="loaf-svg" aria-label="A loaf of bread">
  <path class="loaf-body" d="M 20 70 Q 100 10 180 70 L 180 90 L 20 90 Z" />
  <path class="loaf-score" d="M 60 50 L 90 30 M 100 45 L 130 25 M 140 50 L 165 35" />
</svg>
```

```css
@property --bake {
  syntax: "<percentage>";
  initial-value: 0%;
  inherits: false;
}

.loaf-body {
  fill: oklch(72% 0.14 50);
  filter: drop-shadow(0 4px 8px oklch(20% 0.02 60 / 0.16));
  transform-origin: 100px 90px;
  animation: bake 6s ease-in-out infinite alternate;
}

.loaf-score {
  stroke: oklch(38% 0.1 35);
  stroke-width: 2;
  stroke-linecap: round;
  fill: none;
  stroke-dasharray: 0 200;
  animation: score 1.6s 0.8s var(--ease-out) forwards;
}

@keyframes bake  { to { transform: scaleY(calc(1 + var(--bake) * 0.005)); --bake: 1%; } }
@keyframes score { to { stroke-dasharray: 200 200; } }

@media (prefers-reduced-motion: reduce) {
  .loaf-body, .loaf-score { animation: none; }
  .loaf-score { stroke-dasharray: 200 200; }
}
```

The breath comes from `@property --bake` interpolating a percentage; the score-marks draw themselves once on load via `stroke-dasharray`. No JS. 18 lines of CSS. Reduced-motion-safe.

### Animation choices for SVG in 2026

| Method | When | Verdict |
| --- | --- | --- |
| **CSS keyframes on `<path d>`** | Path-morphing where shapes have matching anchor counts | Use this. Composable with the rest of CSS, GPU-friendly. |
| **`@property` + animated CSS variables** | Smoothly interpolated colour, length, angle, percentage | Use this. Declarative, predictable. |
| **CSS keyframes on `transform` / `opacity`** | Position, rotation, fade | Always. Hardware-accelerated, no layout thrash. |
| **`stroke-dasharray` draw-on** | Hand-drawn line illustrations that build themselves | Yes. Cheap and effective. |
| **SMIL `<animate>`** | Legacy SVG-only attribute animation | Acceptable in 2026 but deprioritised — CSS is composable, SMIL isn't. Use only if CSS can't express it. |
| **JS via Motion / GSAP** | Multi-element orchestrated entrances, scroll-scrubbing, complex timelines | Use when CSS isn't enough — see Tier C below. |

### Anti-patterns of hand-built SVG

- **Shipping the raw Figma export.** Always run SVGOMG. Untouched exports carry hundreds of bytes of metadata, unused `<defs>`, doubled transforms.
- **A 300-KB SVG.** Anything over 30 KB is suspicious. Most well-built illustrations sit at 4–15 KB. If yours is 100 KB+, you have hidden raster embeds or thousands of unnecessary path commands.
- **`viewBox` cruft.** A `viewBox="0 0 24 24"` for an icon, or `viewBox="0 0 1920 1080"` for a hero illustration. Match the box to the design's bounds, no padding, no extra space.
- **Animation with linear easing on everything.** Add ease-out (or a cubic-bezier specified to two decimals); the difference is the difference between "moving" and "alive".
- **Path morphing between shapes with mismatched anchor counts.** Browsers will interpolate, but the result jitters. Either match anchor counts, or use `clip-path` instead.

---

## Tier C · Declarative animation (CSS-first, JS-when-needed)

The 2026 declarative animation canon. Use the platform first; reach for JS only when the platform can't express the orchestration.

### CSS keyframes + `@property`

`@property` (Baseline 2024, ~88 % support by 2026) lets you define typed custom properties — `<color>`, `<length>`, `<angle>`, `<number>`, `<percentage>` — that the browser knows how to interpolate smoothly. Without `@property`, animating a custom property steps from start to end with no in-between values.

```css
@property --hue {
  syntax: "<angle>";
  initial-value: 0deg;
  inherits: false;
}

@keyframes spin-hue { to { --hue: 360deg; } }

.gradient-loop {
  background: conic-gradient(from var(--hue),
    oklch(70% 0.2 var(--hue)),
    oklch(70% 0.2 calc(var(--hue) + 120deg)),
    oklch(70% 0.2 calc(var(--hue) + 240deg)));
  animation: spin-hue 8s linear infinite;
}
```

That's a smoothly hue-rotating conic gradient. No JS, no library, GPU-composited.

### Scroll-driven animations

`animation-timeline: scroll()` and `view()` reached **Baseline October 2025** — production-ready in Chromium, Edge, Safari Tech Preview, Firefox behind a flag. The rule: progressive enhancement.

```css
@supports (animation-timeline: view()) {
  .reveal {
    animation: fade-up linear both;
    animation-timeline: view();
    animation-range: entry 0% cover 30%;
  }
}

@keyframes fade-up {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

If the browser supports it, the element animates as it enters the viewport. If not, the element is just there — no JavaScript, no library, no IntersectionObserver. The CSS Scroll-Driven Animations community is the canonical reference: [scroll-driven-animations.style](https://scroll-driven-animations.style/).

### View Transitions API

Production-ready in 2026 (Baseline October 2025 for same-document; Chromium 126+, Safari 18.2+ for cross-document). The Hallmark landing page already uses it for theme transitions:

```js
function applyTheme(theme) {
  const apply = () => { /* mutate the DOM */ };
  if (!reduced && document.startViewTransition) {
    document.startViewTransition(apply);
  } else {
    apply();
  }
}
```

The browser handles the cross-fade. No animation libraries needed for state changes.

### Motion / GSAP / friends — when each earns its bundle

| Library | When | Bundle | Verdict |
| --- | --- | --- | --- |
| **[Motion](https://motion.dev)** (`motion/react`, `motion`) | Orchestrated multi-element entrances in React (variants, `AnimatePresence`, viewport hooks). The default for React heroes in 2026. | 4 KB base + 2 KB React = 6 KB. Web Animations API–backed. | First reach for React. |
| **[GSAP](https://gsap.com)** (free since the Webflow partnership) | Ambitious timelines, scrub-on-scroll, SVG path-morphing across mismatched anchors. Hero sequences with 20+ elements, multi-step narratives. | ~50 KB core; 100 KB+ with plugins (ScrollTrigger, Draggable). | Worth it when timelines are core. Overkill for a fade-in. |
| **AutoAnimate** | Trivial layout transitions in React (a list reflows, an element appears). | 2 KB. | Fine for what it does. |
| **Anime.js v4** | Lightweight stagger, simple animations, vanilla JS. | ~15 KB. | Acceptable; less common than Motion in 2026. |
| **Theatre.js** | Visual editor + code API for ambitious orchestration. Niche but powerful. | Heavy (~80 KB+). | Single-page interactive art only. |

**The decision rule:**

```
Single element, simple motion           -> CSS keyframes / @property
Multiple elements, orchestrated entrance -> Motion (React) or GSAP (vanilla / complex)
Scroll-progress-linked                   -> animation-timeline (CSS) — or GSAP ScrollTrigger if complex
State change between two layouts         -> View Transitions API
A list reflows in React                  -> AutoAnimate
A complex hero narrative with scrubbing   -> GSAP timeline + ScrollTrigger
```

Reaching for Motion for a single fade-in (4 KB for nothing) is the bundle-bloat tell. Reaching for GSAP for a list reflow (50 KB for nothing) is the same tell, louder.

### Anti-patterns of declarative animation

- **Animating `width`, `height`, `top`, `left`, `margin`, or `padding`** (causes layout thrash). Animate `transform` and `opacity` only — they composite on the GPU.
- **Linear easing on UI** (no subtlety; reads as "demo from a tutorial").
- **Bouncy elastic on hero entrances** (`cubic-bezier(0.34, 1.56, …)` and friends) — reserved for genuine physical interactions like drag-release.
- **Importing Motion or GSAP for one fade-in.** 50 KB for what `transition: opacity 400ms var(--ease-out)` does in zero bytes.
- **Scroll-fade-everything.** Every section fading in on scroll. The page never settles. Pick one orchestrated entrance on first load and let the rest *be there*.
- **Reveal animations with no `prefers-reduced-motion` fallback.** Every transform / animation must be guarded.

---

## Tier D · Three.js / WebGL / shaders

**When justified.** The 3D *is* the hero value — a rotating product the user can interact with, an interactive 3D playground, a generative art piece. Examples: Apple's product pages with interactive bottles / iPhones, Bruno Simon's portfolio, Vercel's WebGL hero galleries.

**When not.** A static spinning thing the user can't interact with. A bloom-overdosed shader background that "looks premium". A 5-MB model loaded eagerly on a marketing page.

**Performance budget.**
- < 100 draw calls
- < 2 MB JS + assets total
- < 6 s load time
- 60 fps target on mid-range mobile

**Stack.**
- React Three Fiber (R3F) for React projects — ergonomic, ~30 KB on top of Three.js
- Vanilla [Three.js](https://threejs.org) otherwise (~100–300 KB depending on features)
- Models: glTF 2.0 with Draco compression (20–50 % size reduction)
- Textures: KTX2 / Basis (much smaller than PNG/JPEG)

**Always include a non-WebGL fallback.** If the canvas fails to initialise (no WebGL2, GPU blacklisted, low-power mode), show a static poster image so the page still renders.

### Anti-patterns of Three.js / WebGL

- **Three.js for a stationary product.** No interaction = no justification. Use SVG or a still photograph.
- **Bloom + glow overdose.** Three or four post-processing passes that just make everything blurry. Pick one effect, dial it down to "barely visible".
- **5-MB models loaded eagerly.** Always lazy-load the geometry, show a poster while it streams in.
- **No fallback.** WebGL fails on ~5 % of devices; if the page is unusable for them, you've failed accessibility.
- **Generic procedural-noise shaders.** Looks like every other Three.js demo on the internet. Custom shaders earn their place; off-the-shelf Perlin noise rarely does.

---

## Tier E · Generated stills (Nanobanana / Recraft V4 / Midjourney)
