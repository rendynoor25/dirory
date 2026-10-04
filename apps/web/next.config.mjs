/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the tracing root so the monorepo lockfile is used, not a stray one.
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
