"use client";

import { Heart, MessageSquare, PanelLeftClose, Plus } from "lucide-react";

import { useEffect, useState } from "react";

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
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const tk = localStorage.getItem("auth_token") ?? "";
        const r = await fetch("/api/sessions", { headers: { "x-auth-token": tk } });
        const d = await r.json();
        if (d.sessions) setSessions(d.sessions);
      } catch {
        /* noop */
      } finally {
        setLoading(false);
      }
    })();
  }, [activeSessionId]);

  const css = (k: string) => `var(--${k})`;

  return (
    <aside
      className="flex h-screen shrink-0 flex-col transition-all duration-200 ease-out"
      style={{
        width: isOpen ? 256 : 0,
        backgroundColor: css("color-canvas"),
        borderRight: `1px solid ${css("color-hairline")}`,
        color: css("color-ink"),
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Heart
            className="h-4 w-4"
            strokeWidth={1.5}
            style={{ color: css("color-primary") }}
          />
          <span className="text-sm font-medium">Designer</span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-md p-1.5 hover:opacity-70"
          style={{ color: css("color-muted") }}
          aria-label="Close sidebar"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* New Chat button — Claude.ai link style */}
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
          style={{ color: css("color-body") }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = css("color-canvas-soft"))
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "transparent")
          }
        >
          <Plus className="h-4 w-4" />
          새 채팅
        </button>
      </div>

      {/* Session list */}
      <nav className="flex-1 overflow-y-auto px-2 py-1">
        {loading && !sessions.length && (
          <div
            className="px-3 py-4 text-xs"
            style={{ color: css("color-muted-soft") }}
          >
            불러오는 중...
          </div>
        )}
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
              <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-50" />
              <span className="flex-1 truncate">{truncate(s.title, 28)}</span>
            </button>
          );
        })}
      </nav>

      {/* Profile footer */}
      <div
        className="px-3 py-3"
        style={{ borderTop: `1px solid ${css("color-hairline")}` }}
      >
        <div
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5"
        >
          <div
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium text-white"
            style={{ backgroundColor: css("color-primary") }}
          >
            W
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="truncate text-xs font-medium" style={{ color: css("color-ink") }}>
              원찬 & 예은
            </span>
            <span className="text-[11px]" style={{ color: css("color-muted-soft") }}>
              여행 메이트
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
