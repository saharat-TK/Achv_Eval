/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: '20mb' }, // TQF PDFs can be large
  },
};

export default nextConfig;
