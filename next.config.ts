import type { NextConfig } from "next";

/**
 * Static export for GitHub Pages.
 * Set NEXT_PUBLIC_BASE_PATH to "/<repo-name>" when deploying to project pages.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  reactStrictMode: true,
  // Isolate from the monorepo root lockfile for Turbopack root detection.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
