"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu, Plus } from "lucide-react";
import useLocalStorageState from "use-local-storage-state";

import { useCallback, useState } from "react";

import { useRouter } from "next/navigation";

import { PasswordGate } from "@/components/password-gate";
import { SessionSidebar } from "@/components/session-sidebar";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";

interface Props {
  children: React.ReactNode;
  /** Highlight this session in the sidebar. Empty string for search page. */
  activeSessionId?: string;
  /** Custom loading state */
  loading?: React.ReactNode;
}

/**
 * Shared layout that wraps any page with:
 * 1. Auth validation (PasswordGate)
 * 2. Desktop sidebar (SessionSidebar)
 * 3. Mobile top bar + sidebar overlay
 */
export const SidebarLayout = ({ children, activeSessionId = "", loading }: Props) => {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useLocalStorageState("sidebar_open", {
    defaultValue: false,
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();

  const {
    data: isValid,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["auth-validate", token ?? ""],
    queryFn: async () => {
      if (!token) return await new Promise((res) => setTimeout(() => res(false), 3000));
      const r = await fetch("/api/auth", {
        headers: { "x-auth-token": token },
      });
      const d = await r.json();
      return d.valid === true;
    },
    retry: 1,
    staleTime: 0,
  });

  const onNew = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
    router.push("/");
  }, [router, queryClient]);

  const onSelect = useCallback(
    (id: string) => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      router.push(`/${id}`);
    },
    [router, queryClient]
  );

  const toggle = useCallback(() => setSidebarOpen((p) => !p), [setSidebarOpen]);

  if (isLoading) {
    return (
      <div
        className="flex min-h-dvh flex-col"
        style={{ backgroundColor: "var(--color-canvas)" }}
      >
        {loading}
      </div>
    );
  }

  if (!token || isValid === false || isError) {
    return <PasswordGate onSuccess={() => {}} />;
  }

  return (
    <div
      className="relative flex h-dvh flex-col md:flex-row"
      style={{ backgroundColor: "var(--color-canvas)" }}
    >
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <SessionSidebar
          activeSessionId={activeSessionId}
          onSelect={onSelect}
          onNew={onNew}
          isOpen={sidebarOpen}
          onToggle={toggle}
        />
      </div>

      {/* Mobile top bar */}
      <div
        className="flex h-12 shrink-0 items-center gap-2 px-3 md:hidden"
        style={{ borderBottom: "1px solid var(--color-hairline)" }}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <Avatar size="sm">
          <AvatarImage src="/munjackgui.png" alt="하치와레" />
        </Avatar>
        <span
          className="flex-1 text-sm font-medium"
          style={{ color: "var(--color-ink)" }}
        >
          하치와레 메이트
        </span>
        <Button variant="ghost" size="icon" onClick={onNew} aria-label="New chat">
          <Plus className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={logout} aria-label="Logout">
          <LogOut className="h-5 w-5" />
        </Button>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative h-full w-64">
            <SessionSidebar
              activeSessionId={activeSessionId}
              onSelect={(id) => {
                onSelect(id);
                setMobileMenuOpen(false);
              }}
              onNew={() => {
                onNew();
                setMobileMenuOpen(false);
              }}
              isOpen={true}
              onToggle={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
    </div>
  );
};
