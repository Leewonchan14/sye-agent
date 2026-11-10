import { requireAuth } from "@/lib/auth";
import {
  createLedgerRecurring,
  deleteLedgerRecurring,
  setLedgerRecurringActive,
  type LedgerRecurringInput,
} from "@/lib/db/ledger-recurring";
import { ledgerErrorResponse, readJsonBody } from "@/lib/ledger/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const badBody = () =>
  Response.json({ error: "요청 본문이 올바르지 않아요." }, { status: 400 });

export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body) return badBody();

  try {
    const recurring = await createLedgerRecurring(body as LedgerRecurringInput);
    return Response.json({ recurring }, { status: 201 });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "반복 거래를 저장하지 못했어요." });
  }
};

/** 켜기·끄기만 바꾼다. */
export const PATCH = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body) return badBody();

  try {
    const recurring = await setLedgerRecurringActive(body);
    return Response.json({ recurring });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "반복 거래를 바꾸지 못했어요." });
  }
};

export const DELETE = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body) return badBody();

  try {
    await deleteLedgerRecurring(body);
    return Response.json({ ok: true });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "반복 거래를 삭제하지 못했어요." });
  }
};
