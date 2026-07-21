import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['172.30.1.41'],
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/garu-ko/pkg/*.wasm",
      "./node_modules/garu-ko/models/*.gmdl",
    ],
  },
  // @huggingface/transformers가 onnxruntime-node 대신 onnxruntime-web(WASM)을
  // 사용하도록 강제합니다. Vercel serverless 환경에서는 native .so 파일을 로드할 수 없습니다.
  turbopack: {
    resolveAlias: {
      "onnxruntime-node": "./src/lib/stubs/onnxruntime-node.js",
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "onnxruntime-node$": "./src/lib/stubs/onnxruntime-node.js",
    };
    return config;
  },
};

export default nextConfig;
