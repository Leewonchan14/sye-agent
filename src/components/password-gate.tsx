"use client";

import { Cloud, MapPin } from "lucide-react";

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
    async (e?: React.FormEvent) => {
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
      if (e.key === "Enter") {
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-32">
      <form
        onSubmit={handleSubmit}
        className={`flex w-full max-w-sm flex-col items-center gap-6 rounded-xl border bg-card p-8 shadow-sm $
          isShaking ? "animate-shake" : ""
        }`}
      >
        <div className="flex items-center gap-1 text-warm-accent">
          <Cloud className="h-8 w-8" />
          <MapPin className="h-6 w-6" />
        </div>

        <h1 className="text-xl font-semibold text-foreground">Designer</h1>

        <p className="text-center text-sm text-muted-foreground">
          비밀번호를 입력해주세요
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
            className="text-center text-lg tracking-widest"
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

        {error && <p className="text-sm font-medium text-destructive">{error}</p>}

        <p className="text-center text-xs text-muted-foreground">
          우리의 첫 만남일을 기념하는 특별한 여행 플래너
        </p>
      </form>
    </div>
  );
};
