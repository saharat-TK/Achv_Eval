/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: '20mb' }, // TQF PDFs can be large
    // firebase-admin is server-only and not bundler-friendly. Keep it
    // external so Next loads it as a plain Node module at runtime.
    // (Next 14 key; on Next 15 this moves to top-level serverExternalPackages.)
    serverComponentsExternalPackages: ['firebase-admin'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
