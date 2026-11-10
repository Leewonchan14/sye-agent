import nodemailer from "nodemailer";

/**
 * 리포트 메일 발송. SMTP 접속 정보는 환경 변수 하나로 받는다.
 *
 * - `MONITOR_SMTP_URL` 예: `smtps://계정%40gmail.com:앱비밀번호@smtp.gmail.com:465`
 * - `MONITOR_MAIL_FROM` 예: `웰컴 성예은 <계정@gmail.com>`
 */
export const isMailReady = () =>
  Boolean(process.env.MONITOR_SMTP_URL && process.env.MONITOR_MAIL_FROM);

const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** 텍스트 리포트를 줄바꿈과 링크를 살린 HTML로 바꾼다. */
export const reportTextToHtml = (text: string) => {
  const body = escapeHtml(text).replace(
    /https?:\/\/[^\s<]+/g,
    (url) => `<a href="${url}" style="color:#2563eb">${url}</a>`
  );
  return `<div style="font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:14px;line-height:1.75;color:#111;white-space:pre-wrap;word-break:keep-all">${body}</div>`;
};

export const sendReportMail = async (mail: {
  to: string[];
  subject: string;
  text: string;
}) => {
  const url = process.env.MONITOR_SMTP_URL;
  const from = process.env.MONITOR_MAIL_FROM;
  if (!url || !from) throw new Error("메일 발송 설정(MONITOR_SMTP_URL)이 없어요.");
  const transport = nodemailer.createTransport(url);
  const info = await transport.sendMail({
    from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: reportTextToHtml(mail.text),
  });
  if (info.rejected.length) {
    throw new Error(`받지 않은 주소가 있어요: ${info.rejected.join(", ")}`);
  }
  return info.messageId;
};
