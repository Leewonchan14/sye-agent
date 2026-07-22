"use client";

import { useCallback, useRef, useState } from "react";

import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/lib/auth-store";

interface PasswordGateProps {
  onSuccess: () => void;
}

export const PasswordGate = ({ onSuccess }: PasswordGateProps) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isShaking, setIsShaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(
    async (e?: React.SyntheticEvent) => {
      e?.preventDefault();
      if (!password.trim()) return;

      setIsLoading(true);
      setError("");

      try {
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });

        const data = await res.json();

        if (data.success) {
          login(data.token);
          onSuccess();
        } else {
          setError(data.error || "비밀번호가 틀렸습니다.");
          setIsShaking(true);
          setTimeout(() => setIsShaking(false), 500);
          setPassword("");
          inputRef.current?.focus();
        }
      } catch {
        setError("서버에 연결할 수 없습니다.");
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);
      } finally {
        setIsLoading(false);
      }
    },
    [password, onSuccess, login]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSubmit();
    },
    [handleSubmit]
  );

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center px-4 py-32"
      style={{ backgroundColor: "var(--color-canvas)" }}
    >
      <form
        onSubmit={handleSubmit}
        className={`flex w-80 max-w-full flex-col items-center gap-5 rounded-xl border p-8 ${
          isShaking ? "animate-shake" : ""
        }`}
        style={{
          borderColor: "var(--color-hairline)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <Image
          src="/munjackgui.png"
          alt="munjackgu"
          width={80}
          height={80}
          className="rounded-full border-2 border-primary"
          priority
        />

        <h1 className="text-lg font-medium" style={{ color: "var(--color-ink)" }}>
          하치와레 메이트
        </h1>

        <p
          className="text-center text-xs leading-relaxed"
          style={{ color: "var(--color-muted)" }}
        >
          알고 있어?〜 100일케이크 밑판에 적힌 문구…
          <br />
          그게 힌트…라는 거야!?
          <br />
          띄워쓰기 없이, 느낌표 없이 입력하는 거야…!
        </p>

        <div className="w-full space-y-3">
          <Input
            ref={inputRef}
            type="text"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            className="border-primary! text-center tracking-widest focus-visible:ring-0"
            autoFocus
            autoComplete="off"
          />

          <Button
            type="submit"
            className="w-full border border-primary"
            disabled={isLoading || !password.trim()}
          >
            {isLoading ? "확인 중..." : "입장하기"}
          </Button>
        </div>

        {error && (
          <p className="text-sm font-medium" style={{ color: "var(--color-error)" }}>
            {error}
          </p>
        )}
      </form>
    </div>
  );
};
