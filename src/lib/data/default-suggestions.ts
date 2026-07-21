export interface DefaultSuggestion {
  label: string;
  prompt: string;
  sortOrder: number;
}

export const DEFAULT_SUGGESTIONS: DefaultSuggestion[] = [
  { label: "사랑해!", prompt: "사랑해!", sortOrder: 1 },
  { label: "데이트 코스 추천", prompt: "데이트 코스 추천해줘…!", sortOrder: 2 },
  {
    label: "오늘 뭐하지?",
    prompt:
      "사당역이랑 충정로역 사이에서 만날건데 신림역, 신대방역, 영등포역, 서울대입구역, 부평역 등에서 만날거야 오늘 데이트 코스 추천해줘…!",
    sortOrder: 3,
  },
  {
    label: "퇴근후 만나자!",
    prompt:
      "퇴근후 (저녁 6시 이후) 충정로랑 서초 사이에서 만날건데 신림역, 신대방역, 영등포역, 서울대입구역 등에서 만날거야 오늘 데이트 코스 추천해줘…!",
    sortOrder: 4,
  },
  { label: "맛집 찾기", prompt: "분위기 좋은 맛집 알려줘…!", sortOrder: 5 },
  {
    label: "홍콩관광청 모니터링",
    prompt:
      "홍콩관광청에 대해 최근 한 달간 뉴스, 블로그, 인스타그램, 트위터, 커뮤니티에서 어떤 키워드가 나오는지 분석해줘…!",
    sortOrder: 6,
  },
  {
    label: "파나소닉 모니터링",
    prompt:
      "파나소닉 브랜드 모니터링 해줘…! 최근 일주일간 뉴스, 블로그, 인스타그램, 트위터, 커뮤니티랑 커뮤니티 반응이 궁금해…!",
    sortOrder: 7,
  },
  {
    label: "카톡 대화 검색",
    prompt: "우리 봤던 영화 뭐였더라…!",
    sortOrder: 8,
  },
];
