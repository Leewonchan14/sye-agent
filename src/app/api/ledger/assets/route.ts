import { requireAuth } from "@/lib/auth";
import {
  createLedgerAsset,
  deleteLedgerAsset,
  updateLedgerAsset,
  type LedgerAssetInput,
  type LedgerAssetUpdate,
} from "@/lib/db/ledger";
import { ledgerErrorResponse, readJsonBody } from "@/lib/ledger/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body) {
    return Response.json({ error: "요청 본문이 올바르지 않아요." }, { status: 400 });
  }

  try {
    const asset = await createLedgerAsset(body as unknown as LedgerAssetInput);
    return Response.json({ asset });
  } catch (error) {
    return ledgerErrorResponse(error, {
      fallback: "결제수단을 추가하지 못했어요.",
      duplicate: "같은 이름의 결제수단이 이미 있어요.",
    });
  }
};

export const PATCH = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body) {
    return Response.json({ error: "요청 본문이 올바르지 않아요." }, { status: 400 });
  }

  try {
    const asset = await updateLedgerAsset(body as unknown as LedgerAssetUpdate);
    return Response.json({ asset });
  } catch (error) {
    return ledgerErrorResponse(error, {
      fallback: "결제수단을 수정하지 못했어요.",
      duplicate: "같은 이름의 결제수단이 이미 있어요.",
    });
  }
};

export const DELETE = async (req: Request) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const body = await readJsonBody(req);
  if (!body) {
    return Response.json({ error: "요청 본문이 올바르지 않아요." }, { status: 400 });
  }

  try {
    await deleteLedgerAsset(body.id as number);
    return Response.json({ ok: true });
  } catch (error) {
    return ledgerErrorResponse(error, { fallback: "결제수단을 삭제하지 못했어요." });
  }
};
