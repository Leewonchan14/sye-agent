import { z } from "zod/v4";

import { tool } from "ai";

const NAVER_API_BASE = "https://openapi.naver.com/v1/search";

type NaverFetchResult<T> = { items: T[] } | { error: string };

const naverFetch = async <T>(
  endpoint: string,
  params: Record<string, string | number | undefined>
): Promise<NaverFetchResult<T>> => {
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined)
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

const stripHtml = (text: string): string => text.replace(/<[^>]*>/g, "");

// --- Naver Place Reviews (internal GraphQL API) ---

const NAVER_PLACE_API = "https://pcmap-api.place.naver.com/place/graphql";

const VISITOR_REVIEWS_QUERY = `
query getVisitorReviews($input: VisitorReviewsInput) {
  visitorReviews(input: $input) {
    items {
      id
      rating
      author {
        id
        nickname
      }
      body
      visited
      created
      status
      votedKeywords {
        code
        name
      }
    }
    total
    starDistribution {
      score
      count
    }
  }
}
`;

const PLACE_API_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Content-Type": "application/json",
  Accept: "application/json",
  Origin: "https://m.place.naver.com",
};

type PlaceReviewItem = {
  id: string;
  rating: number;
  author?: { id: string; nickname: string };
  body: string;
  visited: string;
  created: string;
  status: string;
  votedKeywords?: { code: string; name: string }[];
};

type PlaceReviewsGraphQLResponse = {
  data?: {
    visitorReviews?: {
      items: PlaceReviewItem[];
      total: number;
      starDistribution: { score: number; count: number }[];
    };
  };
  errors?: { message: string }[];
};

const fetchPlaceReviewsPage = async (
  placeId: string,
  display: number,
  page: number
): Promise<
  | {
      items: PlaceReviewItem[];
      total: number;
      starDistribution: { score: number; count: number }[];
    }
  | { error: string }
> => {
  try {
    const res = await fetch(NAVER_PLACE_API, {
      method: "POST",
      headers: {
        ...PLACE_API_HEADERS,
        Referer: `https://m.place.naver.com/place/${placeId}`,
      },
      body: JSON.stringify({
        operationName: "getVisitorReviews",
        query: VISITOR_REVIEWS_QUERY,
        variables: {
          id: placeId,
          input: {
            businessId: placeId,
            businessType: "place",
            display,
            page,
            getAuthorInfo: true,
            includeContent: true,
            isPhotoUsed: false,
            item: "0",
          },
        },
      }),
    });

    if (!res.ok) {
      if (res.status === 429)
        return { error: "Rate limited by Naver (429). Try again later." };
      return { error: `Naver Place API ${res.status}: ${res.statusText}` };
    }

    const json = (await res.json()) as PlaceReviewsGraphQLResponse;

    if (json.errors?.length) {
      return { error: `GraphQL error: ${json.errors[0].message}` };
    }

    const reviews = json.data?.visitorReviews;
    if (!reviews) {
      return { error: "No review data in response" };
    }

    return {
      items: reviews.items ?? [],
      total: reviews.total,
      starDistribution: reviews.starDistribution ?? [],
    };
  } catch (err) {
    return { error: `Naver Place API request failed: ${String(err)}` };
  }
};

/** Extract numeric placeId from a Naver Place URL */
const extractPlaceId = (link: string): string | null => {
  const m = link.match(/\/place\/(\\d+)/);
  return m?.[1] ?? null;
};

// --- Naver Place Search (Apollo State from search.naver.com) ---

export type PlaceReviewInfo = {
  reviewId: string;
  rating: number;
  body: string;
  authorNickname: string | null;
  visitedDate: string;
  createdAt: string;
  votedKeywords: string[];
};

type NaverPlaceSearchItem = {
  placeId: string;
  name: string;
  category: string;
  roadAddress: string;
  address: string;
  phone: string;
  visitorReviewScore: number | null;
  visitorReviewCount: number;
  placeUrl: string;
  mapx: string;
  mapy: string;
  reviews?: PlaceReviewInfo[];
};

const SEARCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

const parseNaverCount = (val: unknown): number => {
  if (val == null) return 0;
  const str = String(val).replace(/,/g, "");
  const n = Number(str);
  return Number.isNaN(n) ? 0 : n;
};

const parseNaverScore = (val: unknown): number | null => {
  if (val == null) return null;
  const n = Number(String(val).replace(/,/g, ""));
  return Number.isNaN(n) ? null : n;
};

async function searchNaverPlace(
  query: string,
  display: number
): Promise<{ items: NaverPlaceSearchItem[] } | { error: string }> {
  const url = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { headers: SEARCH_HEADERS });
    if (!res.ok) {
      return { error: `Naver search ${res.status}: ${res.statusText}` };
    }

    const html = await res.text();
    // Extract __APOLLO_STATE__ using brace-counting (regex can't handle 200KB+ JSON)
    const marker = "__APOLLO_STATE__";
    const apolloIdx = html.indexOf(marker);
    if (apolloIdx === -1) {
      // Try extracting placeId from HTML directly
      const placeIdMatch = html.match(/\/place\/(\d{8,})/);
      if (placeIdMatch) {
        const pid = placeIdMatch[1];
        return {
          items: [
            {
              placeId: pid,
              name: "",
              category: "",
              roadAddress: "",
              address: "",
              phone: "",
              visitorReviewScore: null,
              visitorReviewCount: 0,
              placeUrl: `https://m.place.naver.com/place/${pid}`,
              mapx: "",
              mapy: "",
            },
          ],
        };
      }
      return { error: "Could not extract place data from search page" };
    }

    const eqIdx = html.indexOf("=", apolloIdx);
    const jsonStart = html.indexOf("{", eqIdx);
    if (jsonStart === -1) {
      return { error: "Malformed Apollo State in search page" };
    }

    let depth = 0;
    let jsonEnd = jsonStart;
    for (let i = jsonStart; i < html.length; i++) {
      if (html[i] === "{") depth++;
      else if (html[i] === "}") {
        depth--;
        if (depth === 0) {
          jsonEnd = i + 1;
          break;
        }
      }
    }

    const jsonStr = html.slice(jsonStart, jsonEnd);
    // Naver uses \u002F (/) and \u0026 (&) unicode escapes
    const cleanJson = jsonStr.replace(/\\u002F/g, "/").replace(/\\u0026/g, "&");
    const apolloState = JSON.parse(cleanJson) as Record<string, unknown>;
    return parseApolloState(apolloState, display);
  } catch (err) {
    return { error: `Naver place search failed: ${String(err)}` };
  }
}

function parseApolloState(
  apolloState: Record<string, unknown>,
  display: number
): { items: NaverPlaceSearchItem[] } | { error: string } {
  const places: NaverPlaceSearchItem[] = [];

  // Case 1: Search results list page — PlaceListBusinessesItem:* keys
  for (const [key, value] of Object.entries(apolloState)) {
    if (!key.startsWith("PlaceListBusinessesItem") || !value || typeof value !== "object")
      continue;

    const item = value as Record<string, unknown>;
    const rawId = String(item.id ?? "");
    const placeId = rawId || key.split(":")[1] || "";
    if (!placeId) continue;

    places.push({
      placeId,
      name: String(item.name ?? item.title ?? ""),
      category: String(item.category ?? ""),
      roadAddress: String(item.roadAddress ?? ""),
      address: String(item.address ?? ""),
      phone: String(item.phone ?? item.virtualPhone ?? ""),
      visitorReviewScore: parseNaverScore(item.visitorReviewScore),
      visitorReviewCount: parseNaverCount(item.visitorReviewCount),
      placeUrl: `https://m.place.naver.com/place/${placeId}`,
      mapx: String(item.x ?? item.mapx ?? ""),
      mapy: String(item.y ?? item.mapy ?? ""),
    });
  }

  // Case 2: Place detail page — extract single place from ROOT_QUERY + PlaceDetailBase
  if (places.length === 0) {
    const rq = apolloState["ROOT_QUERY"] as Record<string, unknown> | undefined;
    if (rq) {
      // Find placeId from placeDetail query in ROOT_QUERY
      for (const [k, _v] of Object.entries(rq)) {
        const idMatch = k.match(/placeDetail\([^)]*"id":"(\d+)"/);
        if (idMatch) {
          const placeId = idMatch[1];
          const baseKey = `PlaceDetailBase:${placeId}`;
          const base = apolloState[baseKey] as Record<string, unknown> | undefined;
          if (base) {
            const coord = base["coordinate"] as Record<string, unknown> | undefined;
            places.push({
              placeId,
              name: String(base["name"] ?? ""),
              category: String(base["category"] ?? ""),
              roadAddress: String(base["roadAddress"] ?? ""),
              address: String(base["address"] ?? ""),
              phone: String(base["phone"] ?? base["virtualPhone"] ?? ""),
              visitorReviewScore: parseNaverScore(base["visitorReviewsScore"]),
              visitorReviewCount: parseNaverCount(base["visitorReviewsTotal"]),
              placeUrl: `https://m.place.naver.com/place/${placeId}`,
              mapx: String(coord?.["x"] ?? ""),
              mapy: String(coord?.["y"] ?? ""),
            });
          }
          break;
        }
      }
    }
  }

  if (places.length === 0) {
    return { error: "No place results found in search page" };
  }

  return { items: places.slice(0, display) };
}

async function fetchPlaceReviews(
  placeId: string,
  maxReviews: number
): Promise<{ reviews: PlaceReviewInfo[] } | { error: string }> {
  const display = Math.min(maxReviews, 20);
  const pages = Math.ceil(maxReviews / display);

  let allItems: PlaceReviewItem[] = [];
  let errorMsg: string | undefined;

  for (let page = 1; page <= pages; page++) {
    const result = await fetchPlaceReviewsPage(placeId, display, page);

    if ("error" in result) {
      if (result.error.includes("429")) {
        await new Promise((r) => setTimeout(r, 3000));
        const retry = await fetchPlaceReviewsPage(placeId, display, page);
        if ("error" in retry) {
          errorMsg = retry.error;
          break;
        }
        allItems.push(...retry.items);
        if (retry.items.length < display) break;
        if (page < pages)
          await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));
        continue;
      }
      errorMsg = result.error;
      break;
    }

    allItems.push(...result.items);
    if (result.items.length < display) break;

    if (page < pages)
      await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));
  }

  if (allItems.length === 0 && errorMsg) {
    return { error: errorMsg };
  }

  return {
    reviews: allItems.slice(0, maxReviews).map((r) => ({
      reviewId: r.id,
      rating: r.rating,
      body: r.body,
      authorNickname: r.author?.nickname ?? null,
      visitedDate: r.visited,
      createdAt: r.created,
      votedKeywords: r.votedKeywords?.map((k) => k.name) ?? [],
    })),
  };
}

export const naverTools = {
  search_naver_local: tool({
    description: "네이버 지역/업체 검색 (맛집, 카페, 관광지 등 장소 검색)",
    inputSchema: z.object({
      query: z.string().describe("검색어"),
      display: z.number().min(1).max(5).default(3).describe("출력 건수 (1-5)"),
    }),
    execute: async ({ query, display }) => {
      const result = await naverFetch<Record<string, unknown>>("local", {
        query,
        display,
        sort: "random",
      });
      if ("error" in result) return result;
      return {
        items: result.items.map((item) => ({
          title: stripHtml(String(item.title ?? "")),
          category: item.category,
          telephone: item.telephone,
          address: item.address,
          roadAddress: item.roadAddress,
          mapx: item.mapx,
          mapy: item.mapy,
          link: item.link,
        })),
      };
    },
  }),

  search_naver_blog: tool({
    description: "네이버 블로그 검색",
    inputSchema: z.object({
      query: z.string().describe("검색어"),
      display: z.number().min(1).max(10).default(5).describe("출력 건수 (1-10)"),
      sort: z
        .enum(["sim", "date"])
        .default("sim")
        .describe("정렬: sim(정확도순), date(최신순)"),
    }),
    execute: async ({ query, display, sort }) => {
      const result = await naverFetch<Record<string, unknown>>("blog", {
        query,
        display,
        sort,
      });
      if ("error" in result) return result;
      return {
        items: result.items.map((item) => ({
          title: stripHtml(String(item.title ?? "")),
          link: item.link,
          description: stripHtml(String(item.description ?? "")),
          bloggername: item.bloggername,
          bloggerlink: item.bloggerlink,
          postdate: item.postdate,
        })),
      };
    },
  }),

  search_naver_cafe: tool({
    description: "네이버 카페 게시물 검색",
    inputSchema: z.object({
      query: z.string().describe("검색어"),
      display: z.number().min(1).max(10).default(5).describe("출력 건수 (1-10)"),
    }),
    execute: async ({ query, display }) => {
      const result = await naverFetch<Record<string, unknown>>("cafearticle", {
        query,
        display,
        sort: "sim",
      });
      if ("error" in result) return result;
      return {
        items: result.items.map((item) => ({
          title: stripHtml(String(item.title ?? "")),
          link: item.link,
          description: stripHtml(String(item.description ?? "")),
          cafename: item.cafename,
          cafeurl: item.cafeurl,
        })),
      };
    },
  }),

  search_naver_news: tool({
    description: "네이버 뉴스 검색",
    inputSchema: z.object({
      query: z.string().describe("검색어"),
      display: z.number().min(1).max(10).default(5).describe("출력 건수 (1-10)"),
      sort: z
        .enum(["sim", "date"])
        .default("sim")
        .describe("정렬: sim(정확도순), date(최신순)"),
    }),
    execute: async ({ query, display, sort }) => {
      const result = await naverFetch<Record<string, unknown>>("news", {
        query,
        display,
        sort,
      });
      if ("error" in result) return result;
      return {
        items: result.items.map((item) => ({
          title: stripHtml(String(item.title ?? "")),
          link: item.link,
          description: stripHtml(String(item.description ?? "")),
          pubDate: item.pubDate,
          originallink: item.originallink,
        })),
      };
    },
  }),

  search_naver_image: tool({
    description: "네이버 이미지 검색",
    inputSchema: z.object({
      query: z.string().describe("검색어"),
      display: z.number().min(1).max(10).default(5).describe("출력 건수 (1-10)"),
      filter: z
        .enum(["all", "large", "medium", "small"])
        .default("all")
        .describe("이미지 필터"),
    }),
    execute: async ({ query, display, filter }) => {
      const result = await naverFetch<Record<string, unknown>>("image", {
        query,
        display,
        sort: "sim",
        filter,
      });
      if ("error" in result) return result;
      return {
        items: result.items.map((item) => ({
          title: stripHtml(String(item.title ?? "")),
          link: item.link,
          thumbnail: item.thumbnail,
          sizeheight: item.sizeheight,
          sizewidth: item.sizewidth,
        })),
      };
    },
  }),

  search_naver_shopping: tool({
    description: "네이버 쇼핑 검색",
    inputSchema: z.object({
      query: z.string().describe("검색어"),
      display: z.number().min(1).max(10).default(5).describe("출력 건수 (1-10)"),
      sort: z
        .enum(["sim", "date", "asc", "dsc"])
        .default("sim")
        .describe("정렬: sim(정확도순), date(최신순), asc(낮은가격순), dsc(높은가격순)"),
    }),
    execute: async ({ query, display, sort }) => {
      const result = await naverFetch<Record<string, unknown>>("shop", {
        query,
        display,
        sort,
      });
      if ("error" in result) return result;
      return {
        items: result.items.map((item) => ({
          title: stripHtml(String(item.title ?? "")),
          link: item.link,
          image: item.image,
          lprice: item.lprice,
          hprice: item.hprice,
          mallName: item.mallName,
          productId: item.productId,
          brand: item.brand,
          maker: item.maker,
        })),
      };
    },
  }),

  search_naver_place: tool({
    description:
      "네이버 플레이스 장소 검색 + 리뷰 조회 (placeId, 별점, 리뷰수 포함). maxReviews=0이면 장소만, >0이면 리뷰도 함께 반환",
    inputSchema: z.object({
      query: z.string().describe("검색어 (예: 강남역 맛집, 홍대 카페)"),
      display: z.number().min(1).max(5).default(5).describe("출력 건수 (1-5)"),
      maxReviews: z
        .number()
        .min(0)
        .max(10)
        .default(0)
        .describe("업체당 가져올 리뷰 수 (0=리뷰 미포함)"),
    }),
    execute: async ({ query, display, maxReviews }) => {
      const items = await searchNaverPlace(query, display);
      if ("error" in items) return items;

      if (!maxReviews || maxReviews <= 0) {
        return { items: items.items };
      }

      // Fetch reviews for each place
      const enriched = await Promise.all(
        items.items.map(async (place) => {
          const result = await fetchPlaceReviews(place.placeId, maxReviews);
          if ("error" in result) {
            return { ...place, reviews: [] };
          }
          if (result.reviews.length > 0) {
          }
          return {
            ...place,
            reviews: result.reviews,
          };
        })
      );

      return { items: enriched };
    },
  }),
};
