import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/research", destination: "/dashboard/research", permanent: false },
      { source: "/claim", destination: "/dashboard/claim", permanent: false },
    ];
  },
};

export default nextConfig;
