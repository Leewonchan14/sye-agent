"use client";

import { useCallback } from "react";

interface Props {
  onQuestionClick: (q: string) => void;
}

const suggestions = [
  { icon: "🌸", label: "데이트 코스 추천", prompt: "데이트 코스 추천해줘…!" },
  { icon: "🗺️", label: "데이트 일정", prompt: "1박 2일 데이트 일정 짜줘…!" },
  { icon: "🍽️", label: "맛집 찾기", prompt: "분위기 좋은 맛집 알려줘…!" },
  { icon: "💝", label: "체크리스트", prompt: "둘이 함께 데이트 준비물 체크리스트 알려줘…!" },
];

export const ExampleQuestions = ({ onQuestionClick }: Props) => {
  const handleClick = useCallback(
    (prompt: string) => {
      onQuestionClick(prompt);
    },
    [onQuestionClick]
  );

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {suggestions.map((s) => (
        <button
          key={s.label}
          type="button"
          onClick={() => handleClick(s.prompt)}
          className="flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors"
          style={{
            borderColor: "var(--color-hairline)",
            backgroundColor: "var(--color-surface)",
            color: "var(--color-body)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-canvas-soft)";
            e.currentTarget.style.color = "var(--color-ink)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-surface)";
            e.currentTarget.style.color = "var(--color-body)";
          }}
        >
          <span className="text-sm leading-none">{s.icon}</span>
          {s.label}
        </button>
      ))}
    </div>
  );
};
