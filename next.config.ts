import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep pdf-parse out of the webpack bundle so it runs as a native Node module
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
