import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No Next.js image optimizer: images will come from Sanity's image CDN.
  images: { unoptimized: true },
};

export default nextConfig;
