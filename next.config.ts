import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Condition photos upload through server actions (client-resized JPEGs).
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
