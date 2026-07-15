"use client";

import { Heart } from "lucide-react";

import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PasswordGateProps {
  onSuccess: () => void;
}

export const PasswordGate = ({ onSuccess }: PasswordGateProps) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isShaking, setIsShaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
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
          localStorage.setItem("auth_0411", "true");
          localStorage.setItem("auth_token", data.token);
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
    [password, onSuccess]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSubmit();
    },
    [handleSubmit]
  );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-32" style={{ backgroundColor: "var(--color-canvas)" }}>
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
        <Heart
          className="h-8 w-8"
          strokeWidth={1.2}
          style={{ color: "var(--color-primary)" }}
        />

        <h1 className="text-lg font-medium" style={{ color: "var(--color-ink)" }}>
          Designer
        </h1>

        <p className="text-center text-sm" style={{ color: "var(--color-muted)" }}>
          둘만의 공간에 오신 걸 환영합니다
        </p>

        <div className="w-full space-y-3">
          <Input
            ref={inputRef}
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            className="text-center tracking-widest"
            autoFocus
            autoComplete="off"
          />

          <Button
            type="submit"
            className="w-full"
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

        <p className="text-center text-xs" style={{ color: "var(--color-muted-soft)" }}>
          원찬 & 예은의 특별한 여행 플래너
        </p>
      </form>
    </div>
  );
};
