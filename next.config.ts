import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep tracing inside this repo when a lockfile exists in a parent directory.
  outputFileTracingRoot: path.resolve(process.cwd()),
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
