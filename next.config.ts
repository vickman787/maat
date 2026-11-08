import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.MAAT_STANDALONE === "1" ? "standalone" : undefined,
  poweredByHeader: false,
  images: { unoptimized: true },
  webpack(config) {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /[\\/]node_modules[\\/].*ox[\\/]_esm[\\/]tempo[\\/]/ },
    ];
    return config;
  },
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

