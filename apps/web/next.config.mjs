/** @type {import('next').NextConfig} */
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig = {
  reactStrictMode: true,
  // A05 (security misconfiguration): do not advertise the framework. Caddy also
  // strips the Server header, so responses carry no version fingerprints.
  poweredByHeader: false,
  // Self-contained server bundle for the Docker image (M5 / DEPLOY.md).
  // Produces .next/standalone with its own minimal node_modules.
  output: "standalone",
  // Pin the tracing root to the monorepo root so `node_modules` from the
  // workspace hoist is traced. Must be an absolute path.
  outputFileTracingRoot: repoRoot,
  // `sharp` is a native module used by /api/thumb to shrink catalogue images.
  // Keep it out of the server bundle and let Next trace it as a dependency.
  serverExternalPackages: ["sharp"],
  // The RBZ is private (not in /public). The authenticated download route
  // checks the Supabase session before streaming this traced file.
  outputFileTracingIncludes: {
    "/api/download/rbz": ["./private/DiroryLibrary-0.9.4.rbz"],
    // sharp loads its native binary (and libvips) with a runtime require, which
    // the tracer cannot see. Without these the standalone server starts but
    // /api/thumb throws "Could not load the sharp module".
    "/api/thumb/**": [
      "../../node_modules/sharp/**/*",
      "../../node_modules/@img/**/*",
      "../../node_modules/detect-libc/**/*",
      "../../node_modules/semver/**/*",
    ],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
