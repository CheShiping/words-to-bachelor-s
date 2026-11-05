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

// 首帧前确定主题（优先本地存储，其次系统偏好），避免暗色模式下闪白
const THEME_INIT = `(function(){try{var t=localStorage.getItem("wordsInBloomTheme");if(t!=="dark"&&t!=="light"){t=(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light";}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="light";}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="motion-enabled">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        {children}
      </body>
    </html>
  );
}
