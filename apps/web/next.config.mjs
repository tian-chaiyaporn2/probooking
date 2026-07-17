/** @type {import('next').NextConfig} */

// For GitHub Pages the site is served under /<repo>/, so the deploy build sets
// NEXT_PUBLIC_BASE_PATH=/probooking. Local dev + e2e leave it unset (served at root),
// so their URLs and the Playwright assertions are unaffected.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  reactStrictMode: true,
  // Static HTML export — the only thing GitHub Pages can host (no Node server).
  output: "export",
  images: { unoptimized: true }, // no Image Optimization server in a static export
  ...(basePath
    ? {
        basePath,
        // Pages resolves /route/ -> /route/index.html, so emit trailing-slash dirs.
        trailingSlash: true,
      }
    : {}),
  // THB/Asia-Bangkok locale handled in-app; times stored UTC (LOC-02).
};

export default nextConfig;
