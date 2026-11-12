"use client";

import { useCallback } from "react";

import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";

interface Suggestion {
  id: number;
  label: string;
  prompt: string;
  sortOrder: number | null;
  createdAt: string | null;
}

interface Props {
  onQuestionClick: (q: string) => void;
}

const fetchSuggestions = async () => {
  const res = await fetch("/api/suggestions");
  if (!res.ok) throw new Error("불러오기 실패");
  return res.json() as Promise<{ suggestions: Suggestion[] }>;
};

export const ExampleQuestions = ({ onQuestionClick }: Props) => {
  const { data } = useQuery({
    queryKey: ["suggestions"],
    queryFn: fetchSuggestions,
  });

  const suggestions = data?.suggestions ?? [];

  const handleClick = useCallback(
    (prompt: string) => {
      onQuestionClick(prompt);
    },
    [onQuestionClick]
  );

  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {suggestions.map((s) => (
        <Button
          key={s.id}
          variant="outline"
          size="sm"
          onClick={() => handleClick(s.prompt)}
          className="rounded-full"
        >
          {s.label}
        </Button>
      ))}
    </div>
  );
};
