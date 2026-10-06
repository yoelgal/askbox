import type { NextConfig } from "next";

// What @fanvue/builder-sdk's withFanvueHeaders sets (its Next entry can't be
// loaded from a config file): Fanvue may frame us, and /api allows any origin
// because the fan iframe is sandboxed without allow-same-origin, so its fetches
// come from origin "null". Safe: sessions are bearer tokens, never cookies.
const config: NextConfig = {
  // Dev only: lets the Cloudflare tunnel load /_next assets and HMR.
  allowedDevOrigins: ["*.trycloudflare.com"],
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://fanvue.com https://*.fanvue.com" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, PATCH, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "authorization, content-type" },
        ],
      },
    ];
  },
};

export default config;
