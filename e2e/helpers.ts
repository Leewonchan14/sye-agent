import type { APIRequestContext, Page } from "@playwright/test";
import pg from "pg";

import { kst } from "../src/lib/kst";

const databaseUrl = process.env.E2E_DATABASE_URL ?? "";
if (!/\/[^/?]*e2e[^/?]*(\?|$)/.test(databaseUrl)) {
  throw new Error("E2E_DATABASE_URL은 이름에 e2e가 들어간 임시 DB여야 합니다.");
}

export const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });

export const today = () => kst().format("YYYY-MM-DD");
export const thisMonth = () => today().slice(0, 7);
export const lastMonth = () => kst().subtract(1, "month").format("YYYY-MM");
export const daysAgo = (days: number) => kst().subtract(days, "day").format("YYYY-MM-DD");

export const resetLedger = async () => {
  await pool.query(`
    truncate ledger_weekly_comments, auth_login_attempts, ledger_trips, ledger_entry_history, ledger_account, ledger_budgets, ledger_months,
      ledger_entries, ledger_categories, ledger_assets restart identity cascade
  `);
};

export const login = async (request: APIRequestContext): Promise<string> => {
  const res = await request.post("/api/auth", {
    data: { password: process.env.SITE_PASSWORD },
  });
  const { token } = (await res.json()) as { token: string };
  return token;
};

export const openLedger = async (page: Page, token: string) => {
  await page.addInitScript((value) => {
    localStorage.setItem(
      "trable-auth",
      JSON.stringify({ state: { token: value }, version: 0 })
    );
  }, token);
  await page.goto("/ledger");
  await page.getByRole("heading", { name: "가계부" }).waitFor();
  await page.getByRole("button", { name: "내역 추가" }).first().waitFor();
};

export const authHeaders = (token: string) => ({ "x-auth-token": token });

/** 기본 분류를 만들고 이름으로 찾을 수 있게 돌려준다. */
export const getCategories = async (request: APIRequestContext, token: string) => {
  const res = await request.get("/api/ledger", { headers: authHeaders(token) });
  const { ledger } = (await res.json()) as {
    ledger: { categories: { id: number; name: string; kind: string }[] };
  };
  return (name: string, kind = "expense") => {
    const category = ledger.categories.find((c) => c.name === name && c.kind === kind);
    if (!category) throw new Error(`분류 없음: ${name}`);
    return category.id;
  };
};

export const addEntry = async (
  request: APIRequestContext,
  token: string,
  entry: {
    entryDate: string;
    kind?: "expense" | "income";
    amount: number;
    categoryId?: number | null;
    memo?: string;
    entryTime?: string | null;
    tags?: string;
    tripId?: number | null;
  }
) => {
  const res = await request.post("/api/ledger/entries", {
    headers: authHeaders(token),
    data: { kind: "expense", ...entry },
  });
  if (!res.ok()) throw new Error(`기록 실패: ${await res.text()}`);
  return ((await res.json()) as { entry: { id: number } }).entry.id;
};
