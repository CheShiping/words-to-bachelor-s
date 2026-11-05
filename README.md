# 词间日和 · Words in Bloom

一个面向专升本英语词汇（2027 老秦专升本 3500 词）的纯静态单词学习应用。提供单词浏览、沉浸学习、记忆卡片、测验和收藏等功能；学习进度保存在当前浏览器中，无需后端服务。

## 功能

- **首页**：查看学习概况与学习进度。
- **词典库**：按词集、词性和学习状态浏览、筛选单词。
- **沉浸学习**：逐词学习，并记录掌握状态。
- **记忆卡片**：通过卡片复习词汇。
- **记忆测试**：练习并检查单词记忆。
- **收藏夹**：集中查看收藏的单词。
- **本地进度**：学习状态、收藏和复习数据保存在浏览器 `localStorage` 中。
- **静态部署**：Next.js 导出静态文件到 `out/`，可部署到 GitHub Pages、Vercel 或其他静态托管服务。

## 技术栈

- Next.js 15
- React 19
- GSAP
- 单词目录：`public/data/catalog.json`
- 词表原文：`docs/2027专升本零基础3500词汇.md`

## 本地运行

### 环境要求

- Node.js 18.18 或更高版本
- npm

### 安装依赖并启动开发服务器

```bash
npm install
npm run dev
```

在浏览器打开 [http://localhost:3000](http://localhost:3000)。

### 构建和预览

```bash
npm run build
npm run start
```

构建完成后，静态站点文件位于 `out/`。`npm run start` 会通过 `npx serve out` 在本地预览构建结果。

## 部署

运行 `npm run build`，然后将 `out/` 目录发布到静态托管平台。

如果部署在域名根路径以外的子路径，需要在构建前设置 `NEXT_PUBLIC_BASE_PATH`，使页面和静态资源使用相同的基础路径。例如，Windows PowerShell：

```powershell
$env:NEXT_PUBLIC_BASE_PATH = "/words-in-bloom"
npm run build
```

## 更新单词目录

单词数据由 `public/data/catalog.json` 提供。项目包含 Markdown 转换脚本 `scripts/build_catalog.py`；如需从词表原文重新生成目录，请确保已安装 Python 3，并准备好 `docs/2027专升本零基础3500词汇.md`：

```bash
npm run catalog
```

也可以直接调用脚本并指定输入、输出路径（省略输入路径时脚本会在仓库内自动查找词表）：

```bash
python scripts/build_catalog.py "docs/2027专升本零基础3500词汇.md" public/data/catalog.json
```

脚本会解析原书中的「第 N 组」分组、单词、音标、词性与释义，自动完成以下处理：

- 还原 PDF 换行导致的音标、释义截断（如 `misunderstand`、`尽管`类断行）；
- 过滤原文档混入的对话噪声行；
- 修正被 PDF 拆开的单词（`café`、`o'clock`）；
- 按原书编排划分难度分区：基础词（1–2200）、进阶词（2301–3000）、高分词（3101–3500）；
- 依据词性生成 `名词 / 动词 / 形容词 …` 分类，用于词典库的词性筛选；
- 对原词表中重复出现的单词做全局去重（保留首次出现的释义）。
