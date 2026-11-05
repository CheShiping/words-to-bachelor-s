import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata = {
  title: "词间日和 · Words in Bloom",
  description:
    "ことばの記憶 — 专升本单词学习花园：沉浸学习、记忆卡片、间隔复习与记忆测试，进度保存在本地浏览器。",
  // 图标放在 public/：app/icon.svg 的元数据路由在包含单引号的目录下会生成非法代码
  icons: {
    icon: `${basePath}/icon.svg`,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body className="motion-enabled">{children}</body>
    </html>
  );
}
