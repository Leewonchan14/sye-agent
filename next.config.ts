import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['172.30.1.41'],
  // onnxruntime-node의 네이티브 .so 바이너리를 Vercel 배포에 포함시킵니다.
  // @huggingface/transformers가 외부 모듈로 처리되어 @vercel/nft가
  // 동적 require() 경로를 자동 추적하지 못하므로 명시 지정이 필요합니다.
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**",
    ],
    "/*": [
      "./node_modules/garu-ko/pkg/*.wasm",
      "./node_modules/garu-ko/models/*.gmdl",
    ],
  },
};

export default nextConfig;
