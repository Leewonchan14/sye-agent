export interface DefaultSuggestion {
  label: string;
  prompt: string;
  sortOrder: number;
}

/** 새 사용자에게 채워 주는 예시 질문. 사용자는 설정에서 고치거나 지울 수 있다. */
export const DEFAULT_SUGGESTIONS: DefaultSuggestion[] = [
  {
    label: "오늘의 주요 뉴스",
    prompt: "오늘 국내 주요 뉴스를 분야별로 정리해 줘.",
    sortOrder: 1,
  },
  {
    label: "브랜드 언급 분석",
    prompt:
      "우리 브랜드가 최근 일주일간 뉴스·블로그·커뮤니티에서 어떻게 언급됐는지 키워드 위주로 분석해 줘.",
    sortOrder: 2,
  },
  {
    label: "보도자료 초안",
    prompt: "신제품 출시 보도자료 초안을 써 줘. 필요한 정보가 있으면 먼저 물어봐.",
    sortOrder: 3,
  },
  {
    label: "글 요약",
    prompt: "아래 글을 핵심만 세 줄로 요약해 줘.\n\n",
    sortOrder: 4,
  },
];
