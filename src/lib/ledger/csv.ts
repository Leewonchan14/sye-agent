import Papa from "papaparse";

import type { LedgerEntryView } from "@/lib/db/ledger";

/** Excel이 한글을 UTF-8로 읽도록 BOM을 붙이고, 수식으로 해석될 값은 이스케이프한다. */
export const ledgerEntriesToCsv = (entries: LedgerEntryView[]): string =>
  `﻿${Papa.unparse(
    entries.map((entry) => ({
      날짜: entry.entryDate,
      시각: entry.entryTime ?? "",
      구분: entry.kind === "income" ? "입금" : "지출",
      금액: entry.amount,
      분류: entry.categoryName ?? "분류 없음",
      내용: entry.memo,
      태그: entry.tags,
    })),
    { escapeFormulae: true }
  )}`;
