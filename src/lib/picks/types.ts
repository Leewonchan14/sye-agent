import { z } from "zod";

export const MIN_PICK_OPTIONS = 2;
export const MAX_PICK_OPTIONS = 12;
export const MAX_PICK_LABEL = 40;
export const MAX_PICK_TITLE = 60;
/** 결과가 마음에 안 들면 이만큼만 다시 돌릴 수 있다. 무한으로 돌리면 결국 고르는 것과 같다. */
export const MAX_PICK_REROLLS = 1;

export const PICK_STATUSES = ["drawn", "decided"] as const;
export type PickStatus = (typeof PICK_STATUSES)[number];

/** 같은 후보를 두 번 넣지 않게 — 앞뒤 공백과 대소문자를 무시하고 비교한다. */
export const pickLabelKey = (label: string) => label.trim().toLowerCase();

/** 입력값을 다듬고 겹치는 후보를 뺀다. 처음 넣은 순서를 지킨다. */
export const uniqueLabels = (labels: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of labels) {
    const label = raw.trim().slice(0, MAX_PICK_LABEL);
    const key = pickLabelKey(label);
    if (!label || seen.has(key)) continue;
    seen.add(key);
    result.push(label);
  }
  return result;
};

export const createPickSchema = z.object({
  title: z.string().trim().max(MAX_PICK_TITLE).default(""),
  options: z
    .array(z.string().trim().min(1).max(MAX_PICK_LABEL))
    .max(MAX_PICK_OPTIONS, `후보는 ${MAX_PICK_OPTIONS}개까지 넣을 수 있어요.`)
    .transform(uniqueLabels)
    .refine(
      (v) => v.length >= MIN_PICK_OPTIONS,
      `겹치지 않는 후보를 ${MIN_PICK_OPTIONS}개 이상 넣어 주세요.`
    ),
});
export type CreatePickInput = z.input<typeof createPickSchema>;

/**
 * 골라 줘 화면을 바꾼다. 보낸 값만 바꾼다.
 * - `title`·`labels`: 돌리기 전에 적고 있는 고민과 후보. 쓰는 중에 저장하므로 고민 끝 공백은
 *   다듬지 않는다("오늘 " 다음에 "저녁"을 이어 쓸 수 있게).
 * - `activePickId`: 화면에 띄울 뽑기. null이면 후보를 적는 화면으로 돌아간다.
 */
export const pickBoardPatchSchema = z.object({
  title: z
    .string()
    .transform((v) => v.slice(0, MAX_PICK_TITLE))
    .optional(),
  labels: z
    .array(z.string())
    .max(MAX_PICK_OPTIONS, `후보는 ${MAX_PICK_OPTIONS}개까지 넣을 수 있어요.`)
    .transform(uniqueLabels)
    .optional(),
  activePickId: z.number().int().positive().nullable().optional(),
});
export type PickBoardPatch = z.input<typeof pickBoardPatchSchema>;

export interface PickDraft {
  title: string;
  labels: string[];
}

export const EMPTY_PICK_DRAFT: PickDraft = { title: "", labels: [] };

export interface PickOptionView {
  id: number;
  label: string;
}

export interface PickView {
  id: number;
  title: string;
  options: PickOptionView[];
  resultOptionId: number;
  rerollsLeft: number;
  status: PickStatus;
  createdAt: string;
  decidedAt: string | null;
}

/** 둘이 같이 보는 골라 줘 화면 — 적고 있는 후보와, 띄워 둔 뽑기 결과 */
export interface PickBoard extends PickDraft {
  activePick: PickView | null;
}
