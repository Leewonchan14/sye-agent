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
