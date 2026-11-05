/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  // 纯静态导出：构建产物在 out/，可直接部署到 GitHub Pages / Vercel / 任意静态托管。
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
  trailingSlash: true,
  // 关闭左下角的 Next 开发指示器，避免遮挡底部导航
  devIndicators: false,
};

export default nextConfig;
