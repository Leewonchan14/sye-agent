"use client";

import { useCallback } from "react";

interface Props {
  onQuestionClick: (q: string) => void;
}

export const ExampleQuestions = ({ onQuestionClick }: Props) => {
  const handleClick = useCallback(
    (q: string) => {
      onQuestionClick(q);
    },
    [onQuestionClick]
  );

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {["작성하기", "학습하기", "코드", "일상"].map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => handleClick(q)}
          className="rounded-full border px-4 py-1.5 text-sm transition-colors"
          style={{
            borderColor: "var(--color-hairline)",
            backgroundColor: "var(--color-surface)",
            color: "var(--color-muted)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-canvas-soft)";
            e.currentTarget.style.color = "var(--color-ink)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-surface)";
            e.currentTarget.style.color = "var(--color-muted)";
          }}
        >
          {q}
        </button>
      ))}
    </div>
  );
};
