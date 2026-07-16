import { z } from "zod/v4";

import { tool } from "ai";

import { extractKeywords } from "./analyze-keywords";
import { detectInfluencers } from "./analyze-influencers";

// ── Shared types ────────────────────────────────────────────

export type BrandMentionItem = {
  id: string;
  brand: string;
  title: string;
  content: string;
  channel: "news" | "blog" | "instagram" | "twitter" | "community";
  url: string;
  author: string | null;
  date: string | null;
  mentions: number;
  source_id?: string;
};

type CrawlChannel =
  | "news"
  | "blog"
  | "instagram"
  | "twitter"
  | "community";

const CHANNEL_NAMES: Record<CrawlChannel, string> = {
  news: "뉴스",
  blog: "블로그",
  instagram: "인스타그램",
  twitter: "트위터(X)",
  community: "커뮤니티",
};

// ── Naver API helpers ───────────────────────────────────────

const NAVER_API_BASE = "https://openapi.naver.com/v1/search";

type NaverFetchResult<T> = { items: T[] } | { error: string };

const naverFetch = async <T>(
  endpoint: string,
  params: Record<string, string | number | undefined>,
): Promise<NaverFetchResult<T>> => {
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

  try {
    const res = await fetch(`${NAVER_API_BASE}/${endpoint}.json?${query}`, {
      headers: {
        "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID!,
        "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET!,
      },
    });

    if (!res.ok) {
      return { error: `Naver API ${res.status}: ${res.statusText}` };
    }
    const data = (await res.json()) as { items: T[] };
    return { items: data.items };
  } catch (err) {
    return { error: `Naver API request failed: ${String(err)}` };
  }
};

const stripHtml = (text: string): string =>
  text.replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ");

// ─── Google News RSS ───────────────────────────────────────────

const fetchGoogleNewsRSS = async (
  brand: string,
  maxItems: number,
): Promise<BrandMentionItem[]> => {
  const items: BrandMentionItem[] = [];
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(brand)}&hl=ko&gl=KR&ceid=KR:ko`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return items;

    const xml = await res.text();
    // Simple XML parsing for RSS
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match: RegExpExecArray | null;
    let idx = 0;

    while ((match = itemRegex.exec(xml)) !== null && idx < maxItems) {
      const itemXml = match[1];
      const title = extractXmlValue(itemXml, "title");
      const link = extractXmlValue(itemXml, "link");
      const pubDate = extractXmlValue(itemXml, "pubDate");
      const source = extractXmlValue(itemXml, "source");

      if (title) {
        items.push({
          id: `gn-${idx}-${Date.now()}`,
          brand,
          title: stripHtml(title),
          content: title,
          channel: "news",
          url: link || "",
          author: source || null,
          date: pubDate || null,
          mentions: 1,
        });
        idx++;
      }
    }
  } catch {
    // RSS is optional; silently fail
  }
  return items;
};

const extractXmlValue = (xml: string, tag: string): string => {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  const m = regex.exec(xml);
  return m ? m[1].trim() : "";
};

// ─── Naver News ────────────────────────────────────────────────

const fetchNaverNews = async (
  brand: string,
  maxItems: number,
): Promise<BrandMentionItem[]> => {
  const result = await naverFetch<Record<string, unknown>>("news", {
    query: brand,
    display: maxItems,
    sort: "date",
  });

  if ("error" in result) return [];

  return result.items.map((item, idx) => ({
    id: `nn-${idx}-${Date.now()}`,
    brand,
    title: stripHtml(String(item.title ?? "")),
    content: stripHtml(String(item.description ?? "")),
    channel: "news" as const,
    url: String(item.originallink || item.link || ""),
    author: null,
    date: String(item.pubDate ?? ""),
    mentions: 1,
  }));
};

// ─── Naver Blog ────────────────────────────────────────────────

const fetchNaverBlog = async (
  brand: string,
  maxItems: number,
): Promise<BrandMentionItem[]> => {
  const result = await naverFetch<Record<string, unknown>>("blog", {
    query: brand,
    display: maxItems,
    sort: "date",
  });

  if ("error" in result) return [];

  return result.items.map((item, idx) => ({
    id: `nb-${idx}-${Date.now()}`,
    brand,
    title: stripHtml(String(item.title ?? "")),
    content: stripHtml(String(item.description ?? "")),
    channel: "blog" as const,
    url: String(item.link ?? ""),
    author: String(item.bloggername ?? "") || null,
    date: String(item.postdate ?? ""),
    mentions: 1,
  }));
};

// ─── Naver Cafe (Community) ────────────────────────────────────

const fetchNaverCafe = async (
  brand: string,
  maxItems: number,
): Promise<BrandMentionItem[]> => {
  const result = await naverFetch<Record<string, unknown>>("cafearticle", {
    query: brand,
    display: maxItems,
    sort: "date",
  });

  if ("error" in result) return [];

  return result.items.map((item, idx) => ({
    id: `nc-${idx}-${Date.now()}`,
    brand,
    title: stripHtml(String(item.title ?? "")),
    content: stripHtml(String(item.description ?? "")),
    channel: "community" as const,
    url: String(item.link ?? ""),
    author: String(item.cafename ?? "") || null,
    date: null,
    mentions: 1,
  }));
};

// ─── Google Web Search (Instagram/Twitter fallback) ────────────

const searchViaGoogle = async (
  brand: string,
  site: string,
  channel: CrawlChannel,
  maxItems: number,
): Promise<BrandMentionItem[]> => {
  const items: BrandMentionItem[] = [];
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(`site:${site} ${brand}`)}&hl=ko&num=${Math.min(maxItems, 10)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) return items;

    const html = await res.text();
    // Extract search result snippets
    const linkRegex = /<a[^>]*href="(\/url\?q=[^"&]+|https?:\/\/[^"]+)"[^>]*>/g;
    const snippetRegex = /<div[^>]*data-sncf[^>]*>[\s\S]*?<\/div>/g;

    const links: string[] = [];
    let linkMatch: RegExpExecArray | null;

    while ((linkMatch = linkRegex.exec(html)) !== null) {
      let href = linkMatch[1];
      if (href.startsWith("/url?q=")) {
        href = decodeURIComponent(href.replace("/url?q=", "").split("&")[0]);
      }
      if (href.startsWith("http") && !href.includes("google.com")) {
        links.push(href);
      }
    }

    // Get titles from h3 elements
    const titleRegex = /<h3[^>]*>([\s\S]*?)<\/h3>/g;
    const titles: string[] = [];
    let titleMatch: RegExpExecArray | null;
    while ((titleMatch = titleRegex.exec(html)) !== null) {
      titles.push(stripHtml(titleMatch[1]));
    }

    // Get snippets
    const snippets: string[] = [];
    const spanRegex = /<span[^>]*class=["']?[^"']*?(?:st|aCOpRe)[^"']*["']?[^>]*>([\s\S]*?)<\/span>/g;
    let spanMatch: RegExpExecArray | null;
    while ((spanMatch = spanRegex.exec(html)) !== null) {
      snippets.push(stripHtml(spanMatch[1]));
    }

    for (let i = 0; i < Math.min(links.length, maxItems); i++) {
      items.push({
        id: `gw-${channel}-${i}-${Date.now()}`,
        brand,
        title: titles[i] || `${brand} on ${site}`,
        content: snippets[i] || titles[i] || "",
        channel,
        url: links[i],
        author: null,
        date: null,
        mentions: 1,
      });
    }
  } catch {
    // Google search is a fallback; silently fail
  }
  return items;
};

// ─── Unified crawl ──────────────────────────────────────────────

const crawlChannel = async (
  brand: string,
  channel: CrawlChannel,
  maxItems: number,
): Promise<BrandMentionItem[]> => {
  switch (channel) {
    case "news": {
      // Combine Naver News + Google News RSS
      const [naverNews, googleNews] = await Promise.all([
        fetchNaverNews(brand, maxItems),
        fetchGoogleNewsRSS(brand, maxItems),
      ]);
      // Deduplicate by URL
      const seen = new Set<string>();
      return [...naverNews, ...googleNews].filter((item) => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
      });
    }
    case "blog":
      return fetchNaverBlog(brand, maxItems);
    case "community":
      return fetchNaverCafe(brand, maxItems);
    case "instagram":
      return searchViaGoogle(brand, "instagram.com", "instagram", maxItems);
    case "twitter":
      return searchViaGoogle(brand, "twitter.com OR x.com", "twitter", maxItems);
    default:
      return [];
  }
};

// ─── Period parsing ─────────────────────────────────────────────

const parsePeriod = (
  period: string,
): { startDate: string; endDate: string; label: string } => {
  const now = new Date();

  // "최근 N일" pattern
  const recentMatch = period.match(/최근\s*(\d+)\s*[일날]/);
  if (recentMatch) {
    const days = parseInt(recentMatch[1], 10);
    const end = now.toISOString().split("T")[0];
    const start = new Date(now.getTime() - days * 86400000)
      .toISOString()
      .split("T")[0];
    return { startDate: start, endDate: end, label: `최근 ${days}일` };
  }

  // "YYYY-MM-DD~YYYY-MM-DD" pattern
  const rangeMatch = period.match(
    /(\d{4}[.-]\d{1,2}[.-]\d{1,2})\s*[~\-∼]\s*(\d{4}[.-]\d{1,2}[.-]\d{1,2})/,
  );
  if (rangeMatch) {
    const normalize = (d: string) => d.replace(/[.-]/g, "-");
    return {
      startDate: normalize(rangeMatch[1]),
      endDate: normalize(rangeMatch[2]),
      label: `${rangeMatch[1]} ~ ${rangeMatch[2]}`,
    };
  }

  // Default: last 7 days
  const end = now.toISOString().split("T")[0];
  const start = new Date(now.getTime() - 7 * 86400000)
    .toISOString()
    .split("T")[0];
  return { startDate: start, endDate: end, label: "최근 7일" };
};

// ─── Tool export ────────────────────────────────────────────────

// ── Standalone Crawl Function ─────────────────────────────────

export interface CrawlResult {
  brand: string;
  period: string;
  period_start: string;
  period_end: string;
  total_items: number;
  channel_distribution: Record<string, number>;
  items: BrandMentionItem[];
  keywords: Array<{ word: string; count: number; score: number; doc_freq: number }>;
  influencers: Array<{
    author: string;
    channels: string[];
    total_articles: number;
    channel_diversity: number;
    avg_sentiment: number;
    total_mentions: number;
    influence_score: number;
    tier: string;
  }>;
}

export async function crawlBrand(
  brand: string,
  channels: CrawlChannel[],
  period: string,
  maxPerChannel: number,
): Promise<CrawlResult> {
  const periodInfo = parsePeriod(period);

  const channelResults = await Promise.all(
    channels.map(async (ch) => {
      const items = await crawlChannel(brand, ch, maxPerChannel);
      return { channel: ch, items };
    }),
  );

  const allItems: BrandMentionItem[] = [];
  const channelCounts: Record<string, number> = {};

  for (const { channel, items } of channelResults) {
    channelCounts[CHANNEL_NAMES[channel]] = items.length;
    allItems.push(...items);
  }

  // Keywords extraction (TF-IDF)
  const textInputs = allItems.map((item) => ({
    id: item.id,
    content: `${item.title} ${item.content ?? ""}`.trim(),
  }));
  const keywordResult = await extractKeywords(textInputs, 30);

  // Influencer detection
  const influencerItems = allItems.map((item) => ({
    author: item.author,
    bloggername: null,
    cafename: null,
    channel: item.channel,
    title: item.title,
    link: item.url,
    pubDate: item.date,
    mentions: item.mentions,
  }));
  const influencerResult = await detectInfluencers(influencerItems);

  return {
    brand,
    period: periodInfo.label,
    period_start: periodInfo.startDate,
    period_end: periodInfo.endDate,
    total_items: allItems.length,
    channel_distribution: channelCounts,
    items: allItems,
    keywords: keywordResult.keywords,
    influencers: influencerResult.influencers,
  };
}

// ── AI SDK Tool ────────────────────────────────────────────

export const brandMonitor = tool({
  description: `지정 브랜드의 여러 채널에서 데이터를 수집하고, 키워드 추출과 인플루언서 분석까지 한 번에 수행합니다.
채널: news(뉴스), blog(블로그), instagram(인스타그램), twitter(트위터/X), community(커뮤니티=네이버카페)
반환: items(수집 데이터) + keywords(TF-IDF 키워드) + influencers(작성자 분석)`,
  inputSchema: z.object({
    brand: z.string().describe("모니터링할 브랜드명"),
    channels: z
      .array(z.enum(["news", "blog", "instagram", "twitter", "community"]))
      .default(["news", "blog", "community", "instagram", "twitter"])
      .describe("수집할 채널 목록"),
    period: z
      .string()
      .default("최근 7일")
      .describe("분석 기간"),
    maxPerChannel: z
      .number()
      .min(1)
      .max(50)
      .default(10)
      .describe("채널당 최대 수집 건수"),
  }),
  execute: async ({ brand, channels, period, maxPerChannel }) => {
    return crawlBrand(brand, channels, period, maxPerChannel);
  },
});
