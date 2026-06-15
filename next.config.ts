import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/webhooks/kie": [
      "./node_modules/ffmpeg-static/**/*",
      "./assets/audio/**/*",
    ],
  },
};

export default nextConfig;
