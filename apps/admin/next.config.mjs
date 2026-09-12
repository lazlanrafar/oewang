import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";

const currentDir = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  experimental: {
    optimizePackageImports: [
      "@workspace/ui",
      "recharts",
      "simple-icons",
      "react-icons",
    ],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  transpilePackages: ["@workspace/ui", "@workspace/utils", "@workspace/dictionaries"],
  turbopack: {
    root: resolve(currentDir, "../.."),
  },
  async headers() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              `connect-src 'self' ${apiUrl} https:`,
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
  // async redirects() {
  //   return [
  //     {
  //       source: "/overview",
  //       destination: "/overview",
  //       permanent: false,
  //     },
  //   ];
  // },
};

export default withSentryConfig(nextConfig, {
  // Suppresses source map upload logs during build
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Upload source maps for better stack traces
  widenClientFileUpload: true,
  // Hides source maps from generated client bundles
  hideSourceMaps: true,
});
