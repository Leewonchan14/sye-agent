import type { Metadata } from "next";

import { Suspense } from "react";

import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "로그인" };

const Page = () => (
  <Suspense>
    <AuthForm mode="login" />
  </Suspense>
);

export default Page;
