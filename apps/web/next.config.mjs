/** @type {import('next').NextConfig} */
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the Docker image (M5 / DEPLOY.md).
  // Produces .next/standalone with its own minimal node_modules.
  output: "standalone",
  // Pin the tracing root to the monorepo root so `node_modules` from the
  // workspace hoist is traced. Must be an absolute path.
  outputFileTracingRoot: repoRoot,
  // The RBZ is private (not in /public). The authenticated download route
  // checks the Supabase session before streaming this traced file.
  outputFileTracingIncludes: {
    "/api/download/rbz": ["./private/DiroryLibrary-0.9.0.rbz"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
