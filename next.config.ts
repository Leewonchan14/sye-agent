import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/garu-ko/pkg/*.wasm",
      "./node_modules/garu-ko/models/*.gmdl",
    ],
  },
};

export default nextConfig;
