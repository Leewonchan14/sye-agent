// ── Yield helper ──────────────────────────────────────────────

function yieldToEventLoop(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setImmediate(resolve);
  return promise;
}

// ── Types ─────────────────────────────────────────────────────────

export interface InfluencerInput {
  author?: string | null;
  bloggername?: string | null;
  cafename?: string | null;
  nickname?: string | null;
  channel?: string;
  title?: string;
  link?: string;
  pubDate?: string | null;
  sentiment_score?: number | null;
  mentions?: number;
}

export interface InfluencerItem {
  author: string;
  channels: string[];
  total_articles: number;
  channel_diversity: number;
  avg_sentiment: number;
  total_mentions: number;
  influence_score: number;
  recent_titles: string[];
  tier: "core" | "active" | "notable" | "mention";
}

export interface InfluencerOutput {
  influencers: InfluencerItem[];
  total_authors: number;
  summary: Record<string, number>;
}

// ── Detection Function (async — yields between processing blocks) ──

export async function detectInfluencers(
  items: InfluencerInput[],
): Promise<InfluencerOutput> {
  if (!items || items.length === 0) {
    return { influencers: [], total_authors: 0, summary: {} };
  }

  // Phase 1: group by author, yield every 20 items
  const authorMap = new Map<
    string,
    {
      channels: Set<string>;
      articles: Array<{ title: string; channel: string; url: string; date: string }>;
      sentimentScores: number[];
      titles: string[];
      totalMentions: number;
    }
  >();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const author =
      item.author ||
      item.bloggername ||
      item.cafename ||
      item.nickname ||
      "";
    if (!author || author.length < 2) continue;

    let entry = authorMap.get(author);
    if (!entry) {
      entry = {
        channels: new Set(),
        articles: [],
        sentimentScores: [],
        titles: [],
        totalMentions: 0,
      };
      authorMap.set(author, entry);
    }

    entry.channels.add(item.channel ?? "unknown");
    entry.articles.push({
      title: item.title ?? "",
      channel: item.channel ?? "unknown",
      url: item.link ?? "",
      date: item.pubDate ?? "",
    });
    if (item.sentiment_score != null) {
      entry.sentimentScores.push(item.sentiment_score);
    }
    if (item.title) entry.titles.push(item.title);
    entry.totalMentions += item.mentions ?? 1;

    if (i > 0 && i % 20 === 0) await yieldToEventLoop();
  }

  // Phase 2: process each author into influencer items
  const influencers: InfluencerItem[] = [];

  for (const [author, data] of authorMap) {
    const articleCount = data.articles.length;
    const channelCount = data.channels.size;
    const avgSentiment =
      data.sentimentScores.length > 0
        ? data.sentimentScores.reduce((a, b) => a + b, 0) /
          data.sentimentScores.length
        : 0;

    const influenceScore =
      Math.min(articleCount * 10, 40) +
      Math.min(channelCount * 15, 30) +
      Math.min(data.totalMentions * 5, 30);

    let tier: InfluencerItem["tier"];
    if (articleCount >= 10 && channelCount >= 2) tier = "core";
    else if (articleCount >= 5) tier = "active";
    else if (articleCount >= 3) tier = "notable";
    else tier = "mention";

    influencers.push({
      author,
      channels: [...data.channels].sort(),
      total_articles: articleCount,
      channel_diversity: channelCount,
      avg_sentiment: Math.round(avgSentiment * 10000) / 10000,
      total_mentions: data.totalMentions,
      influence_score: Math.round(influenceScore * 10) / 10,
      recent_titles: data.titles.slice(0, 5),
      tier,
    });
  }

  // Phase 3: sort
  influencers.sort((a, b) => b.influence_score - a.influence_score);

  const summary: Record<string, number> = {
    core: influencers.filter((i) => i.tier === "core").length,
    active: influencers.filter((i) => i.tier === "active").length,
    notable: influencers.filter((i) => i.tier === "notable").length,
    mention: influencers.filter((i) => i.tier === "mention").length,
  };

  return {
    influencers,
    total_authors: influencers.length,
    summary,
  };
}
