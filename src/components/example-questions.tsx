"use client";

import { useCallback } from "react";

import { Button } from "@/components/ui/button";

interface Props {
  onQuestionClick: (q: string) => void;
}

const suggestions = [
  { label: "데이트 코스 추천", prompt: "데이트 코스 추천해줘…!" },
  { label: "데이트 일정", prompt: "1박 2일 데이트 일정 짜줘…!" },
  { label: "맛집 찾기", prompt: "분위기 좋은 맛집 알려줘…!" },
  { label: "체크리스트", prompt: "둘이 함께 데이트 준비물 체크리스트 알려줘…!" },
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
        <Button
          key={s.label}
          variant="outline"
          size="sm"
          onClick={() => handleClick(s.prompt)}
          className="rounded-full text-[13px]"
        >
          {s.label}
        </Button>
      ))}
    </div>
  );
};
