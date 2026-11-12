import type { Metadata } from "next";

import { Suspense } from "react";

import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "회원가입" };

const Page = () => (
  <Suspense>
    <AuthForm mode="signup" />
  </Suspense>
);

export default Page;
