"use client";

import { useEffect, useRef } from "react";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Heart, LogOut, PanelLeft, Plus } from "lucide-react";

import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import { getDDay } from "@/lib/date-utils";

interface Session {
  id: string;
  title: string;
  messageCount: number;
  lastActivity: string;
}

interface Props {
  activeSessionId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

const truncate = (t: string, n: number) => (t.length > n ? t.slice(0, n) + "..." : t);

export const SessionSidebar = ({
  activeSessionId,
  onSelect,
  onNew,
  isOpen,
  onToggle,
}: Props) => {
  const tk = useAuthStore((s) => s.token);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const {
    data,
    isLoading: loading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["sessions"],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set("cursor", pageParam);
      const r = await fetch(`/api/sessions?${params}`, {
        headers: { "x-auth-token": tk },
      });
      const d = await r.json();
      return d as { sessions: Session[]; nextCursor: string | null };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 10_000,
  });

  const sessions = data?.pages.flatMap((p) => p.sessions) ?? [];

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const logout = useAuthStore((s) => s.logout);

  const css = (k: string) => `var(--${k})`;

  return (
    <aside
      className="flex h-dvh shrink-0 flex-col transition-all duration-200 ease-out"
      style={{
        width: isOpen ? 256 : 52,
        backgroundColor: css("color-canvas"),
        borderRight: `1px solid ${css("color-hairline")}`,
        color: css("color-ink"),
        overflow: "hidden",
      }}
    >
      {isOpen ? (
        <>
          {/* Header */}
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <Avatar size="sm">
                <AvatarImage src="/munjackgui.png" alt="치이카와" />
              </Avatar>
              <span className="text-sm font-medium">치이카와 데이트 메이트</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              aria-label="Close sidebar"
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          </div>

          {/* D-Day */}
          {(() => {
            const days = getDDay();
            if (days === null) return null;
            return (
              <div
                className="mx-3 mb-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs"
                style={{
                  backgroundColor: css("color-canvas-soft"),
                  color: css("color-muted"),
                }}
              >
                <Heart className="h-3 w-3 shrink-0" />
                <span>
                  예은님과 함께한 지{" "}
                  <span style={{ color: css("color-ink"), fontWeight: 600 }}>
                    {days}일째
                  </span>
                  …!
                </span>
              </div>
            );
          })()}

          {/* New Chat */}
          <div className="px-3 pb-3">
            <Button variant="ghost" className="w-full justify-start" onClick={onNew}>
              <Plus className="h-4 w-4" />새 채팅
            </Button>
          </div>

          {/* Session list */}
          <nav className="flex-1 overflow-y-auto px-2 py-1">
            {!loading && !sessions.length && (
              <div
                className="px-3 py-4 text-xs"
                style={{ color: css("color-muted-soft") }}
              >
                아직 채팅이 없습니다
              </div>
            )}
            {sessions.map((s) => {
              const active = s.id === activeSessionId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors"
                  style={{
                    backgroundColor: active ? css("color-canvas-card") : "transparent",
                    color: active ? css("color-ink") : css("color-muted"),
                  }}
                  onMouseEnter={(e) => {
                    if (!active)
                      e.currentTarget.style.backgroundColor = css("color-canvas-soft");
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <span className="flex-1 truncate">{truncate(s.title, 28)}</span>
                </button>
              );
            })}
            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-px" />
            {isFetchingNextPage && (
              <div
                className="px-3 py-3 text-center text-xs"
                style={{ color: css("color-muted-soft") }}
              >
                불러오는 중…
              </div>
            )}
          </nav>

          {/* Logout */}
          <div className="px-3 pb-3">
            <Button variant="ghost" className="w-full justify-start" onClick={logout}>
              <LogOut className="h-4 w-4" />
              로그아웃
            </Button>
          </div>
        </>
      ) : (
        /* Collapsed: Claude.ai-style icon-only strip */
        <div className="flex h-full flex-col items-center gap-2 py-3">
          {/* Open toggle */}
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={onToggle}
            aria-label="Open sidebar"
          >
            <PanelLeft className="h-5 w-5" />
          </Button>

          {/* New Chat */}
          <Button variant="ghost" size="icon-lg" onClick={onNew} aria-label="New chat">
            <Plus className="h-5 w-5" />
          </Button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Logout */}
          <Button variant="ghost" size="icon-lg" onClick={logout} aria-label="Logout">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      )}
    </aside>
  );
};
