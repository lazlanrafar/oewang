/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  transpilePackages: [
    "@workspace/ui",
    "@workspace/utils",
    "@workspace/dictionaries",
    "@workspace/integrations",
  ],
};

export default nextConfig;
