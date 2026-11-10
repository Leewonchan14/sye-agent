import { reportClosing, reportGreeting } from "@/lib/monitor/sender";
import type { MonitorCategory, MonitorRule } from "@/lib/monitor/types";

/**
 * 처음 대시보드를 열었을 때 만들어 줄 고객사 기본값.
 * 규칙은 실제 채팅에서 "앞으로는~"으로 남겼던 지시를 옮겨 왔다.
 * 인사·맺음말의 보내는 사람은 환경 변수에서 읽으므로 만들 때마다 계산한다.
 */
export interface MonitorClientPreset {
  slug: string;
  name: string;
  categories: MonitorCategory[];
  rules: MonitorRule[];
  reportTitle: string;
  greeting: string;
  closing: string;
}

export const monitorClientPresets = (): MonitorClientPreset[] => [
  {
    slug: "hktb",
    name: "홍콩관광청",
    categories: [
      { key: "own", name: "홍콩관광청 자사 뉴스", goal: null },
      { key: "hk", name: "홍콩 관련 이슈", goal: 3 },
      { key: "nto", name: "NTO", goal: 4 },
      {
        key: "industry",
        name: "여행업계 · 트렌드",
        goal: 10,
        subs: ["여행업계", "항공업계", "여행 관련 이슈", "트렌드"],
      },
    ],
    rules: [
      {
        id: "window",
        title: "모니터링 기간",
        quote: "전날 오전 9시 이후 게재 기사부터 당일 오전 9시까지 게재된 기사",
        kind: "period",
        value: "전일 09:00 ~ 당일 09:00",
      },
      {
        id: "exclude-media",
        title: "제외 매체",
        quote: "앞으로 '홍콩수요저널' 매체는 빼줘",
        kind: "tags",
        value: ["홍콩수요저널"],
      },
      {
        id: "outbound-only",
        title: "국내여행 · 인바운드 제외",
        quote:
          "국내여행(외국인 방한, 한국인 국내여행, 인바운드)은 제외하고 국외여행 이슈 위주로 찾아줘",
        kind: "toggle",
        value: true,
      },
      {
        id: "skip-reported",
        title: "어제 보고한 기사 제외",
        quote: "앞으로 전날 모니터링했을때 게재된 동일 내용의 기사는 빼줘",
        kind: "toggle",
        value: true,
      },
      {
        id: "naver-link",
        title: "네이버 CP 매체는 네이버 뉴스 링크",
        quote: "앞으로는 네이버 cp 매체면 네이버 뉴스링크로 전달해줘",
        kind: "toggle",
        value: true,
      },
      {
        id: "industry-keywords",
        title: "업계 이슈 키워드",
        quote:
          "여행/여행업계/관광/관광산업/해외여행/항공/항공업계/여행 소비/여행 트렌드 …",
        kind: "tags",
        value: [
          "여행업계",
          "해외여행",
          "항공업계",
          "여행 트렌드",
          "OTA",
          "미식여행",
          "럭셔리여행",
          "MZ세대 여행",
        ],
      },
    ],
    reportTitle: "[HKTB] Daily News Monitoring_{date}",
    greeting: `${reportGreeting("담당 매니저님")}\n{date} 홍콩관광청 데일리 뉴스 모니터링 결과 공유드립니다.`,
    closing: reportClosing(),
  },
  {
    slug: "panasonic",
    name: "파나소닉코리아",
    categories: [
      { key: "battery", name: "배터리 · 이차전지", goal: 3 },
      { key: "appliance", name: "삼성전자 · LG전자 가전 · AI", goal: 3 },
      { key: "brand", name: "파나소닉 브랜드", goal: null },
    ],
    rules: [
      {
        id: "window",
        title: "모니터링 기간",
        quote: "전일 오전 10시부터 지금까지 게재된 기사",
        kind: "period",
        value: "전일 10:00 ~ 당일 10:00",
      },
      {
        id: "top-only",
        title: "카테고리별 중요 기사만",
        quote: "앞으로는 중요한 이슈만 추려서 각 카테고리별 3~4개 기사로 추려줘",
        kind: "number",
        value: 4,
      },
      {
        id: "skip-reported",
        title: "어제 보고한 기사 제외",
        quote: "어제 보내서, 겹치지 않게 해줘",
        kind: "toggle",
        value: true,
      },
      {
        id: "reporter-retry",
        title: "기자 정보가 없으면 원문에서 다시 확인",
        quote: "다음부터는 기자 정보 없으면 web_fetch_exa 으로 다시 찾아줘",
        kind: "toggle",
        value: true,
      },
    ],
    reportTitle: "[Panasonic] Daily Monitoring_{date}",
    greeting: `${reportGreeting("담당 매니저님")}\n{date} 파나소닉코리아 모니터링 결과 공유드립니다.`,
    closing: reportClosing(),
  },
];
