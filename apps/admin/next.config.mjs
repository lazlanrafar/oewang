import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  transpilePackages: ["@workspace/ui", "@workspace/supabase", "@workspace/utils", "@workspace/dictionaries"],
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
