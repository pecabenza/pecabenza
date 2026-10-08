import type { NextConfig } from "next";
import { buildContentSecurityPolicy, buildHstsHeader } from "./src/lib/security/csp";

const isProduction = process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";
const hstsValue = buildHstsHeader({
  appEnv: process.env.APP_ENV || (isProduction ? "production" : "development"),
  enablePreload: process.env.ENABLE_HSTS_PRELOAD === "true",
});

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  ...(hstsValue
    ? [
        {
          key: "Strict-Transport-Security",
          value: hstsValue,
        },
      ]
    : []),
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    key: "Content-Security-Policy",
    value: buildContentSecurityPolicy({
      includeGoogleAnalytics: true,
      includeGoogleTagManager: true,
      includeSupabase: true,
      isProduction,
    }),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
