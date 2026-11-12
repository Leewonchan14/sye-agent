import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 개발 서버를 다른 오리진(127.0.0.1, 서버 IP, LAN)에서 열어도 하이드레이션되게 한다.
  // 비워 두면 Next 16이 dev 리소스를 막아 화면이 빈 채로 남는다. 주소는 env로 받는다(쉼표 구분).
  allowedDevOrigins: [
    "127.0.0.1",
    ...(process.env.DEV_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  ],
  // PGlite는 WASM·데이터 파일을 직접 읽으므로 번들하지 않는다.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
