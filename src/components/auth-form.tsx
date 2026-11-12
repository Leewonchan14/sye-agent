"use client";

import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Sparkles } from "lucide-react";

import { useState } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { signIn, signUp } from "@/lib/auth-client";
import { APP_NAME } from "@/lib/site";

type Mode = "login" | "signup";

const COPY: Record<
  Mode,
  { title: string; description: string; submit: string; switchText: string }
> = {
  login: {
    title: "로그인",
    description: "이메일과 비밀번호로 로그인하세요.",
    submit: "로그인",
    switchText: "계정이 없나요?",
  },
  signup: {
    title: "회원가입",
    description: "이메일로 새 계정을 만드세요.",
    submit: "가입하기",
    switchText: "이미 계정이 있나요?",
  },
};

/** Better Auth 오류 코드를 사용자 문구로 바꾼다. */
const errorText = (error: { code?: string; message?: string; status?: number }) => {
  if (error.status === 429) return "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "이메일 또는 비밀번호가 올바르지 않아요.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "이미 가입된 이메일이에요.";
    case "PASSWORD_TOO_SHORT":
      return "비밀번호는 8자 이상이어야 해요.";
    case "PASSWORD_TOO_LONG":
      return "비밀번호가 너무 길어요.";
    case "INVALID_EMAIL":
      return "이메일 형식이 올바르지 않아요.";
    default:
      return error.message || "요청을 처리하지 못했어요.";
  }
};

/** 다른 사이트로 튕기지 않도록 같은 사이트 경로만 받는다. */
const safeNext = (value: string | null) =>
  value && value.startsWith("/") && !value.startsWith("//") ? value : "/";

export const AuthForm = ({ mode }: { mode: Mode }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const copy = COPY[mode];

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      const result =
        mode === "login"
          ? await signIn.email({ email: email.trim(), password })
          : await signUp.email({
              email: email.trim(),
              password,
              name: name.trim() || email.trim().split("@")[0],
            });
      if (result.error) throw new Error(errorText(result.error));
    },
    onSuccess: () => {
      router.replace(next);
      router.refresh();
    },
  });

  const switchHref = `${mode === "login" ? "/signup" : "/login"}${
    next !== "/" ? `?next=${encodeURIComponent(next)}` : ""
  }`;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-center gap-2 font-medium">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          {APP_NAME}
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{copy.title}</CardTitle>
            <CardDescription>{copy.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit.mutate();
              }}
            >
              <FieldGroup>
                {mode === "signup" && (
                  <Field>
                    <FieldLabel htmlFor="name">이름</FieldLabel>
                    <Input
                      id="name"
                      name="name"
                      autoComplete="name"
                      placeholder="홍길동"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </Field>
                )}
                <Field>
                  <FieldLabel htmlFor="email">이메일</FieldLabel>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">비밀번호</FieldLabel>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    minLength={8}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {mode === "signup" && (
                    <FieldDescription>8자 이상으로 정해 주세요.</FieldDescription>
                  )}
                </Field>
                {submit.isError && (
                  <Alert variant="destructive">
                    <AlertCircle />
                    <AlertDescription>{submit.error.message}</AlertDescription>
                  </Alert>
                )}
                <Field>
                  <Button type="submit" disabled={submit.isPending}>
                    {submit.isPending && <Spinner />}
                    {copy.submit}
                  </Button>
                  <FieldDescription className="text-center">
                    {copy.switchText}{" "}
                    <Link href={switchHref}>
                      {mode === "login" ? "회원가입" : "로그인"}
                    </Link>
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
