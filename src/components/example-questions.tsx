"use client";

import { useCallback } from "react";

import { Card } from "@/components/ui/card";

interface ExampleQuestionsProps {
  onQuestionClick: (question: string) => void;
}

const questions = [
  "춘천 1박2일 데이트 코스 추천해줘",
  "춘천 맛집 베스트 3 알려줘",
  "춘천에서 커플이 가기 좋은 카페",
];

export const ExampleQuestions = ({ onQuestionClick }: ExampleQuestionsProps) => {
  const handleClick = useCallback(
    (q: string) => {
      onQuestionClick(q);
    },
    [onQuestionClick]
  );

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {questions.map((q) => (
        <Card
          key={q}
          onClick={() => handleClick(q)}
          className="cursor-pointer rounded-xl border p-4 text-center text-sm text-muted-foreground transition-all hover:scale-[1.02] hover:border-primary/50 hover:text-foreground"
        >
          {q}
        </Card>
      ))}
    </div>
  );
};
