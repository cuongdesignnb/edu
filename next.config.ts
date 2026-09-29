import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  env: {
    NEXT_PUBLIC_APP_MODE: process.env.NEXT_PUBLIC_APP_MODE ?? "demo",
    NEXT_PUBLIC_ENABLE_ACADEMIC_RESULTS_PREVIEW: process.env.NEXT_PUBLIC_ENABLE_ACADEMIC_RESULTS_PREVIEW ?? "false",
  },
};

export default nextConfig;
