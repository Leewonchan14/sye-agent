"use client";

import { useEffect, useRef } from "react";

import { useInfiniteQuery } from "@tanstack/react-query";
import {
  Activity,
  CalendarHeart,
  ChevronUp,
  ExternalLink,
  FileText,
  LogOut,
  MessageCircle,
  Newspaper,
  Palmtree,
  PanelLeft,
  Search,
  Settings,
  SquarePen,
  Upload,
  Wallet,
} from "lucide-react";

import { useRouter } from "next/navigation";

import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuthStore } from "@/lib/auth-store";
import { dayjs } from "@/lib/kst";
import { cn } from "@/lib/utils";

const JEJU_URL = "https://jeju.성예은.shop";
const MONITOR_URL = "https://monitor.성예은.shop";

/** Sidebar entry that the current page belongs to. */
export type SidebarNav =
  | "ledger"
  | "monitor"
  | "dates"
  | "search"
  | "instructions"
  | "suggestions"
  | "kakao-chat";

interface Session {
  id: string;
  title: string;
  messageCount: number;
  lastActivity: string;
}

interface Props {
  activeSessionId: string;
  activeNav?: SidebarNav;
  onSelect: (id: string) => void;
  onNew: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

/** Frequently used in-app features, always visible. */
const APP_NAV = [
  { key: "ledger", href: "/ledger", label: "가계부", icon: Wallet },
  { key: "dates", href: "/dates", label: "데이트 추천", icon: CalendarHeart },
  { key: "monitor", href: "/monitor", label: "언론 모니터링", icon: Newspaper },
] as const;

/** Occasionally used chat settings, tucked into the footer menu. */
const SETTINGS_NAV = [
  { key: "instructions", href: "/instructions", label: "지시 사항", icon: FileText },
  { key: "suggestions", href: "/suggestions", label: "추천 질문", icon: MessageCircle },
  { key: "kakao-chat", href: "/kakao-chat", label: "카톡 업로드", icon: Upload },
] as const;

/** Sister sites on other subdomains. */
const EXTERNAL_LINKS = [
  { href: JEJU_URL, label: "제주 여행", icon: Palmtree },
  { href: MONITOR_URL, label: "모니터 사이트", icon: Activity },
] as const;

const SETTINGS_KEYS: readonly string[] = SETTINGS_NAV.map((n) => n.key);

const truncate = (t: string, n: number) => (t.length > n ? t.slice(0, n) + "..." : t);

interface MoreMenuProps {
  activeNav?: SidebarNav;
  collapsed: boolean;
}

/** Footer menu holding chat settings, sister-site links and logout. */
const MoreMenu = ({ activeNav, collapsed }: MoreMenuProps) => {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const inSettings = !!activeNav && SETTINGS_KEYS.includes(activeNav);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          collapsed ? (
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="설정 · 더보기"
              className={cn(inSettings && "bg-canvas-card text-ink")}
            />
          ) : (
            <Button
              variant="ghost"
              className={`w-full justify-start ${inSettings && "bg-canvas-card text-ink"}`}
            />
          )
        }
      >
        {collapsed ? (
          <Settings className="h-5 w-5" />
        ) : (
          <>
            <Settings className="h-4 w-4" />
            <span className="flex-1 text-left">설정 · 더보기</span>
            <ChevronUp className="h-4 w-4 text-muted-soft" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={collapsed ? "right" : "top"}
        align={collapsed ? "end" : "start"}
        className={cn(collapsed && "w-52")}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>채팅 설정</DropdownMenuLabel>
          {SETTINGS_NAV.map(({ key, href, label, icon: Icon }) => (
            <DropdownMenuItem
              key={key}
              onClick={() => router.push(href)}
              className={cn(activeNav === key && "bg-accent text-accent-foreground")}
            >
              <Icon />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>바로가기</DropdownMenuLabel>
          {EXTERNAL_LINKS.map(({ href, label, icon: Icon }) => (
            <DropdownMenuItem key={href} render={<a href={href} />}>
              <Icon />
              <span className="flex-1">{label}</span>
              <ExternalLink className="text-muted-soft" />
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout}>
          <LogOut />
          로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const SessionSidebar = ({
  activeSessionId,
  activeNav,
  onSelect,
  onNew,
  isOpen,
  onToggle,
}: Props) => {
  const tk = useAuthStore((s) => s.token);
  const router = useRouter();
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

  const css = (k: string) => `var(--${k})`;

  return (
    <aside
      className={`flex h-dvh shrink-0 flex-col overflow-hidden border-r border-hairline bg-canvas text-ink transition-all duration-200 ease-out ${
        isOpen ? "w-[288px]" : "w-13"
      }`}
    >
      {isOpen ? (
        <>
          {/* Header: brand + primary chat actions */}
          <div className="flex h-14 items-center gap-1 pr-2 pl-4">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Avatar size="sm">
                <AvatarImage src="/munjackgui.png" alt="하치와레" />
              </Avatar>
              <span className="truncate text-sm font-medium">하치와레 메이트</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/search")}
              aria-label="대화 검색"
              title="대화 검색"
              className={cn(activeNav === "search" && "bg-canvas-card text-ink")}
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onNew}
              aria-label="새 채팅"
              title="새 채팅"
            >
              <SquarePen className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              aria-label="Close sidebar"
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          </div>

          {/* In-app features */}
          <div className="space-y-1 px-3 pb-2">
            {APP_NAV.map(({ key, href, label, icon: Icon }) => (
              <Button
                key={key}
                variant="ghost"
                className={`w-full justify-start ${activeNav === key && "bg-canvas-card text-ink"}`}
                onClick={() => router.push(href)}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Button>
            ))}
          </div>

          {/* Session list */}
          <div className="mx-3 border-t border-hairline" />
          <div className="px-5 pt-3 pb-1 text-xs font-medium text-muted-soft">
            최근 대화
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <nav className="px-2 py-1">
              {!loading && !sessions.length && (
                <div className="px-3 py-4 text-xs text-muted-soft">
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
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors ${active && "bg-canvas-card text-ink"}`}
                    onMouseEnter={(e) => {
                      if (!active)
                        e.currentTarget.style.backgroundColor = css("color-canvas-soft");
                    }}
                    onMouseLeave={(e) => {
                      if (!active) e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <span className="flex-1 truncate">{truncate(s.title, 28)}</span>
                    <span className="shrink-0 text-[11px] text-muted-soft">
                      {dayjs(s.lastActivity).fromNow()}
                    </span>
                  </button>
                );
              })}
              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} className="h-px" />
              {isFetchingNextPage && (
                <div className="px-3 py-3 text-center text-xs text-muted-soft">
                  불러오는 중…
                </div>
              )}
            </nav>
          </ScrollArea>

          {/* Footer: settings, sister sites, logout */}
          <div className="border-t border-hairline px-3 py-2">
            <MoreMenu activeNav={activeNav} collapsed={false} />
          </div>
        </>
      ) : (
        /* Collapsed: Claude.ai-style icon-only strip */
        <div className="flex h-full flex-col items-center gap-2 py-3">
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={onToggle}
            aria-label="Open sidebar"
          >
            <PanelLeft className="h-5 w-5" />
          </Button>

          <Button variant="ghost" size="icon-lg" onClick={onNew} aria-label="새 채팅">
            <SquarePen className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon-lg"
            onClick={() => router.push("/search")}
            aria-label="대화 검색"
            className={cn(activeNav === "search" && "bg-canvas-card text-ink")}
          >
            <Search className="h-5 w-5" />
          </Button>

          <div className="my-1 w-6 border-t border-hairline" />

          {APP_NAV.map(({ key, href, label, icon: Icon }) => (
            <Button
              key={key}
              variant="ghost"
              size="icon-lg"
              onClick={() => router.push(href)}
              aria-label={label}
              className={cn(activeNav === key && "bg-canvas-card text-ink")}
            >
              <Icon className="h-5 w-5" />
            </Button>
          ))}

          {/* Spacer */}
          <div className="flex-1" />

          <MoreMenu activeNav={activeNav} collapsed />
        </div>
      )}
    </aside>
  );
};
