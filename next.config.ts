import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['172.30.1.41'],
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/garu-ko/pkg/*.wasm",
      "./node_modules/garu-ko/models/*.gmdl",
    ],
  },
};

export default nextConfig;
