"use client";

import { PanelLeft, Plus } from "lucide-react";

import { useQuery } from "@tanstack/react-query";

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

const truncate = (t: string, n: number) =>
  t.length > n ? t.slice(0, n) + "..." : t;

export const SessionSidebar = ({
  activeSessionId,
  onSelect,
  onNew,
  isOpen,
  onToggle,
}: Props) => {
  const { data: sessions = [], isLoading: loading } = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const tk = localStorage.getItem("auth_token") ?? "";
      const r = await fetch("/api/sessions", { headers: { "x-auth-token": tk } });
      const d = await r.json();
      return (d.sessions ?? []) as Session[];
    },
    staleTime: 10_000,
  });

  const css = (k: string) => `var(--${k})`;

  const btnHover = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.backgroundColor = css("color-canvas-soft");
  };
  const btnLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.backgroundColor = "transparent";
  };

  return (
    <aside
      className="flex h-screen shrink-0 flex-col transition-all duration-200 ease-out"
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
              <img
                src="/munjackgui.png"
                alt="치이카와"
                className="size-6 rounded-full object-cover"
                draggable={false}
              />
              <span className="text-sm font-medium">치이카와 데이트 메이트</span>
            </div>
            <button
              type="button"
              onClick={onToggle}
              className="rounded-md p-1.5 hover:opacity-70"
              style={{ color: css("color-muted") }}
              aria-label="Close sidebar"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          </div>

          {/* New Chat */}
          <div className="px-3 pb-3">
            <button
              type="button"
              onClick={onNew}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
              style={{ color: css("color-body") }}
              onMouseEnter={btnHover}
              onMouseLeave={btnLeave}
            >
              <Plus className="h-4 w-4" />
              새 채팅
            </button>
          </div>

          {/* Session list */}
          <nav className="flex-1 overflow-y-auto px-2 py-1">
            {!loading && !sessions.length && (
              <div className="px-3 py-4 text-xs" style={{ color: css("color-muted-soft") }}>
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
                    if (!active) e.currentTarget.style.backgroundColor = css("color-canvas-soft");
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <span className="flex-1 truncate">{truncate(s.title, 28)}</span>
                </button>
              );
            })}
          </nav>


        </>
      ) : (
        /* Collapsed: Claude.ai-style icon-only strip */
        <div className="flex h-full flex-col items-center gap-2 py-3">
          {/* Open toggle */}
          <button
            type="button"
            onClick={onToggle}
            className="flex h-9 w-full items-center justify-center rounded-md hover:opacity-70"
            style={{ color: css("color-muted") }}
            aria-label="Open sidebar"
          >
            <PanelLeft className="h-5 w-5" />
          </button>

          {/* New Chat */}
          <button
            type="button"
            onClick={onNew}
            className="flex h-9 w-full items-center justify-center rounded-md transition-colors"
            style={{ color: css("color-body") }}
            onMouseEnter={btnHover}
            onMouseLeave={btnLeave}
            aria-label="New chat"
          >
            <Plus className="h-5 w-5" />
          </button>

        </div>
      )}
    </aside>
  );
};
