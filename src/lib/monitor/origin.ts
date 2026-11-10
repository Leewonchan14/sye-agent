/**
 * Hermes가 결과를 POST할 앱 주소.
 * 1. `MONITOR_CALLBACK_ORIGIN` — Hermes에서 앱으로 닿는 주소가 공개 주소와 다를 때 (예: 로컬 도커 브리지)
 * 2. `NEXT_PUBLIC_SITE_URL`
 * 3. 요청이 들어온 origin
 */
export const publicOrigin = (req: Request): string =>
  (
    process.env.MONITOR_CALLBACK_ORIGIN ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    new URL(req.url).origin
  ).replace(/\/+$/, "");

/**
 * 사람이 여는 링크(공유 리포트 등)의 주소. Hermes용 콜백 주소는 쓰지 않는다.
 * `req.url`은 Next 서버가 듣는 주소(localhost 등)라서, 리버스 프록시 뒤에서는
 * 브라우저가 연 주소(X-Forwarded-Host, Host)를 쓴다.
 */
export const siteOrigin = (req: Request): string => {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  }
  const url = new URL(req.url);
  const first = (value: string | null) => value?.split(",")[0].trim() || null;
  const host = first(req.headers.get("x-forwarded-host")) ?? req.headers.get("host");
  const proto =
    first(req.headers.get("x-forwarded-proto")) ?? url.protocol.replace(/:$/, "");
  return host ? `${proto}://${host}` : url.origin;
};

export const shareReportPath = (token: string) => `/r/${token}`;
