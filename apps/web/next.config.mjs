/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@probook/domain"],
  // THB/Asia-Bangkok locale handled in-app; times stored UTC (LOC-02).
};

export default nextConfig;
