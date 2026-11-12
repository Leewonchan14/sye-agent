"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronsUpDown,
  FileText,
  LogOut,
  MessageSquarePlus,
  MessagesSquare,
  Newspaper,
  Search,
  Sparkles,
} from "lucide-react";

import { useEffect, useRef } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { signOut, useSession } from "@/lib/auth-client";
import { dayjs } from "@/lib/kst";
import { APP_NAME } from "@/lib/site";

export type AppNav = "monitor" | "search" | "instructions" | "suggestions";

interface SessionItem {
  id: string;
  title: string;
  messageCount: number;
  lastActivity: string;
}

const NAV_ITEMS: { key: AppNav; href: string; label: string; icon: typeof Search }[] = [
  { key: "monitor", href: "/monitor", label: "언론 모니터링", icon: Newspaper },
  { key: "search", href: "/search", label: "대화 검색", icon: Search },
];

const SETTING_ITEMS: { key: AppNav; href: string; label: string; icon: typeof Search }[] =
  [
    { key: "instructions", href: "/instructions", label: "지시 사항", icon: FileText },
    {
      key: "suggestions",
      href: "/suggestions",
      label: "예시 질문",
      icon: MessagesSquare,
    },
  ];

interface Props {
  activeSessionId?: string;
  activeNav?: AppNav;
}

export const AppSidebar = ({ activeSessionId, activeNav }: Props) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isMobile, setOpenMobile } = useSidebar();

  /** 모바일에서는 이동하면 시트를 닫는다. */
  const closeMobile = () => isMobile && setOpenMobile(false);

  const onNewChat = () => {
    closeMobile();
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
    router.push("/");
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" onClick={closeMobile} />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Sparkles className="size-4" />
              </div>
              <span className="truncate font-semibold">{APP_NAME}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="새 채팅" onClick={onNewChat}>
                  <MessageSquarePlus />
                  <span>새 채팅</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    tooltip={item.label}
                    isActive={activeNav === item.key}
                    render={<Link href={item.href} onClick={closeMobile} />}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>채팅 설정</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {SETTING_ITEMS.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    tooltip={item.label}
                    isActive={activeNav === item.key}
                    render={<Link href={item.href} onClick={closeMobile} />}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <RecentSessions activeSessionId={activeSessionId} onNavigate={closeMobile} />
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};

/* ── 최근 대화 (무한 스크롤) ── */

const RecentSessions = ({
  activeSessionId,
  onNavigate,
}: {
  activeSessionId?: string;
  onNavigate: () => void;
}) => {
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["sessions"],
      queryFn: async ({ pageParam }) => {
        const params = new URLSearchParams();
        if (pageParam) params.set("cursor", pageParam);
        const r = await fetch(`/api/sessions?${params}`);
        if (!r.ok) throw new Error("대화 목록을 불러오지 못했어요.");
        return (await r.json()) as { sessions: SessionItem[]; nextCursor: string | null };
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

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>최근 대화</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => (
              <SidebarMenuItem key={i}>
                <SidebarMenuSkeleton />
              </SidebarMenuItem>
            ))}
          {!isLoading && sessions.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              아직 대화가 없어요.
            </p>
          )}
          {sessions.map((s) => (
            <SidebarMenuItem key={s.id}>
              <SidebarMenuButton
                isActive={s.id === activeSessionId}
                title={`${s.title} · ${dayjs(s.lastActivity).fromNow()}`}
                render={<Link href={`/${s.id}`} onClick={onNavigate} />}
              >
                <span className="truncate">{s.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        <div ref={sentinelRef} className="h-px" />
        {isFetchingNextPage && <SidebarMenuSkeleton />}
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

/* ── 계정 메뉴 ── */

const NavUser = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isMobile } = useSidebar();
  const { data } = useSession();
  const user = data?.user;
  const initial = (user?.name || user?.email || "?").slice(0, 1).toUpperCase();

  const logout = async () => {
    await signOut();
    // 다른 사용자가 같은 브라우저로 로그인해도 이전 캐시가 보이지 않게 비운다.
    queryClient.clear();
    router.replace("/login");
    router.refresh();
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
              />
            }
          >
            <Avatar className="size-8 rounded-lg">
              <AvatarFallback className="rounded-lg">{initial}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user?.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {user?.email}
              </span>
            </div>
            <ChevronsUpDown className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <div className="grid text-left text-sm leading-tight">
                  <span className="truncate font-medium text-foreground">
                    {user?.name}
                  </span>
                  <span className="truncate text-xs">{user?.email}</span>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout}>
              <LogOut />
              로그아웃
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};
