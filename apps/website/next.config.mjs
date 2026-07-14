import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  transpilePackages: ["@workspace/ui", "@workspace/utils", "@workspace/dictionaries", "@workspace/integrations", "@workspace/encryption"],
  turbopack: {
    // Explicitly set monorepo root so Turbopack doesn't infer the root from
    // the nearest bun.lock (/Users/boneconsulting), which causes a panic:
    // "resource path need to be on project filesystem".
    root: resolve(currentDir, "../.."),
  },
};

export default nextConfig;
