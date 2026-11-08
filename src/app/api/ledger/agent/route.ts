import {
  createLedgerEntriesBulk,
  deleteLedgerEntry,
  getLedgerAccount,
  getLedgerMonth,
  type LedgerBulkEntryInput,
} from "@/lib/db/ledger";
import { kst } from "@/lib/kst";
import { requireLedgerAgent } from "@/lib/ledger/agent";
import { ledgerErrorResponse, readJsonBody } from "@/lib/ledger/api";
import { getBudgetPace } from "@/lib/ledger/pace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hermes가 읽는 이번 달 요약. */
export const GET = async (req: Request) => {
  const authError = requireLedgerAgent(req);
  if (authError) return authError;

  try {
    const today = kst().format("YYYY-MM-DD");
    const ledger = await getLedgerMonth(today.slice(0, 7));
    const categoryName = new Map(ledger.categories.map((c) => [c.id, c.name]));
    const spentByCategory = new Map(
      ledger.byCategory.map((row) => [row.categoryId, row.amount])
    );

    return Response.json({
      today,
      balance: ledger.account.currentBalance,
      month: ledger.month,
      income: ledger.summary.income,
      expense: ledger.summary.expense,
      budget: {
        total: ledger.budget.totalBudget,
        remaining: ledger.summary.budgetRemaining,
        usedPct: ledger.summary.budgetUsedPct,
        pace: getBudgetPace({
          month: ledger.month,
          today,
          budget: ledger.budget.totalBudget,
          spent: ledger.summary.expense,
        }),
        byCategory: ledger.budget.byCategory.map((row) => ({
          category: categoryName.get(row.categoryId),
          budget: row.amount,
          spent: spentByCategory.get(row.categoryId) ?? 0,
        })),
      },
      categories: {
        expense: ledger.categories.filter((c) => c.kind === "expense").map((c) => c.name),
        income: ledger.categories.filter((c) => c.kind === "income").map((c) => c.name),
      },
      recent: ledger.entries.slice(0, 20).map((entry) => ({
        id: entry.id,
        date: entry.entryDate,
        time: entry.entryTime,
        kind: entry.kind,
        amount: entry.amount,
        category: entry.categoryName,
        memo: entry.memo,
      })),
    });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "가계부를 불러오지 못했어요." });
  }
};

interface AgentEntryInput {
  date?: string;
  time?: string | null;
  kind?: LedgerBulkEntryInput["kind"];
  amount: number;
  category?: string | null;
  memo?: string;
  tags?: string;
}

export const POST = async (req: Request) => {
  const authError = requireLedgerAgent(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body || !Array.isArray(body.entries)) {
    return Response.json({ error: "entries 배열이 필요해요." }, { status: 400 });
  }

  try {
    const today = kst().format("YYYY-MM-DD");
    const { created, skipped } = await createLedgerEntriesBulk(
      (body.entries as AgentEntryInput[]).map((entry) => ({
        entryDate: entry?.date ?? today,
        entryTime: entry?.time,
        kind: entry?.kind ?? "expense",
        amount: entry?.amount,
        categoryName: entry?.category,
        memo: entry?.memo,
        tags: entry?.tags,
      })),
      { source: "agent", allowDuplicates: body.allowDuplicates === true }
    );
    const account = await getLedgerAccount();

    return Response.json(
      {
        created: created.map((entry) => ({
          id: entry.id,
          date: entry.entryDate,
          time: entry.entryTime,
          kind: entry.kind,
          amount: entry.amount,
          memo: entry.memo,
        })),
        skipped,
        balance: account.currentBalance,
      },
      { status: 201 }
    );
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "기록을 저장하지 못했어요." });
  }
};

export const DELETE = async (req: Request) => {
  const authError = requireLedgerAgent(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body) {
    return Response.json({ error: "요청 본문이 올바르지 않아요." }, { status: 400 });
  }

  try {
    await deleteLedgerEntry(body.id as number, "agent");
    const account = await getLedgerAccount();
    return Response.json({ ok: true, balance: account.currentBalance });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "기록을 지우지 못했어요." });
  }
};
