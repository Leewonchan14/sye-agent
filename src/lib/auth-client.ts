import { createAuthClient } from "better-auth/react";

/** 브라우저용 Better Auth 클라이언트 — 같은 출처의 `/api/auth`를 쓴다. */
export const authClient = createAuthClient();

export const { useSession, signIn, signUp, signOut } = authClient;
