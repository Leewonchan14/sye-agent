// ── Yield helper ──────────────────────────────────────────────

function yieldToEventLoop(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setImmediate(resolve);
  return promise;
}

// ── Korean Stop Words ────────────────────────────────────────────

const STOP_WORDS = new Set([
  "그", "그리고", "그런데", "그래서", "그러나", "그러면", "그러니까",
  "하지만", "그래", "그럼", "그래도", "그렇지", "그러니", "그러므로",
  "이", "그", "저", "것", "수", "등", "및", "의", "에", "에서",
  "로", "으로", "와", "과", "도", "만", "처럼", "보다",
  "안", "못", "더", "덜", "매우", "정말", "너무", "아주", "무척",
  "이런", "그런", "저런", "어떤", "모든", "전체",
  "때", "곳", "데", "거", "군", "듯", "줄", "채", "척",
  "년", "월", "일", "시", "분", "초",
  "하다", "되다", "이다", "있다", "없다", "않다", "아니다",
  "위하", "위해", "대하", "대해", "통하", "통해",
  "관련", "관계", "사항", "내용", "경우",
  "가장", "제일", "최고", "최대", "최소",
  "지금", "오늘", "내일", "어제", "이제",
  "우리", "저희", "당신", "제가", "내가",
  "한번", "처음", "마지막", "다시", "또한", "또",
  "네", "아니", "응", "그래", "맞아",
  "원", "착", "차", "확", "개", "명",
  "때문", "때문에",
  "통해", "통한", "대한", "대해서",
  "중", "안", "밖", "속", "위", "아래", "앞", "뒤", "옆",
  "쪽", "편", "약", "정도", "내외", "이상", "이하",
  "초과", "미만", "및", "제", "세", "네",
  "그냥",
]);

const ENDINGS = [
  "에게도", "에게만",
  "처럼도", "처럼만",
  "부터도", "부터만",
  "까지도", "까지만",
  "이고", "이며", "이자",
  "면서", "으면서",
  "지만", "으나", "으니", "니까", "이니까",
  "로서", "로서도", "로서만",
  "인", "일", "이란", "이면", "이라면",
  "에는", "에도", "에서는", "에서는",
  "에서", "으로", "으로서", "으로써", "으로부터",
  "에게", "에게서", "한테", "한테서",
  "처럼", "마냥", "보다", "하고", "이라고", "라는",
  "부터", "까지", "조차", "마저", "커녕",
  "은", "는", "이", "가", "을", "를", "의", "에",
  "도", "만", "과", "와", "랑", "이랑",
  "이야", "야", "이에요", "예요", "입니다", "입니까",
  "하", "해", "해요", "합니다", "했", "했다",
  "하는", "하다", "하고", "되어",
];

// ── Text Normalization ───────────────────────────────────────────

function normalizeKoreanText(text: string): string {
  if (!text) return "";
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\S+@\S+/g, " ")
    .replace(/[^\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318Fa-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Candidate Word Extraction ────────────────────────────────────

function extractCandidateWords(text: string): string[] {
  if (!text) return [];
  const candidates: string[] = [];

  const koreanWords = text.match(/[\uAC00-\uD7A3]{2,}/g) ?? [];
  for (const word of koreanWords) {
    let cleaned = word;
    for (const ending of ENDINGS) {
      if (cleaned.endsWith(ending) && cleaned.length > ending.length + 1) {
        cleaned = cleaned.slice(0, -ending.length);
        break;
      }
    }
    if (cleaned.length >= 2 && !STOP_WORDS.has(cleaned)) {
      candidates.push(cleaned);
    }
  }

  const engWords = text.match(/[a-zA-Z]{3,}/g) ?? [];
  for (const word of engWords) {
    const lower = word.toLowerCase();
    if (!STOP_WORDS.has(lower)) {
      candidates.push(lower);
    }
  }

  const mixed = text.match(/[\uAC00-\uD7A3]+[a-zA-Z0-9]+/g) ?? [];
  candidates.push(...mixed);
  return candidates;
}

// ── Bigram Extraction ────────────────────────────────────────────

function extractBigrams(words: string[]): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const bg = `${words[i]} ${words[i + 1]}`;
    if (bg.length >= 4) bigrams.push(bg);
  }
  return bigrams;
}

// ── TF-IDF Scoring ───────────────────────────────────────────────

function computeTfIdf(
  termFreq: Record<string, number>,
  docFreq: Record<string, number>,
  totalDocs: number,
): Record<string, number> {
  const scores: Record<string, number> = {};
  const maxTf = Math.max(...Object.values(termFreq), 1);
  for (const [term, tf] of Object.entries(termFreq)) {
    const normalizedTf = tf / maxTf;
    const df = docFreq[term] ?? 1;
    const idf = Math.log((totalDocs + 1) / (df || 1)) + 1;
    scores[term] = Math.round(normalizedTf * idf * 10000) / 10000;
  }
  return scores;
}

// ── Types ─────────────────────────────────────────────────────────

export interface KeywordItem {
  word: string;
  count: number;
  score: number;
  doc_freq: number;
}

export interface KeywordOutput {
  keywords: KeywordItem[];
  total_texts: number;
  total_unique_terms: number;
}

// ── Main Extraction Function (async — yields between processing blocks) ──

export async function extractKeywords(
  texts: Array<{ id?: string; content: string }>,
  topN = 30,
): Promise<KeywordOutput> {
  if (!texts || texts.length === 0) {
    return { keywords: [], total_texts: 0, total_unique_terms: 0 };
  }

  const totalDocs = texts.length;
  const allCandidates: string[] = [];
  const termDocFreq: Record<string, number> = {};
  let yielded = false;

  // Phase 1: normalize + extract per item, yield every 5 items
  for (let i = 0; i < texts.length; i++) {
    const normalized = normalizeKoreanText(texts[i].content);
    const words = extractCandidateWords(normalized);
    allCandidates.push(...words);

    const uniqueTerms = new Set(words);
    for (const term of uniqueTerms) {
      termDocFreq[term] = (termDocFreq[term] ?? 0) + 1;
    }

    if (i > 0 && i % 5 === 0) {
      await yieldToEventLoop();
      yielded = true;
    }
  }
  if (yielded) await yieldToEventLoop();

  // Phase 2: term frequency count
  const termFreq: Record<string, number> = {};
  for (const word of allCandidates) {
    termFreq[word] = (termFreq[word] ?? 0) + 1;
  }

  // Phase 3: minimum frequency filter
  const minFreq = totalDocs > 5 ? 2 : 1;
  for (const [term, freq] of Object.entries(termFreq)) {
    if (freq < minFreq) delete termFreq[term];
  }

  // Phase 4: bigram extraction
  const fullText = texts
    .map((item) => normalizeKoreanText(item.content))
    .join(". ");
  const sentences = fullText.split(/[.!?]/);
  const bigramFreq: Record<string, number> = {};

  for (let i = 0; i < sentences.length; i++) {
    const tokens = sentences[i].match(/[\uAC00-\uD7A3a-zA-Z]{2,}/g) ?? [];
    const bigrams = extractBigrams(tokens);
    for (const bg of bigrams) {
      bigramFreq[bg] = (bigramFreq[bg] ?? 0) + 1;
    }
    if (i > 0 && i % 5 === 0) await yieldToEventLoop();
  }

  // Merge bigrams
  for (const [bg, freq] of Object.entries(bigramFreq)) {
    if (freq >= minFreq) {
      termFreq[bg] = (termFreq[bg] ?? 0) + freq;
    }
  }

  const keys = Object.keys(termFreq);
  if (keys.length === 0) {
    return { keywords: [], total_texts: totalDocs, total_unique_terms: 0 };
  }

  // Phase 5: TF-IDF scoring
  const scores = computeTfIdf(termFreq, termDocFreq, totalDocs);

  // Phase 6: sort and slice
  const sorted = Object.entries(termFreq)
    .map(([term, count]) => ({
      word: term,
      count,
      score: scores[term] ?? 0,
      doc_freq: termDocFreq[term] ?? 0,
    }))
    .sort((a, b) => b.score - a.score || b.count - a.count);

  return {
    keywords: sorted.slice(0, topN),
    total_texts: totalDocs,
    total_unique_terms: keys.length,
  };
}
