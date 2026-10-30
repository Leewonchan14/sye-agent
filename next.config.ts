import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 개발 서버를 다른 오리진(127.0.0.1, 서버 공인 IP, LAN)에서 열어도 하이드레이션되게 한다.
  // 비워 두면 Next 16이 dev 리소스를 막아 화면이 빈 채로 남는다.
  allowedDevOrigins: ["172.30.1.41", "127.0.0.1", "150.230.2.124"],
  transpilePackages: ["three"],
  outputFileTracingIncludes: {
    "/*": ["./node_modules/garu-ko/pkg/*.wasm", "./node_modules/garu-ko/models/*.gmdl"],
  },
};

export default nextConfig;
