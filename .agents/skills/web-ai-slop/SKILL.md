---
name: web-ai-slop
description: "Filters web output against a multi-discipline checklist of AI default patterns. Use before shipping any design, copy, UI code, infrastructure config, or documentation. Trigger when the user asks for something 'premium' or 'not AI-looking', when you're about to reach for a glowing gradient, bento grid, SaaS empowerment copy, a 3-tier pricing section, a 3-stage CI/CD YAML, or a god component."
---

# Web AI Slop — The Practitioner's Anti-Default Checklist

> [!NOTE]
> **Core Philosophy (Mantra):** Avoid statistical averages. When generating layouts, styles, or logic, do not default to what is typical or "standard"; make deliberate choices tailored to the specific context, users, and constraints.

A trained filter, not a style guide. This skill exists because language models converge on the same small set of "safe" defaults across every web discipline — not because those defaults are good, but because they are the statistical center of the training data. The job of this skill is to name that center precisely so you can deliberately step away from it.

**Rule of application:** Draft your output first. Then run it against the relevant sections below. If you match **2 or more items in any single section**, you have not made a decision — you have defaulted. Discard the draft and make a specific, justified choice for this product, team, and context.

Apply this filter silently. Do not narrate "I'm checking this against my anti-slop list" to the user.

---

## Section 1 — Visual Design (Web Designer / UI Designer perspective)

These are the patterns a designer with 40 years of craft knowledge would immediately identify as machine output.

### 1a. Layout and composition defaults

- **Centered hero, headline + subhead + two pill CTA buttons + browser-mockup screenshot below the fold** — treated as the only possible layout, applied to every product regardless of what that product actually is. This is a starting skeleton, not a decision.
- **Symmetrical 3-column or 6-column feature grids** — every section resolves to three items or six items arranged identically, because three and six feel "balanced" to a model without knowledge of the actual feature set.
- **Full-viewport hero sections with nothing but text, a subheadline, and a button** — 100vh of empty air treated as sophistication.
- **Section → divider → section → divider rhythm with no variation** — every page breathes the same. Real page rhythm varies: compressed detail sections, open breathing sections, dense data sections.
- **Sticky navigation that appears on every page** regardless of whether the page is a one-scroll landing page, a long-form article, or an app view where navigation competes with content.
- **Footer with 4–5 column link columns** containing links that nobody using this specific product would realistically navigate to.
- **Icons for features that don't require icons** — AI models love to put a Lucide or Heroicon next to every feature, even when it doesn't add clarity.
- **Emoji used as icons, or used anywhere in the copy** — no emoji standing in for an icon, and no emoji in headlines, buttons, or body text. Use a real icon.
- **The default Shadcn icon set, unquestioned** — pick an icon library deliberately, or ask the user which style they prefer and choose based on the answer. Don't ship whatever came bundled with the component library.
- **Decorative gradients added by default** — gradients are fine if the user explicitly asks for one. If you use one, keep it subtle and make sure it actually fits the palette, never apply it to the last section of a page (end on a solid color), and don't reach for Shadcn's default button/link gradient presets.

### 1b. Decorative motifs

- **Glowing gradient blob / aurora background** — purple-to-blue or purple-to-pink radial blur behind a hero. The single most common AI default for "modern tech company." Any senior designer who sees this in a brief sighs audibly.
- **Particle network / floating dots with connecting lines** — the visual shorthand for "AI" or "data." If the brief mentions AI, the particle globe or neural-net mesh is the first output — therefore it is the wrong output.
- **Wavy or blob SVG section dividers** — organic curves between sections applied indiscriminately to signal "approachable tech" without any brand reason.
- **Glowing brand-color halos / outer-glow shadows** on cards, buttons, or images — the neon-border trick applied to everything at once.
- **Tiling small dashboard widgets and charts as decorative background wallpaper** — a busy placeholder that stands in for a real product decision. The "particle network" of 2025/26.
- **Isometric 3D illustrations of laptops, rockets, or people-at-desks** as stock hero art when the brief gave no instruction.
- **Abstract geometric low-poly backgrounds** with faint triangular meshes or hexagons used as texture.
- **Floating UI element screenshots positioned at an angle** ("device mockup" shot) as the only form of product visualization considered.

### 1c. Component-level tells

- **Glassmorphism cards** — frosted-glass translucent panels with a soft white border and `backdrop-filter: blur()` applied as default "premium" card style regardless of what the card contains or the brand it represents.
- **Bento grid of icon-in-rounded-square feature cards**, each containing a Lucide or Heroicon and exactly three lines of generic benefit copy ("Fast. Secure. Scalable.").
- **Excessive border-radius on everything** — cards, buttons, inputs, images, all at 16px or higher as a catch-all stand-in for "friendly."
- **Every button a pill shape** (`border-radius: 9999px`) regardless of whether the brand calls for it.
- **Testimonial carousel with stock-photo circular avatar, first name + last initial, and a generic one-line quote** that contains no specific number, outcome, or named feature.
- **Pricing section always 3 tiers, always with the middle one highlighted** by a colored border and the label "Most Popular," regardless of whether that framing serves this product.
- **High-contrast glow/accent shadow buttons** — applying a high-contrast gradient, heavy drop-shadow, or glowing brand-color halo to the primary Call to Action (CTA) button by default as a visual hack, without specific visual hierarchy or brand alignment reason.

### 1d. Quick-scan signal table

Open the site and look at it for 10 seconds before doing anything technical. These are the signals visible without inspecting code.

| Signal | What to look for |
|---|---|
| **The purple/blue gradient** | Many AI tools default to the same blue-to-purple gradient — once you've seen it, you can't unsee it. Usually a radial blur behind the hero. |
| **Glassmorphism everywhere** | Frosted-glass cards with white borders, used as the default "premium" treatment regardless of brand. |
| **Particle networks / neural-net visuals** | Floating dots with connecting lines as generic shorthand for "AI" or "data," with no specific referent to what the product does. |
| **Bento grid of icon cards** | 3 or 6 rounded-square cards, each with a Lucide/Heroicon and 2–3 lines of generic benefit copy. |
| **Inconsistent spacing** | Margins and padding vary between sections, so the page rhythm feels uneven — consistent spacing is one of the clearest signs of considered design, and its absence is a tell. |
| **Weak typographic hierarchy** | Default fonts, awkward line lengths, inconsistent heading sizes, and cramped line spacing all point to type that was never properly set. |
| **Poor contrast** | Light grey text on white, or weak text/background contrast — WCAG sets a 4.5:1 minimum contrast ratio for normal text, and many AI-default palettes don't clear it. |
| **Identical card hover effects everywhere** | Every card lifts or glows the same way on hover, applied uniformly rather than where it adds real affordance. |
| **Excessive sparkle/AI emoji** | ✨ used liberally in headlines and buttons as a visual signal for "AI-powered," now itself a tell. |

**Quick test:** Resize the browser narrower, or open on a phone. AI-generated layouts often break, overlap, or overflow at screen sizes the model was never specifically prompted to handle — real responsive QA across breakpoints is one of the first things skipped.

**Instead:** Pick ONE real visual device — a specific illustration, a diagram of the actual product's data flow, a screenshot of the real interface — render it with restraint, and give it room. A company that ships serious product puts one precise idea per screen, not a collage of AI-default textures.

---

## Section 2 — Color & Typography (Web Designer / UI Designer perspective)

### 2a. Color defaults

- **Purple/violet (#7c3aed-ish) or indigo paired with blue or pink** as the automatic "tech" palette when the brand has given no signal pointing to it.
- **Pure black (#000000) or pure white (#ffffff) backgrounds** instead of a considered near-black or near-white that carries slight warmth, coolness, or character.
- **The "dark mode by default" decision made for aesthetic reasons** — because dark mode photographs well in a demo or feels premium — rather than because the content, context, or user base calls for it.
- **Gradient buttons as the primary CTA style** without any rationale for why this brand would use gradients.
- **Five or more accent colors in a single design system** because "vibrant" was the brief word — real systems are built on restraint; one accent, one functional palette, one semantic palette.
- **Color choices that have no provenance** — the hex values appeared in the response without any explanation of why this product's brand, category, or audience informed them.

### 2b. Typography defaults

- **Inter in weights 400, 600, and 700 only**, with no display typeface for headlines, no serif for body contrast, and no consideration of whether Inter is the right choice for this brand.
- **Letter-spacing untouched at `letter-spacing: 0`** on large display headlines — professional type systems tighten tracking (`letter-spacing: -0.02em` to `-0.05em`) as point size increases. Default tracking on a 72px headline looks like a template.
- **Tailwind's `tracking-wide`/`tracking-wider`/`tracking-tight` utilities applied reflexively, and uppercase text used as a default emphasis style** — only reach for either when there's a specific typographic reason, and don't change the established case treatment of existing text unless the user asked for it.
- **No visual type hierarchy beyond size and weight** — body, muted, and faint text all at the same color value, differentiated only by font-size. Real hierarchies use at least three tonal steps.
- **Line-height not considered per context** — same `line-height: 1.5` on a 12px caption and a 56px headline.
- **All-caps labels on everything** as a substitute for typographic hierarchy thinking.
- **Font-weight 700 ("bold") as the only emphasis tool** in body copy, never italic, never small-caps, never color-based emphasis.

**Instead:** Derive the palette from a concrete source — the product category, a specific competitor you are deliberately differentiating from, or a single brand constraint given by the client. State the hex values and their rationale before using them. State which typeface and why before specifying it.

---

## Section 3 — Copywriting & Content Strategy (Content Developer perspective)
Use this section whenever writing, drafting, or revising prose of any kind for the user. Emails, essays, articles, blog posts, reports, cover letters, social posts, creative writing, or any other text meant to read as naturally written.

### 1. Vocabulary tells ("AI vocabulary")
LLMs overuse a specific, evolving set of words far more than human baseline writing. Wikipedia's guide even breaks them down by era, since usage shifts as models update: early GPT-4-era text favored words like "Additionally," boasts, bolstered, crucial, delve, emphasizing, enduring, garner, intricate/intricacies, interplay, key, landscape, meticulous/meticulously, pivotal, underscore, tapestry, testament, valuable, and vibrant, while GPT-4o-era text shifted toward align with, bolstered, crucial, emphasizing, enhance, enduring, fostering, highlighting, pivotal, showcasing, underscore, and vibrant, and GPT-5-era text leans on emphasizing, enhance, highlighting, and showcasing. Notably, these words tend to co-occur — if you spot one, others are usually nearby, and Grok's output skews toward pseudo-scientific words like causal, empirical, and correlate. Wikipedia + 2
Puffery/marketing-adjacent words to watch: boasts a, vibrant, rich (figurative), profound, enhancing, showcasing, exemplifies, commitment to, natural beauty, nestled, in the heart of, groundbreaking (figurative), renowned, featuring, diverse array. Studocu
### 2. Puffery and inflated importance
AI writing constantly asserts significance rather than demonstrating it. Per multiple sources, this shows up as excessive puffery — telling readers something is important without evidence, and describing ordinary facts as significant, transformative, or part of a "broader movement". A related idiosyncrasy is the "tailing clause" — a present-participle phrase tacked onto the end of a sentence to add vague significance, without actually adding information (e.g., "...reflecting the continued relevance of local traditions"). Logicity + 2
### 3. Editorializing and superficial analysis
The model frequently inserts its own interpretive commentary instead of just presenting facts: superficial or vague analyses and attributions (e.g., "some critics argue"). Wikipedia's talk archives describe this as the AI "sanding down" specific, unusual facts into generic, positive statements — the classic "regression to the mean" behavior of a next-token predictor. Medium
### 4. Weasel wording and vague attribution
AI chatbots tend to attribute opinions or claims to some vague authority — "some critics say," "many believe," "experts note" — without naming anyone specific. Wikipedia
### 5. Sentence-structure tells

Rule of three: AI defaults to triplets when listing anything — adjectives, benefits, takeaways (e.g., "innovative, transformative, and groundbreaking"). Wikipedia's own editors debated this at length and concluded it's a real signal but not damning on its own, since humans use triads too — it's just overused by AI as a way to make thin content "sound comprehensive." Worldcomgroup
Negative parallelism: constructions like "It's not X, it's Y" — "It's not just a product launch, it's a movement." Worldcomgroup
Contrast-reframe statements: overuse of "but" to manufacture false depth where a real contrast doesn't exist.
Sentence-initial conjunctions/transitions: heavy, repeated use of "Additionally," "Moreover," "Furthermore" to open sentences — flagged repeatedly as generic transitional padding that pads word count without adding content. Logicity
Excessive hedging and qualifiers that add no real information.
Structural repetition — identical sentence patterns repeated across paragraphs. Logicity

### 6. Stock phrases and transitions
Frequently flagged filler phrases include: "It's important to note...", "No discussion would be complete without...", "It is worth remembering...", along with overused summary phrases like "In summary," "Overall," and "furthermore". Copy-paste leftovers from chat responses are also a tell: "I hope this helps!", "Of course!", "Let me know if you need anything else." MediumNPR
### 7. Overly formal or template-driven register
Even in casual contexts, AI defaults to letter-template politeness: "I hope this message finds you well," "Thank you for your time and consideration," "I am willing to help in any way." This is jarring in blog posts, emails, or social content that should sound casual.
### 8. Formulaic document/section structure
Wikipedia's editors note a very recognizable overall shape, especially: rigid formulaic structure, especially in sections like "Challenges" or "Future Prospects". One archived discussion describes it precisely: articles will have a "Challenges" section toward the end, beginning with something like "Despite its [positive stuff], [subject] faces challenges..." and ending with either an affirmation of lasting importance or a "call to action" — often a leftover artifact of prompting the AI to generate an outline first. MediumWikipedia
### 9. Formatting tics

Excessive use of boldface, lists, or title case in headings Medium
Overuse of em dashes — more than nonprofessional human writing of the same genre, often in places a human would use a comma, parenthesis, colon, or hyphen, and typically with spaces around them (contrary to standard typographic convention). Some newer chatbot versions (e.g., GPT-5.1) have started suppressing this because it became so notorious. Wikipedia
Use of curly quotes/apostrophes and emojis in headers or lists Medium
Wrong heading hierarchy (starting a document at heading level 1 instead of 2) — a technical wikitext artifact but analogous to malformed Markdown heading jumps elsewhere.

#### 10. Leftover AI artifacts (biggest giveaways when present)

Phrasal templates left unedited (like fill-in-the-blank instructions) Medium
Knowledge-cutoff disclaimers and prompt refusals appearing in the final text Medium
Safety-style disclaimers tacked onto unrelated topics ("It's important to consult a professional...") — noted as more common around sex, medical, or legal topics, often a leftover from the model's built-in caution patterns.

### 11. Tone problems specific to promotional/subject writing

Persistent inability to keep a neutral tone even when prompted to — text drifts toward advertisement-like language for people, companies, and products Studocu
The "active social media presence" tic — noting that a subject "maintains an active social media presence," a phrasing that's unusual outside AI text and rare on Wikipedia before 2024 Wikipedia
Romanticizing/symbolic language — undue emphasis on "cultural heritage," "enduring legacy," "vibrant landscape," even for mundane subjects

### 12. Hallucination-adjacent tells
Hallucinated facts and citations that look plausible but don't actually exist — fabricated sources, invented quotes, or references that don't support the claim they're attached to.

### 3a. Sentence-shape clichés

- **"In today's fast-paced/digital/ever-changing world..."** — any throat-clearing opener that establishes context instead of stating a claim.
- **"Unlock/Unleash/Elevate/Supercharge/Empower your [noun]."** — verb-of-vague-empowerment + possessive + abstract noun. This is the single most over-trained grammatical slot in SaaS marketing copy.
- **"Whether you're a [X] or a [Y], [Product] has you covered."** — the faux-inclusive opener.
- **"Say goodbye to [pain point]."** — written as if the pain point is a character leaving a party.
- **"Built for teams of every size."** or "Built for [speed/scale/teams] at every level."
- **Em-dash sentences that restate the same claim twice** — "We don't just build software — we build the future of work." The second half adds no information.
- **Rule-of-three adjective stacks**: "Fast. Reliable. Secure." / "Simple. Powerful. Flexible." / "Bold. Human. Connected." Three one-word sentence fragments separated by periods. Every SaaS company has this. None of them mean anything.
- **"Trusted by [N]+ teams/companies/developers"** with no source, no named company, and no context — used as visual filler, not as evidence.
- **Bulleted feature lists where every line begins with the same gerund** — "Streamline your workflows. Automate your pipelines. Optimize your delivery." Gerund + possessive noun, repeated for 6–8 bullets.
- **"Designed with [audience] in mind"** — the passive-voice hedge that avoids making a specific claim.
- **Missing or placeholder alt text** — images lack meaningful `alt` attributes, are missing them entirely, or use generic descriptions like "image" or "graphic." This affects accessibility and SEO.
- **AI Storytelling Tropes / Narrative Arcs** — using a repetitive, formulaic "Problem-Agitation-Solution" structure (e.g. "Frustrated with manual tasks? It drains time. Here's our solution...") on every landing page section, or presenting every basic feature release as a dramatic "Hero's Journey" of ultimate transformation.

### 3b. Structural content defaults

- **Generic page titles** like "Home | Product" or "About Us | Company" that tell search engines and users nothing specific.
- **Meta descriptions that read like a product brochure** rather than a specific, useful answer to a user's search intent.
- **"Our Story" or "About Us" copy that reads like a LinkedIn summary** — founded in year, mission to disrupt, passionate team, world-class product.
- **Blog post introductions that begin with a question** the reader did not have: "Ever wondered why [generic industry problem]?"
- **Section headers phrased as vague nouns** ("Features," "Solutions," "Why Us," "Get Started") rather than claims or specific promises.
- **CTA button copy that only says "Get Started," "Learn More," or "Try Free"** — not specific to what the action actually does or delivers.
- **FAQ content that answers no real objections** — questions invented to pad the page ("What is [Product]?" "How do I get started?") rather than the real questions from sales calls.
- **Social proof from fictional or unnamed companies** ("Leading companies trust us") rather than earned, attributed, specific testimony.

### 3c. Tone and voice defaults

- **Writing in a "professional" register that strips all personality** — flat, inoffensive, interchangeable with any other company in the category.
- **Addressing the user as "you" while writing about them as if they are a persona abstraction** ("Teams like yours need...") rather than a person with a specific problem.
- **Using "seamless," "intuitive," "powerful," or "robust"** as adjectives without any specific evidence — these words have been used so often that they communicate nothing except that the writer had no more specific thing to say.
- **Active voice mimicry without subject clarity** — "Enabling teams to ship faster" has no grammatical subject. Who enables? What ships? Faster than what?

### 3d. Lexical and rhythm tells

AI models are trained to sound endlessly helpful and polite, which narrows their vocabulary to a predictable set. Cut these on sight:

- **Adjectives:** intricate, vibrant, crucial, pivotal, paramount, essential.
- **Verbs:** delve, harness, elevate, resonate, enhance, underscore, embark.
- **Nouns:** tapestry, landscape, testament, interplay, offerings.
- **Transitions:** moreover, furthermore, thus, consequently, in conclusion, "it's important to remember."

Beyond vocabulary, watch for:

- **Flawless but flat language** — grammatically perfect, with no personality, humor, or anecdote.
- **No messy transitions** — real writing has tangents and uneven sentence lengths; AI text flows too smoothly.
- **Repetitive structures** — "firstly... secondly... in conclusion" imposed on every paragraph regardless of whether the content calls for it.

**Instead:** Write one sentence that only makes sense for this specific product — a sentence a competitor couldn't copy-paste into their own website without it being obviously wrong. If the company name can be swapped out and the sentence still works, delete it. Write with the specific people and stakes behind this product in mind, not in a register that could belong to anyone.

---

## Section 4 — UX Design & Information Architecture (UX Designer perspective)

These are the patterns that a 40-year UX researcher or information architect would flag in a heuristic review.

### 4a. Page and flow structure defaults

- **Every landing page follows the identical section sequence** — Hero → Logo strip → Features (3 or 6 cards) → How It Works (3 steps) → Testimonial carousel → Pricing (3 tiers) → FAQ accordion → Final CTA banner → Footer — applied to every product without asking whether this sequence serves this specific conversion goal.
- **"How It Works" sections with exactly 3 steps, each numbered** regardless of how many steps the actual process takes.
- **Onboarding flows with a progress bar at the top and no skip option** — the default "wizard" pattern applied to every registration flow without considering whether the user actually needs to complete all steps before getting value.
- **Empty states that just say "No items found"** without explaining what items are, how to create one, or what the user should do next.
- **Error messages that say "Something went wrong"** or "An error occurred" with no actionable next step and no indication of what caused the problem.
- **Forms with no inline validation**, all errors appearing only after submit, all at once, at the top of the form.
- **Modal dialogs for every confirmation action** — including for actions that are trivially reversible, where a toast or inline toggle would be less disruptive.
- **Navigation items that mirror the company's internal department structure** rather than the user's mental model of the tasks they are trying to complete.
- **Breadcrumbs generated for every page** regardless of whether the site is shallow enough that breadcrumbs add no navigational value.

### 4b. Interaction design defaults

- **Every hover state is an opacity reduction or color lightening** — `opacity: 0.7` or a tint of the base color — without considering whether the element needs a different affordance signal.
- **Focus styles removed or suppressed** because they "look ugly" — accessibility failure disguised as aesthetic preference.
- **Scroll-triggered animations on every section** — elements sliding up, fading in, or scaling on scroll applied uniformly because it "feels dynamic," regardless of whether motion serves the content.
- **Infinite scroll with no option to return to position** — applied to every list because pagination feels "old."
- **Hamburger menus on tablet breakpoints** where there is sufficient horizontal space for visible navigation.
- **Click targets smaller than 44×44px** on mobile — the single most common mobile usability failure, and the most avoidable.
- **No loading states or skeleton screens** — content appears or a spinner shows, with nothing in between.
- **Tooltips as the only way to access critical information** — information hidden behind hover states is inaccessible on touch devices.

### 4c. Accessibility defaults (the ignored discipline)

- **Color contrast ratios not checked** — text color and background color chosen for aesthetics without verifying WCAG 2.1 AA (4.5:1 for normal text, 3:1 for large text).
- **Images with no `alt` text**, or `alt` text that just repeats the filename or says "image."
- **Icon-only buttons with no accessible label** (`aria-label` missing) — a button that is visually a trash-can icon has no meaning to a screen reader user.
- **Form inputs without associated `<label>` elements** — placeholder text used as a substitute for a label, which disappears when the user starts typing.
- **`<div>` and `<span>` used as interactive elements** with click handlers but no `role`, no `tabindex`, and no keyboard event handler.
- **Heading levels skipped** — jumping from `<h1>` to `<h3>` because the `<h3>` style looked right, breaking document structure for screen readers.
- **No "skip to main content" link** for keyboard users who would otherwise have to tab through an entire navigation on every page.
- **Animations with no `prefers-reduced-motion` media query** — users with vestibular disorders, epilepsy, or motion sensitivity cannot opt out.

### 4d. Mobile & Responsive Layout Slop

- **Uniform Desktop Padding on Mobile** — applying identical vertical padding (e.g. `padding: 80px 0` or `120px 0`) to small viewports, causing content to feel overly sparse and requiring excessive scrolling.
- **Linear Scaling of Typography** — using standard text resizing or viewport-width units without min/max bounds, making headings microscopic or illegible on small phones.
- **Linear Scaling of Images** — letting images scale down linearly without cropping or changing layout, rendering fine details invisible on 320px screens.
- **Overlapping/Clipped Elements** — failing to adjust grid structures (e.g. sticking to 3-column features on mobile), resulting in text overflow, wrapping, or layout clipping.

**Instead:** Ask what the one thing this specific page needs the visitor to do or believe, and structure every element around that. Remove anything that does not contribute. Real IA is subtraction.

---

## Section 5 — Front-End Web Development (Web Developer perspective)

These are the patterns that a 40-year front-end engineer would call out in a code review.

### 5a. HTML defaults

- **Entire layouts built from `<div>` and `<span>`** with no semantic HTML — no `<main>`, `<nav>`, `<header>`, `<footer>`, `<article>`, `<section>`, `<aside>`, `<figure>`. Semantic HTML is not a nicety; it is the document model.
- **`<br><br>` used as a paragraph separator** instead of `<p>` elements with appropriate margin.
- **Inline `style` attributes** scattered through markup instead of class-based styling.
- **Images without `width` and `height` attributes** causing layout shift (Cumulative Layout Shift, CLS) as they load.
- **Missing `<meta name="description">`, `<meta property="og:title">`, `<link rel="canonical">`** — the minimum viable SEO and social-sharing metadata, absent.
- **`<title>` tags left as the framework default** — "React App," "Vite App," "My Next.js Project" — shipped to production.
- **No `lang` attribute on `<html>`** — preventing screen readers from using the correct language profile.
- **Non-descriptive link text** — "click here," "read more," "learn more" — instead of text that describes the destination.

### 5b. CSS defaults

- **`transition: all 0.3s ease` on every interactive element** — a single easing function and a single duration applied to every motion in the interface. Real motion design varies easing and duration based on the element's size, travel distance, and semantic weight.
- **`!important` used to override specificity conflicts** instead of fixing the underlying specificity problem.
- **Magic numbers in CSS** — `margin-top: 37px`, `padding: 13px 22px` — values with no relationship to a spacing scale.
- **No CSS custom properties (variables) for color, spacing, or typography** — values repeated literally across hundreds of lines.
- **`px` units for all font sizes and line heights** instead of `rem`/`em` — preventing the user's browser font-size preference from taking effect.
- **`z-index: 9999`** (or 999, or 99999) used as a blunt instrument without a defined stacking context strategy.
- **Media queries defined at arbitrary breakpoints** (768px, 1024px because those "feel like" tablet and desktop) rather than at the natural breakpoints of the content.
- **No `max-width` on body text** — lines of prose that stretch to 1400px on wide monitors, making the text unreadable.
- **CSS Grid or Flexbox used for everything including cases where one or the other is wrong** — Flexbox for two-dimensional grid layouts; Grid for single-axis flow.

### 5c. JavaScript defaults

- **`console.log` statements left in production code.**
- **Event listeners attached directly to DOM nodes inside loops** without delegation, creating memory leaks.
- **Fetching data without error handling** — `fetch(url).then(r => r.json()).then(setData)` with no `.catch()` and no loading/error state.
- **`useEffect` with an empty dependency array `[]` used as a componentDidMount substitute** in React, when the actual effect has dependencies that are not declared.
- **State stored in component local state that should be lifted**, causing prop-drilling ten components deep.
- **Entire feature flags implemented as `if (process.env.NODE_ENV === 'development')`** — not real feature flagging; just environment gating.
- **`any` type used everywhere in TypeScript** because adding types "takes too long" — defeating the purpose of using TypeScript at all.
- **No input sanitization** on user-supplied content before it is rendered into the DOM — XSS vulnerability introduced by default.
- **`setTimeout` used as a substitute for a proper loading state or event listener** — `setTimeout(() => setLoaded(true), 500)` as a hack that fails on slow connections.

### 5d. Performance defaults

- **No image optimization** — no `srcset`, no sizes attribute, no WebP/AVIF format, no lazy loading below the fold. Full-resolution JPEGs delivered at display size.
- **Google Fonts loaded with all weights** — preloading 100–900 when only 400 and 700 are used, adding 200KB+ of unused CSS.
- **No `font-display: swap`** — invisible text during font load (FOIT, Flash of Invisible Text).
- **Third-party scripts blocking the main thread** — analytics, chat, and A/B testing scripts all loading synchronously in `<head>`, none deferred or async.
- **Lighthouse Performance score below 50 on mobile** — general indicator of unoptimized code that has not been reviewed.
- **Large bundle size with no code splitting** — a single `bundle.js` that includes every page, every component, and every dependency.

### 5e. SEO (Search-First) defaults

- **No `<meta name="description">`** — the browser shows no search result snippet.
- **No structured data** (JSON-LD) — no `Organization`, `Product`, `FAQPage`, `Article`, `BreadcrumbList`, or `LocalBusiness` schema, despite the page containing those entities.
- **Generic `<title>` tags** — every page has the same `<title>` as the homepage, or the title is only the site name with no page-specific context.
- **Missing `alt` text on images** — images that convey content (not decorative) have no accessible description, which is also a missed ranking opportunity.
- **No canonical URL** — potential duplicate content issues, or the URL has query parameters and no self-referencing canonical.
- **Bad internal linking** — navigation hierarchy that buries important pages three levels deep, pages that exist in isolation with no links pointing to them, or orphaned pages that are indexed but never linked from any navigation.
- **No heading hierarchy** — headings selected for visual appearance rather than document structure, with no semantic depth.
- **Slow Largest Contentful Paint (LCP)** — hero image, heading, or layout element takes more than 2.5 seconds to render, harming both user experience and search rankings.

### 5f. Security defaults

- **`Password` field used with no constraints** — no minimum length, no complexity requirement, no confirmation field.
- **API keys or secrets visible in client-side code** — frontend bundle reveals API keys, database URLs, or auth tokens.
- **No HTTPS redirect** — the site serves over HTTP or does not redirect HTTP to HTTPS.
- **Login forms over insecure HTTP** — credentials sent in plaintext.
- **No rate limiting on API endpoints or form submissions** — no protection against brute force or abuse.
- **Cookies with no `HttpOnly` or `Secure` flags** — session tokens readable by JavaScript over HTTP.
- **No `Content-Security-Policy` header** — no protection against XSS injection.
- **`eval()` or `document.write()` in production code** — dynamic code execution vectors. Refactor to use safe alternatives.
- **Exposed `.env` file or hardcoded credentials** — secrets left in version control or public directories.

---

## Section 6 — Infrastructure & DevOps (DevOps perspective)

These apply when the assistant generates CI/CD YAML, Dockerfiles, or infrastructure-as-code files.

### 6a. Pipeline configuration

- **3-stage pipeline (build → test → deploy) as the only template** with no conditionals — applied to every project regardless of whether it has tests, a build step, or multiple deployment targets.
- **`on: push` triggers on all branches** — every developer branch triggers the full deployment pipeline.
- **Plain-text secrets in YAML files** — `API_KEY: "value"` instead of referencing GitHub Secrets or a vault.
- **`npm install` instead of `npm ci`** — non-deterministic install that ignores the lockfile.
- **No dependency caching** — every build reinstalls all dependencies from scratch.
- **No manual approval gate for production** — merges to main deploy directly to production with no review environment, no canary, and no rollback plan.

### 6b. Dockerfile defaults

- **`FROM node:latest`** — `latest` changes over time, breaking reproducibility silently.
- **No `USER` instruction** — the container runs as root.
- **`COPY . .` before `npm install`** — every source change invalidates the dependency cache layer.
- **No `.dockerignore`** — `node_modules`, `.git`, tests, and local env files end up in the image.
- **Image >1GB** — dev dependencies, compilers, and test tools left in the production image. No multi-stage build.
- **No `HEALTHCHECK`** — container reports healthy before the application is actually serving traffic.

### 6c. Infrastructure-as-code defaults

- **Hardcoded strings for region, instance size, and environment** — `"us-east-1"`, `"t3.micro"`, `"production"` — no variables; not reusable across environments.
- **No remote state backend** — `terraform.tfstate` committed to the repo or stored only locally.
- **Monolithic `main.tf` over 500 lines** — networking, compute, databases, IAM, and logging in one file with no module boundaries.
- **Security groups with `0.0.0.0/0` on internal ports** — database, admin, and internal API ports exposed to the public internet.
- **No resource tags** — cloud resources with no `Owner`, `Environment`, `Project`, or `CostCenter`.

---

## Section 7 — Documentation (Technical Writer perspective)

Apply these checks to README files, API docs, changelogs, and any generated documentation.

- **README describes what the project is but not how to use it** — paragraphs about motivation, badges, one install command, then nothing.
- **No "Getting Started" separate from API reference** — first-time users and experienced integrators sent to the same content.
- **Installation assumes a clean machine** — no prerequisites, no version requirements, no environment setup.
- **Code examples show only the happy path** — no error handling, no rate-limit handling, no "what if this endpoint returns 401."
- **Changelog says "Bug fixes and performance improvements"** — no specifics, no issue references, no version anchors.
- **API documentation that lists parameters but never explains semantics** — what state must be true before calling, what the caller is responsible for, and what happens next.
- **Blog posts with "Have you ever wondered why..." introductions** — the rhetorical-question opener the reader didn't have.
- **"Our Story" page template** — founded in year, we noticed problem, mission to change world, passionate team, serve customers worldwide.

---

## Section 8 — Project Management & Agile Patterns (PM perspective)

### 8a. Sprint / Kanboard defaults

- **User stories with the exact template "As a... I want... So that..."** with no further context, acceptance criteria, or edge cases — the template used as content.
- **Linear backlog of features** with no mention of technical debt, compliance, accessibility, security, or bugs — the backlogs always move forward through new features only.
- **Sprint goals are generic** — "Complete the authentication flow" instead of "Allow users to sign in via Google SSO with passwordless, role-based access by end of sprint."
- **Standup updates that skip blockers** — every update is "I did X, I will do Y" and no one says "I'm blocked on Z."

### 8b. Estimation defaults

- **Fibonacci sequence story points assigned on the first pass** without any discussion of complexity, unknowns, or risk — the numbers just appear.
- **No uncertainty-adjusted estimates** — everything is assumed to go according to plan.
- **No definition of done** — "done" means "code merged," not "code merged, reviewed, tested, documented, and deployed to staging."

### 8c. Retrospective and process defaults

- **Retrospectives that only ask "What went well / What went wrong / What to improve"** — the formula applied without facilitation.
- **Action items from retros that never get owners, deadlines, or follow-up tickets** — the same problem listed every sprint.

---

## The Swap Test

After writing, perform this final check:

**Replace the product name with a competitor's name. Does the output still make complete sense?**

If yes — the headline, subheadline, feature copy, CTAs, testimonials, and tone all work for anyone — it was generated without specific knowledge of what makes this product different.

A writer with domain expertise writes at least one sentence so specific to this product that it cannot be said about any other. That sentence is the proof of authorship.

---

*This skill is part of the [web-ai-slop](https://github.com/sahilkargutkar/web-ai-slop) package.*
