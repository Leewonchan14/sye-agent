"use client";

import { MessageSquare, PanelLeft, PanelLeftClose, Plus } from "lucide-react";

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

const T = (t: string, n: number) => (t.length > n ? t.slice(0, n) + "..." : t);

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
        width: isOpen ? 256 : 40,
        backgroundColor: css("color-canvas"),
        borderRight: `1px solid ${css("color-hairline")}`,
        color: css("color-ink"),
      }}
    >
      {isOpen ? (
        <>
          <div className="flex h-14 items-center justify-between px-4">
            <span className="text-sm font-medium">Designer</span>
            <button
              type="button"
              onClick={onToggle}
              className="rounded-md p-1.5 hover:opacity-70"
              style={{ color: css("color-muted") }}
              aria-label="Close"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
          <div className="px-3 pb-3">
            <button
              type="button"
              onClick={onNew}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm"
              style={{ color: css("color-ink") }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = css("color-canvas-soft"))
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              <Plus className="h-4 w-4" />새 채팅
            </button>
          </div>
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
              const a = s.id === activeSessionId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm"
                  style={{
                    backgroundColor: a ? css("color-canvas-card") : "transparent",
                    color: a ? css("color-ink") : css("color-muted"),
                  }}
                  onMouseEnter={(e) => {
                    if (!a)
                      e.currentTarget.style.backgroundColor = css("color-canvas-soft");
                  }}
                  onMouseLeave={(e) => {
                    if (!a) e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-50" />
                  <span className="flex-1 truncate">{T(s.title, 30)}</span>
                </button>
              );
            })}
          </nav>
          <div
            className="px-3 py-3"
            style={{ borderTop: `1px solid ${css("color-hairline")}` }}
          >
            <div
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
              style={{ color: css("color-muted") }}
            >
              <div
                className="flex size-7 items-center justify-center rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: css("color-primary") }}
              >
                W
              </div>
              <span className="flex-1">WonChan</span>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-4">
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md p-1.5 hover:opacity-70"
            style={{ color: css("color-muted") }}
            aria-label="Open"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        </div>
      )}
    </aside>
  );
};
