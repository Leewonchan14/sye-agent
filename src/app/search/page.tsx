"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { SidebarLayout } from "@/components/sidebar-layout";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuthStore } from "@/lib/auth-store";
import { Search } from "lucide-react";

interface SearchResult {
  id: string;
  title: string;
  messageCount: number;
  lastActivity: string;
  snippet: string;
}

interface SearchPageResponse {
  results: SearchResult[];
  nextCursor: string | null;
}

const SearchPage = () => {
  const token = useAuthStore((s) => s.token);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounce: update debouncedQuery 300ms after user stops typing
  useEffect(() => {
    if (!query.trim()) {
      const t = setTimeout(() => setDebouncedQuery(""), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching, isFetchingNextPage, isFetched, hasNextPage, fetchNextPage } =
    useInfiniteQuery({
      queryKey: ["session-search", debouncedQuery],
      queryFn: async ({ pageParam }) => {
        const params = new URLSearchParams({ q: debouncedQuery });
        if (pageParam) params.set("cursor", pageParam);
        const r = await fetch(`/api/sessions/search?${params}`, {
          headers: { "x-auth-token": token },
        });
        const d = (await r.json()) as SearchPageResponse;
        return d;
      },
      initialPageParam: "",
      getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
      enabled: debouncedQuery.trim().length > 0,
      staleTime: 30_000,
    });

  const results = useMemo(() => data?.pages.flatMap((p) => p.results) ?? [], [data]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && results.length > 0) {
        router.push(`/${results[0].id}`);
      }
    },
    [results, router]
  );

  const formatDate = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const hasQuery = debouncedQuery.trim().length > 0;
  const isInitialLoad = isFetching && !isFetched;

  return (
    <SidebarLayout activeSessionId="">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 text-ink">
        {/* Search section */}
        <div className="mt-16 mb-8 text-center md:mt-20">
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex" />}>
              <img
                src="/munjackgui-thinking.png"
                alt="치이카와"
                className="mx-auto mb-4 size-20 cursor-pointer rounded-full object-cover"
                style={{ backgroundColor: "var(--color-canvas-soft)" }}
              />
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8} align="center">
              <img
                src="/munjackgui-thinking.png"
                alt=""
                className="size-36 rounded-md bg-background object-cover"
              />
            </TooltipContent>
          </Tooltip>
          <h1 className="text-xl font-normal text-ink">대화 검색</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            예은님과 나눈 대화를 찾아볼 수 있어요…!
          </p>
        </div>

        {/* Search input */}
        <div className="relative mb-8 rounded-2xl border border-hairline bg-canvas-soft transition-shadow duration-200 focus-within:shadow-md">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="검색어를 입력해줘…!"
            className="w-full bg-transparent px-5 py-4 text-[15px] leading-relaxed text-ink outline-none placeholder:opacity-60"
          />
        </div>

        {/* Initial loading */}
        {isInitialLoad && (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-block size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              찾는 중…
            </div>
          </div>
        )}

        {/* No results */}
        {!isInitialLoad && isFetched && results.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              &ldquo;{debouncedQuery}&rdquo;에 대한 대화를 찾지 못했어…
            </p>
            <p className="mt-1 text-xs text-muted-soft">다른 검색어로 시도해볼래…?</p>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-3 pb-12">
            <p className="mb-4 text-xs font-medium text-muted-foreground">
              총 {results.length}
              {hasNextPage ? "+" : ""}개의 대화를 찾았어요…!
            </p>
            {results.map((r) => (
              <Link
                key={r.id}
                href={`/${r.id}`}
                className="group block rounded-xl border border-hairline bg-surface p-4 no-underline transition-all duration-150 hover:shadow-sm"
              >
                <h3 className="text-sm leading-snug font-medium text-ink transition-colors group-hover:opacity-80">
                  {r.title}
                </h3>
                {r.snippet && (
                  <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                    {r.snippet}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-soft">
                  <span>{formatDate(r.lastActivity)}</span>
                  <span>&middot;</span>
                  <span>메시지 {r.messageCount}개</span>
                </div>
              </Link>
            ))}

            {/* Sentinel for infinite scroll */}
            <div ref={sentinelRef} className="h-px" />

            {/* Loading more */}
            {isFetchingNextPage && (
              <div className="flex items-center justify-center py-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="inline-block size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  더 불러오는 중…
                </div>
              </div>
            )}

            {/* End of results */}
            {!hasNextPage && results.length >= 20 && (
              <p className="py-4 text-center text-xs text-muted-soft">
                모든 검색 결과를 불러왔어요…!
              </p>
            )}
          </div>
        )}

        {/* Empty state before search */}
        {!isFetching && !isFetched && !hasQuery && (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-soft">
            <Search className="mb-2 size-8 opacity-40" />
            <p>검색어를 입력하면 대화 기록을 찾아줄게…!</p>
          </div>
        )}
      </div>
    </SidebarLayout>
  );
};

export default SearchPage;
