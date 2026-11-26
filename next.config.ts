import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep PDF.js decoder and font assets in packaged server output.
  outputFileTracingIncludes: {
    '/api/pdfjs/**': ['./node_modules/pdfjs-dist/{wasm,cmaps,standard_fonts,iccs}/**/*'],
  },
  allowedDevOrigins: ["192.168.0.253"],

  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;