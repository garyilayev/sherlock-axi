// The editor is a static export served by the Sherlock CLI's local server
// (apps/cli/src/server.js), which also provides the /api endpoints.
// During `next dev`, /api is proxied to a running `sherlock open` server.
const isDev = process.env.NODE_ENV === 'development';
const SHERLOCK_API = process.env.SHERLOCK_API || 'http://localhost:4870';

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(isDev
    ? { rewrites: async () => [{ source: '/api/:path*', destination: `${SHERLOCK_API}/api/:path*` }] }
    : { output: 'export' }),
  transpilePackages: ['@sherlock/qa-model'],
  images: { unoptimized: true },
  reactStrictMode: true,
  devIndicators: false,
};

export default nextConfig;
