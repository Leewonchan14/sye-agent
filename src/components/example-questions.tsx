"use client";

import { useCallback } from "react";

import { Button } from "@/components/ui/button";

interface Props {
  onQuestionClick: (q: string) => void;
}

const suggestions = [
  { label: "데이트 코스 추천", prompt: "데이트 코스 추천해줘…!" },
  {
    label: "오늘 뭐하지?",
    prompt:
      "사당역이랑 충정로역 사이에서 만날건데 신림역, 신대방역, 영등포역, 서울대입구역, 부평역 등에서 만날거야 오늘 데이트 코스 추천해줘…!",
  },
  {
    label: "퇴근후 만나자!",
    prompt:
      "퇴근후 (저녁 6시 이후) 충정로랑 서초 사이에서 만날건데 신림역, 신대방역, 영등포역, 서울대입구역 등에서 만날거야 오늘 데이트 코스 추천해줘…!",
  },
  { label: "맛집 찾기", prompt: "분위기 좋은 맛집 알려줘…!" },
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
