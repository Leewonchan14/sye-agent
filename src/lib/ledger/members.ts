import { kst } from "@/lib/kst";

export type LedgerMember = "wonchan" | "yeeun" | "joint";

interface LedgerMemberInfo {
  id: LedgerMember;
  name: string;
  tone: string;
  bar: string;
}

export const LEDGER_MEMBERS: LedgerMemberInfo[] = [
  {
    id: "wonchan",
    name: "원찬",
    tone: "bg-primary/10 text-primary ring-primary/20",
    bar: "bg-primary",
  },
  {
    id: "yeeun",
    name: "예은",
    tone: "bg-canvas-card text-body-strong ring-hairline",
    bar: "bg-canvas-strong",
  },
  {
    id: "joint",
    name: "공동",
    tone: "bg-canvas-soft text-body-strong ring-hairline",
    bar: "bg-canvas-strong",
  },
];

export const memberName = (member: LedgerMember): string =>
  LEDGER_MEMBERS.find((m) => m.id === member)?.name ?? member;

export const memberTone = (member: LedgerMember): string =>
  LEDGER_MEMBERS.find((m) => m.id === member)?.tone ?? "";

export const memberBar = (member: LedgerMember): string =>
  LEDGER_MEMBERS.find((m) => m.id === member)?.bar ?? "bg-primary";

/** 12,000원 */
export const formatWon = (amount: number): string =>
  `${amount.toLocaleString("ko-KR")}원`;

/** 좁은 달력 칸용: 22,000 → 2.2만 / 3,200,000 → 320만 */
export const formatCompactWon = (amount: number): string => {
  if (amount >= 100_000_000) {
    const eok = amount / 100_000_000;
    return `${Number(eok.toFixed(eok >= 10 ? 0 : 1))}억`;
  }
  if (amount >= 10_000) {
    const man = amount / 10_000;
    return `${Number(man.toFixed(man >= 100 ? 0 : 1))}만`;
  }
  return amount.toLocaleString("ko-KR");
};

export const currentMonthKst = (): string => kst().format("YYYY-MM");

export const todayKst = (): string => kst().format("YYYY-MM-DD");

/** 2026-11 → 2026년 11월 */
export const formatMonthKo = (month: string): string =>
  kst(`${month}-01`).format("YYYY년 M월");

/** 2026-11-02 → 11월 2일 (월) */
export const formatDayKo = (date: string): string => kst(date).format("M월 D일 (ddd)");

export const shiftMonth = (month: string, delta: number): string =>
  kst(`${month}-01`).add(delta, "month").format("YYYY-MM");
