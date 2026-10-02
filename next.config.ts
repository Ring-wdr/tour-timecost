import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DB 드라이버는 서버 전용
  serverExternalPackages: ["postgres"],
  images: { unoptimized: true },
};

export default nextConfig;
