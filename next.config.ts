import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // do not let `next dev` write AGENTS.md / CLAUDE.md into the project
  agentRules: false,
  env: {
    NEXT_PUBLIC_APP_MODE: "connected",
    NEXT_PUBLIC_ENABLE_ACADEMIC_RESULTS_PREVIEW: "false",
  },
};

export default nextConfig;
