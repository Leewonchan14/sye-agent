/**
 * 보고서 인사·맺음말에 쓰는 보내는 사람. 저장소가 public이라 실명은 코드에 두지 않고
 * 서버 환경 변수로 받는다. 비어 있으면 이름 없이 인사한다.
 *  · MONITOR_REPORT_COMPANY: 소속(예: 회사 이름)
 *  · MONITOR_REPORT_SENDER: 보내는 사람 이름
 */
const reportSender = () => ({
  company: process.env.MONITOR_REPORT_COMPANY?.trim() ?? "",
  name: process.env.MONITOR_REPORT_SENDER?.trim() ?? "",
});

/** "담당 매니저님, 안녕하세요. {소속} {이름}입니다." */
export const reportGreeting = (recipient: string): string => {
  const { company, name } = reportSender();
  const who = [company, name].filter(Boolean).join(" ");
  return `${recipient}, 안녕하세요.${who ? ` ${who}입니다.` : ""}`;
};

/** "감사합니다.\n{이름} 드림" */
export const reportClosing = (): string => {
  const { name } = reportSender();
  return name ? `감사합니다.\n${name} 드림` : "감사합니다.";
};
