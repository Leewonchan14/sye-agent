import type { NextConfig } from "next";

// worktree 미리보기는 /preview/<name> 아래에서 돈다 (예: /preview/calendar).
// 운영(Vercel)에는 이 값이 없어서 basePath 없이 그대로 서비스된다.
const rawPreviewBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
const previewBasePath = rawPreviewBasePath
  ? `/${rawPreviewBasePath.replace(/^\/+|\/+$/g, "")}`
  : "";

const nextConfig: NextConfig = {
  ...(previewBasePath ? { basePath: previewBasePath } : {}),
  // 개발 서버를 다른 오리진(127.0.0.1, 서버 공인 IP, LAN)에서 열어도 하이드레이션되게 한다.
  // 비워 두면 Next 16이 dev 리소스를 막아 화면이 빈 채로 남는다.
  allowedDevOrigins: [
    "172.30.1.41",
    "127.0.0.1",
    "150.230.2.124",
    "100.64.78.39",
    "wonchan.kr",
    "xn--oj4bo2g00a.wonchan.kr",
  ],
  outputFileTracingIncludes: {
    "/*": ["./node_modules/garu-ko/pkg/*.wasm", "./node_modules/garu-ko/models/*.gmdl"],
  },
  // 성예은.wonchan.kr 는 Vercel 이 받는다. /preview/* 만 이 서버(caddy-monitor)로 넘겨
  // worktree 미리보기(next start, basePath=/preview/<name>)로 보낸다.
  async rewrites() {
    if (previewBasePath) return [];
    return [
      {
        source: "/preview/:path*",
        destination: "https://wonchan.kr/preview/:path*",
      },
    ];
  },
};

export default nextConfig;
