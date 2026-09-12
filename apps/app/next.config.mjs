import { withSentryConfig } from "@sentry/nextjs";

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  experimental: {
    // Tree-shake heavy barrels so a single import doesn't pull the whole
    // package into a route bundle. Next auto-handles lucide-react/date-fns/
    // @radix-ui; these are the ones it doesn't cover by default.
    optimizePackageImports: ["@workspace/ui", "recharts", "simple-icons", "react-icons"],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  typescript: {
    // Type checking is handled by `bun run typecheck` separately.
    // Disabling here prevents OOM during `next build`.
    ignoreBuildErrors: true,
  },
  transpilePackages: [
    "@workspace/ui",
    "@workspace/utils",
    "@workspace/dictionaries",
    "@workspace/constants",
    "@workspace/redis",
  ],
  turbopack: {
    root: resolve(currentDir, "../.."),
  },
  async headers() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";
    const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL ?? "https://oewang.com";
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
              `connect-src 'self' ${apiUrl} ${websiteUrl} https:`,
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
