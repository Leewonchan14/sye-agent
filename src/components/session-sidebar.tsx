"use client";

import { MessageSquare, MoreHorizontal, PanelLeftClose, Plus } from "lucide-react";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

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
        if (data.sessions) {
          setSessions(data.sessions);
        }
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
      className={`flex h-screen flex-col bg-sidebar text-sidebar-foreground transition-all duration-200 ease-out ${
        isOpen ? "w-64 border-r border-sidebar-border" : "w-0 overflow-hidden"
      }`}
    >
      {/* Brand + toggle */}
      <div className="flex h-14 items-center justify-between px-4">
        {isOpen && <span className="text-sm font-medium tracking-tight">Designer</span>}
        <button
          type="button"
          onClick={onToggle}
          className="rounded-md p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent transition-colors"
          aria-label={isOpen ? "Close sidebar" : "Open sidebar"}
        >
          {isOpen ? <PanelLeftClose className="h-4 w-4" /> : null}
        </button>
      </div>

      {isOpen && (
        <>
          {/* New Chat */}
          <div className="px-3 pb-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onNew}
              className="w-full justify-start gap-2 text-sm font-normal text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <Plus className="h-4 w-4" />새 채팅
            </Button>
          </div>

          {/* Section header */}
          <div className="flex items-center justify-between px-4 py-1">
            <span className="text-xs font-medium text-sidebar-foreground/60">
              최근 항목
            </span>
          </div>

          {/* Session list */}
          <nav className="flex-1 overflow-y-auto px-2 py-1">
            {loading && sessions.length === 0 && (
              <div className="px-2 py-4 text-xs text-sidebar-foreground/40">
                불러오는 중...
              </div>
            )}

            {!loading && sessions.length === 0 && (
              <div className="px-2 py-4 text-xs text-sidebar-foreground/40">
                아직 채팅이 없습니다
              </div>
            )}

            {sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => onSelect(session.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50"
                  }`}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  <span className="flex-1 truncate">{truncate(session.title, 30)}</span>
                </button>
              );
            })}
          </nav>

          {/* Bottom user area */}
          <div className="px-3 py-3">
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/60">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                W
              </div>
              <span className="flex-1">WonChan</span>
              <MoreHorizontal className="h-3.5 w-3.5" />
            </div>
          </div>
        </>
      )}
    </aside>
  );
};
