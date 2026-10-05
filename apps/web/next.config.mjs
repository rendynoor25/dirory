/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the tracing root so the monorepo lockfile is used, not a stray one.
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  // The RBZ is private (not in /public). The authenticated download route
  // checks the Supabase session before streaming this traced file.
  outputFileTracingIncludes: {
    "/api/download/rbz": ["./private/DiroryLibrary-0.8.0.rbz"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
