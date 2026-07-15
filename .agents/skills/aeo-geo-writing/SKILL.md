---
name: aeo-geo-writing
description: "Structures web copy to be cited by AI search engines — ChatGPT, Perplexity, Gemini, Google AI Overviews, Claude — instead of just ranked by traditional search. Use whenever writing or editing website content, blog posts, FAQ pages, product pages, or landing page copy where AI citation, AI visibility, AEO, GEO, answer engine optimization, or being mentioned by name in an AI-generated answer is a goal."
---

# AEO/GEO Writing — Structuring Content for AI Citation

> [!NOTE]
> **Core Philosophy (Mantra):** Do not write generalities; write checkable facts. Write content to be the single context-dense sentence that survives RAG retrieval and gets cited by name.

Traditional SEO writes to rank a link. AEO/GEO (Answer/Generative Engine Optimization) writes to **be the sentence an AI model extracts, repeats, and attributes to your brand.** 

AI retrieval systems (RAG) do not read your page top-to-bottom to form an impression. They segment your page into isolated text chunks, evaluate each chunk's relevance and authority in isolation, and either cite it or discard it. This skill enforces rules to ensure your claims survive this extraction process.

**Cross-Reference:** Always pair this skill with `web-ai-slop`. AEO copy ensures AI engines find and cite your content, while `web-ai-slop` guarantees the copy remains engaging, fresh, and free from robotic tropes for human readers.

**Rule of application:** Apply this skill whenever drafting, editing, or auditing web content, documentation, blog posts, or marketing copy. If the text matches **2 or more patterns** in Section 2 (Vagueness) or fails Section 1 (Structure), discard the draft and rewrite.

Apply this silently. Do not narrate "I am optimizing this for generative engine visibility" to the user.

---

## Section 1 — Structural Architecture (AI Crawler Friendly)

AI crawlers and extraction tools require specific layouts to parse and attribute content correctly.

### 1a. The "Answer Capsule" Pattern
- **Direct Answer Placement:** Directly under every H2 or H3 heading, place a **40–60 word capsule** that answers the heading's question directly.
- **No Preamble:** Do not begin with "In this section we will discuss..." or "That is a great question...". Start with the answer.
- **Isolation Test:** If an AI model extracted only this capsule and discarded the rest of the page, would it still represent a complete, correct, and attributable claim? If not, rewrite.

### 1b. Schema and Semantics
- **FAQPage Schema:** Always bundle FAQ blocks with structured JSON-LD `FAQPage` schema. This is the single highest-leverage technical element for Google AI Overviews.
- **Data Tables Over Prose:** When comparing statistics, specifications, or pricing, use semantic HTML `<table>` elements instead of narrative text. Retrieval models extract tabular data with significantly higher confidence.
- **The Summary Hook:** On long-form pages, write a concise 100–150 word summary paragraph before the very first H2. Search engines weight the beginning of documents heavily during retrieval.
- **Credibility Signals:** Ensure a visible, named author with a real bio and a visible "Last updated on [Date]" metadata field is present. Models use freshness and authorship as ranking weights.

### 1c. Dynamic FAQ & Question Logic
Different models favor different formats. Provide a variety of structures to cover multiple engine biases:
- **FAQ Lists:** Bulleted question-and-answer accordions with `FAQPage` schema (favored by ChatGPT and Google AI Overviews).
- **How-To Listicles:** Ordered steps (`<ol>` or H3s with step numbers) containing specific actions (favored by task-oriented assistants).
- **Definition Summaries:** H3 + short definition under 30 words for direct snippet panels.

### 1d. Multimodal Integration (Visual RAG)
AI engines don't just index text; they match queries to images based on contextual intent.
- **Intent-Based Descriptive Alt-Text:** Alt-text must describe the *functional purpose and conclusions* of the visual, not just its objects.
  - *Bad:* `alt="A graph showing sales"`
  - *Good:* `alt="Line chart showing a 42% decrease in checkout page abandonment rates after integrating single-click checkout"`
- **Surrounding Text Context:** Keep core metrics described in the adjacent paragraph. Retrieval bots evaluate text blocks surrounding the image tags.

Use this skill whenever writing, drafting, or revising prose of any kind for the user. Emails, essays, articles, blog posts, reports, cover letters, social posts, creative writing, or any other text meant to read as naturally written.

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

### 10. Leftover AI artifacts (biggest giveaways when present)

Phrasal templates left unedited (like fill-in-the-blank instructions) Medium
Knowledge-cutoff disclaimers and prompt refusals appearing in the final text Medium
Safety-style disclaimers tacked onto unrelated topics ("It's important to consult a professional...") — noted as more common around sex, medical, or legal topics, often a leftover from the model's built-in caution patterns.

### 11. Tone problems specific to promotional/subject writing

Persistent inability to keep a neutral tone even when prompted to — text drifts toward advertisement-like language for people, companies, and products Studocu
The "active social media presence" tic — noting that a subject "maintains an active social media presence," a phrasing that's unusual outside AI text and rare on Wikipedia before 2024 Wikipedia
Romanticizing/symbolic language — undue emphasis on "cultural heritage," "enduring legacy," "vibrant landscape," even for mundane subjects

### 12. Hallucination-adjacent tells
Hallucinated facts and citations that look plausible but don't actually exist — fabricated sources, invented quotes, or references that don't support the claim they're attached to.

---

## Section 2 — Copywriting & Tone (Credibility Signals)

AI models are risk-averse; they prefer to skip exciting claims they cannot verify in favor of boring, checkable facts.

### 2a. E-E-A-T & Credibility Expansion
Experience, Expertise, Authoritativeness, and Trustworthiness are heavily weighted signals:
- **First-Person Experience Verbs:** Use active verbs showing physical interaction ("We audited 140 codebases...", "I tested the API performance...", "We measured the transition delay..."). Bots filter for primary sources over secondary synthesis.
- **Expert Verification labels:** Include clear "Expert-Verified by [Name]" badges linking to authoritative author profiles or schema credentials.
- **Eliminating Hedging:** Phrases like "we believe," "in our opinion," "we think," or "potentially" lower a model's confidence score. State claims declaratively.
- **Attributable Sourcing:** Avoid vague authority. "Many developers agree that..." is uncitable. "According to Stack Overflow's 2025 Developer Survey, 76% of developers..." is highly citable.
- **Concrete Metrics:** Replace adjectives with numbers. Do not write "a significant performance increase." Write "a 42% decrease in page load times."
- **One Claim per Sentence:** Split compound sentences. If a model extracts only half of a compound sentence, the context is lost and the citation fails.

### 2b. AEO Copywriting Examples

| Bad (Traditional SEO / AI Default) | Good (AEO/GEO Optimized) |
|---|---|
| In today's digital landscape, we believe standardizing procedures is key. Our platform is designed to help teams leverage advanced functionality to streamline operations and unlock efficiency. | AcmeCorp automates B2B invoice reconciliation. According to our 2026 platform audit, integrating the system reduces manual data entry by 73% for finance teams within 30 days. |
| Many experts agree that page speed is crucial for conversions. Having a fast website can significantly boost your revenue and user experience. | According to a Portent study, websites that load in 1 second convert 3x higher than sites that load in 5 seconds. Speed directly impacts transaction completion rates. |

---

## Section 3 — Technical & Off-Page Prerequisites

Perfect prose is useless if crawlers cannot access it or if search indexes do not list it.

### 3a. Indexing and Crawling
- **Server-Side Render (SSR) Critical Copy:** Crawlers prioritize speed and often skip executing JavaScript. If your core claims are injected client-side (SPA), they are invisible to AI models.
- **Allow bots in `robots.txt`:** Do not block `GPTBot`, `ClaudeBot`, `Google-Extended`, or `Bingbot` unless explicitly directed.
- **Deploy `llms.txt`:** Place an `llms.txt` file at the root of your domain. This serves as a plain-markdown dictionary of your site's structure and purpose for models.
- **Bing Index Priority:** ChatGPT's web search relies on the Bing index. Ensure your site is fully indexed in Bing Webmaster Tools; Google indexation alone is insufficient.

### 3b. Off-Page Credibility
- **Community Footprint:** Models rely heavily on community platforms (e.g., Reddit, Stack Overflow, GitHub) for sentiment and real-world recommendations. A presence in discussions is as important as on-page content.
- **Proprietary Data Moats:** Publish original, first-party data audits, benchmark results, or survey findings with methodology and dates. Original numbers are highly cited.

---

## Section 4 — Platform Targeting Matrix

Customize the structure of the content based on which engine you want to prioritize.

| Engine | Key Retrieval Bias | Best Content Strategy |
|---|---|---|
| **ChatGPT (Bing)** | Verbatim list items, FAQ blocks, and direct definitions. | Highly structured bullet points, clear H2 headings, and active Bing index presence. |
| **Perplexity** | Authoritative, fresh, and multi-source verified data. | Original research, cited statistics, and fast publication of current events. |
| **Google AI Overviews** | Rich schema, definitions, and visual assets. | FAQPage/HowTo schemas, semantic tables, and labeled diagnostic diagrams. |
| **Claude** | Multi-paragraph context, long-form synthesis, and clean reasoning. | Exhaustive guides, well-explained mechanisms, and deep technical details. |

---

## Section 5 — The AEO/GEO Self-Check

Before submitting copy, verify against this checklist:
1. **Answer Capsule Check:** Can the lead sentence of each H2 section be read completely alone and still make sense?
2. **Attribution Check:** Is there a checkable source, number, or name for every claim of fact?
3. **No Hedging Check:** Have words like "believe", "opinion", "think", "probably" been removed?
4. **Formatting Check:** Are comparisons formatted as semantic `<table>` elements and list questions as `FAQPage` schema?
5. **Technical Check:** Is the copy server-rendered, and is the Bing index verified?
6. **EEAT & Visual Check:** Are alt-texts intent-based, and are first-person experience verbs used where appropriate?

---

## Section 6 — Case Studies: AEO/GEO Failure vs. Success

### Failure Case 1: Hedged & Fluffy Copy (AI-Default Slop)
> "We believe that improving databases is vital. Our team feels that custom indexing could potentially speed up query resolution. Many users have reported a seamless performance shift after optimization."
> 
> *Why it fails:* "We believe", "feels", "potentially" trigger high uncertainty scores. "Many users" is uncitable. There are no metrics.

### Success Case 1: Declarative & Sourced (AEO-Optimized)
> "Custom indexing optimizes SQL queries. We audited 140 database instances and recorded a 64% reduction in query latencies after implementing partial indexes. A 2026 PostgreSQL benchmark study confirms that partial indexing cuts disk write overhead by 30%."
> 
> *Why it works:* Declarative statement leads. Uses first-person experienced verbs ("We audited", "recorded"). Names checkable study/benchmark and reports exact metrics (64%, 30%).
