import { Garu } from "garu-ko";
import natural from "natural";

// ── Yield helper ──────────────────────────────────────────────

function yieldToEventLoop(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setImmediate(resolve);
  return promise;
}

// ── Garu singleton ────────────────────────────────────────────

let _garu: Garu | null = null;

async function getGaru(): Promise<Garu> {
  if (!_garu) {
    _garu = await Garu.load();
  }
  return _garu;
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

// ── Main Extraction Function ─────────────────────────────────────

export async function extractKeywords(
  texts: Array<{ id?: string; content: string }>,
  topN = 30
): Promise<KeywordOutput> {
  if (!texts || texts.length === 0) {
    return { keywords: [], total_texts: 0, total_unique_terms: 0 };
  }

  const garu = await getGaru();
  const totalDocs = texts.length;

  // Phase 1: extract nouns per document using garu
  const docsNouns: string[][] = [];
  for (let i = 0; i < texts.length; i++) {
    const clean = texts[i].content.replace(/<[^>]+>/g, " ");
    const nouns = garu.nouns(clean, { includeSL: true }).filter((w) => w.length >= 2);
    docsNouns.push(nouns);
    if (i > 0 && i % 5 === 0) await yieldToEventLoop();
  }

  // Phase 2: add each document to TfIdf corpus
  const tfidf = new natural.TfIdf();
  for (const nouns of docsNouns) {
    tfidf.addDocument(nouns);
  }

  // Phase 3: collect corpus-wide tfidf scores using bigrams as additional terms
  //   First, aggregate terms from all documents, then query each term's corpus score.
  const allTerms = new Set<string>();
  const termDocFreq: Record<string, number> = {};
  for (const nouns of docsNouns) {
    const unique = new Set(nouns);
    for (const term of unique) {
      allTerms.add(term);
      termDocFreq[term] = (termDocFreq[term] ?? 0) + 1;
    }
  }

  // Phase 4: also add bigrams (consecutive noun pairs) as keyword candidates
  //   and feed them as extra "documents" so TfIdf gives them proper weight
  const bigramFreq: Record<string, number> = {};
  for (let i = 0; i < docsNouns.length; i++) {
    const nouns = docsNouns[i];
    for (let j = 0; j < nouns.length - 1; j++) {
      const bg = `${nouns[j]} ${nouns[j + 1]}`;
      bigramFreq[bg] = (bigramFreq[bg] ?? 0) + 1;
    }
    if (i > 0 && i % 5 === 0) await yieldToEventLoop();
  }

  const minFreq = totalDocs > 5 ? 2 : 1;
  for (const [bg, freq] of Object.entries(bigramFreq)) {
    if (freq >= minFreq) {
      // Add bigrams as synthetic terms
      const fakeDoc = bg.split(" ");
      tfidf.addDocument(fakeDoc);
      allTerms.add(bg);
      termDocFreq[bg] = (termDocFreq[bg] ?? 0) + 1;
    }
  }

  // Phase 5: get tfidf weight for each term across all original documents
  const termScore: Record<string, number> = {};
  let processed = 0;
  for (const term of allTerms) {
    let sum = 0;
    tfidf.tfidfs(term, (_i: number, measure: number) => {
      sum += measure;
    });
    termScore[term] = Math.round(sum * 10000) / 10000;
    processed++;
    if (processed % 20 === 0) await yieldToEventLoop();
  }

  // Phase 6: sort by tfidf score, then by frequency
  const sorted = [...allTerms]
    .map((term) => ({
      word: term,
      count: termDocFreq[term] ?? 0,
      score: termScore[term] ?? 0,
      doc_freq: termDocFreq[term] ?? 0,
    }))
    .sort((a, b) => b.score - a.score || b.count - a.count);

  return {
    keywords: sorted.slice(0, topN),
    total_texts: totalDocs,
    total_unique_terms: allTerms.size,
  };
}
