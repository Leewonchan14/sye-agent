"use client";

import { MessageSquare, PanelLeft, PanelLeftClose, Plus, User } from "lucide-react";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

interface Session {
  id: string;
  title: string;
  messageCount: number;
  lastActivity: string;
}

interface SessionSidebarProps {
  activeSessionId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

const truncate = (text: string, max: number): string =>
  text.length > max ? text.slice(0, max) + "..." : text;

export const SessionSidebar = ({
  activeSessionId,
  onSelect,
  onNew,
  isOpen,
  onToggle,
}: SessionSidebarProps) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem("auth_token") ?? "";
        const res = await fetch("/api/sessions", {
          headers: { "x-auth-token": token },
        });
        const data = await res.json();
        if (data.sessions) setSessions(data.sessions);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeSessionId]);

  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-all duration-200 ease-out",
        isOpen ? "w-64" : "w-10"
      )}
    >
      {isOpen ? (
        /* ── Expanded ── */
        <>
          <div className="flex h-14 items-center justify-between px-4">
            <span className="text-sm font-medium tracking-tight">Designer</span>
            <button
              type="button"
              onClick={onToggle}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent transition-colors"
              aria-label="Close sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>

          <div className="px-3 pb-3">
            <button
              type="button"
              onClick={onNew}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
            >
              <Plus className="h-4 w-4" />새 채팅
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-2 py-1">
            {loading && sessions.length === 0 && (
              <div className="px-3 py-4 text-xs text-muted-foreground">
                불러오는 중...
              </div>
            )}
            {!loading && sessions.length === 0 && (
              <div className="px-3 py-4 text-xs text-muted-foreground">
                아직 채팅이 없습니다
              </div>
            )}
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelect(session.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                  session.id === activeSessionId
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                )}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-50" />
                <span className="flex-1 truncate">{truncate(session.title, 30)}</span>
              </button>
            ))}
          </nav>

          <div className="px-3 py-3">
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground">
              <div className="flex size-7 items-center justify-center rounded-full bg-muted">
                <User className="h-3.5 w-3.5" />
              </div>
              <span className="flex-1">WonChan</span>
            </div>
          </div>
        </>
      ) : (
        /* ── Collapsed: thin rail ── */
        <div className="flex flex-col items-center gap-3 py-4">
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent transition-colors"
            aria-label="Open sidebar"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        </div>
      )}
    </aside>
  );
};
