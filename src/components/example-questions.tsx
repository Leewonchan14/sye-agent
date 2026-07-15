"use client";

import { useCallback } from "react";

interface ExampleQuestionsProps {
  onQuestionClick: (question: string) => void;
}

const questions = ["작성하기", "학습하기", "코드", "일상"];

export const ExampleQuestions = ({ onQuestionClick }: ExampleQuestionsProps) => {
  const handleClick = useCallback(
    (q: string) => {
      onQuestionClick(q);
    },
    [onQuestionClick]
  );

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {questions.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => handleClick(q)}
          className="rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground transition-all hover:border-foreground/20 hover:text-foreground"
        >
          {q}
        </button>
      ))}
    </div>
  );
};
