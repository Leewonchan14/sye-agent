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
};
