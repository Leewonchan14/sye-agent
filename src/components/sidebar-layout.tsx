"use client";

import { useEffect } from "react";

import { usePathname, useRouter } from "next/navigation";

import { AppSidebar, type AppNav } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { useSession } from "@/lib/auth-client";

interface Props {
  children: React.ReactNode;
  /** 사이드바에서 강조할 대화 */
  activeSessionId?: string;
  /** 사이드바에서 강조할 메뉴 */
  activeNav?: AppNav;
  /** 상단 바 제목 */
  title?: string;
  /** 로그인 확인 중에 보여 줄 화면 */
  loading?: React.ReactNode;
}

const NAV_TITLES: Record<AppNav, string> = {
  monitor: "언론 모니터링",
  search: "대화 검색",
  instructions: "지시 사항",
  suggestions: "예시 질문",
};

/**
 * 로그인한 사용자용 공통 레이아웃 — shadcn Sidebar + 상단 바.
 * 세션이 없으면 로그인 화면으로 보낸다.
 */
export const SidebarLayout = ({
  children,
  activeSessionId,
  activeNav,
  title,
  loading,
}: Props) => {
  const router = useRouter();
  const pathname = usePathname();
  const { data, isPending } = useSession();

  useEffect(() => {
    if (isPending || data) return;
    const next =
      pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    router.replace(`/login${next}`);
  }, [isPending, data, pathname, router]);

  if (isPending || !data) {
    return (
      loading ?? (
        <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
          <Spinner />
        </div>
      )
    );
  }

  const heading = title ?? (activeNav ? NAV_TITLES[activeNav] : "채팅");

  return (
    <SidebarProvider className="h-dvh">
      <AppSidebar activeSessionId={activeSessionId} activeNav={activeNav} />
      <SidebarInset className="min-h-0 min-w-0">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-1 data-vertical:h-4 data-vertical:self-center"
          />
          <h1 className="truncate text-sm font-medium">{heading}</h1>
        </header>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};
