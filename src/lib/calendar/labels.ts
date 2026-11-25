export const LABEL_COLORS = [
  { key: "red", name: "빨강", hex: "#e05b5b" },
  { key: "orange", name: "주황", hex: "#f08a3c" },
  { key: "yellow", name: "노랑", hex: "#e3b341" },
  { key: "lightgreen", name: "연두", hex: "#7cc47f" },
  { key: "mint", name: "민트", hex: "#4fc3a1" },
  { key: "skyblue", name: "하늘", hex: "#5aa9e6" },
  { key: "blue", name: "파랑", hex: "#5b7fe0" },
  { key: "indigo", name: "남색", hex: "#6b63d9" },
  { key: "purple", name: "보라", hex: "#a06bd9" },
  { key: "pink", name: "분홍", hex: "#e06b9f" },
] as const;

export type LabelColorKey = (typeof LABEL_COLORS)[number]["key"];

/** 색상 key를 hex로 바꾼다. 알 수 없는 key는 무채색으로 둔다. */
export const labelColor = (key: string): string =>
  LABEL_COLORS.find((color) => color.key === key)?.hex ?? "#9ca3af";

export const DEFAULT_LABEL_NAME = "기본";
