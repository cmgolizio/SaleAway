import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      // The 24-month sales export is ~18 MB; leave headroom for growth.
      bodySizeLimit: "100mb",
    },
  },
};

export default nextConfig;
