# AGENTS.md — 词间日和 (words-to-bachelor's)

纯静态 Next.js 15 + React 19 单词学习应用（专升本 3500 词）。无后端、无数据库，
学习进度只存 localStorage。线上地址：https://cheshiping.github.io/words-to-bachelor-s/

## 启动工作流

开始写代码前，按顺序完成：

1. 完整阅读本文件与 `README.md`
2. 阅读 `feature_list.json` 与 `progress.md`，确定当前唯一功能
3. 运行 `./init.sh` 确认基线健康（失败先修验证，再开新功能范围）
4. 查看最近提交：`git log --oneline -5`

## 项目地图

- `components/BloomApp.jsx` —— 单文件应用主体（页面、状态、手势、词书加载与选书弹框都在这里）
- `components/userStorage.mjs` —— 进度存储纯逻辑：按词书分桶、v2→v3 迁移、序列化（无 React 依赖，可独立验证）
- `app/` —— App Router 页面外壳与全局 CSS（纯 CSS 设计系统：暖粉和风 + 夜樱）
- `public/data/catalog.json` —— 3500 词书（3,289 词），`scripts/build_catalog.py` 生成
- `public/data/books/phrases-764.json` —— 真题核心词组书（764 条 / 39 页）
- `public/data/books/index.json` —— **词书清单，加新词书的唯一扩展点**（元信息 + 能力开关 + dataUrl）
- `scripts/build_books.py` —— 多词书统一构建管线（复用 build_catalog.py + 解析词组表 + 生成清单）
- `out/` —— `npm run build` 的静态导出产物（部署对象，不要手改）
- `shots/` —— 截图存档；`.workbuddy/memory/` —— 项目长期约定

## 不变式（违反会引入真实 bug）

- **卡片切换唯一入口**：`components/BloomApp.jsx` 的 `useCardDeck`（底层 `useSwipeDeck` + `switchCard`）。
  沉浸学习（`.study-card`）与记忆卡片（`.flip-card`）必须共用它，不要各自复制 move 逻辑。
- **`switchCard` 必须 `flushSync(commit)`** 同步提交，否则入场动画会挂到被卸载的旧元素，产生「空一帧 + 弹出」抖动。
- **入场动画必须原地淡入、零位移**，绝不能按方向从左/右滑入——会把 `scrollWidth` 撑出横向滚动条，
  且只在「下一个」方向出现，极易误判为方向性抖动。
- `html` 的 `overflow-x: clip` + `scrollbar-gutter: stable`、`.main` 的 `overflow-x: clip` 是上述问题的防线，勿删。
- 键盘方向键经 `moveRef` 复用同一 `move` 与同一把 busy 锁。
- **进度写入必须经 `serializeUser(user)`**：内存里的 `user` 是「当前书扁平视图」，直接 `JSON.stringify(user)`
  会把分桶结构写坏、丢掉其它词书的进度；`loadLocalUser` / `switchBookState` / `resetUser` 同理必须走 userStorage.mjs。
- **v2 → v3 迁移不可删**：老用户的 3,289 词进度靠它整体搬进 `books["words-3500"]`，删了等于清空用户数据。
- **词书数据由 `index.json` 清单驱动**：新加词书 = `build_books.py` 里加一个解析器 + 一个 JSON + 一条清单记录；
  不要在 BloomApp 里硬编码书 id 列表（`FALLBACK_BOOKS` 只是清单加载失败时的兜底，不是事实源）。
- 首访 `needPick`（无 `activeBookId`）的选书弹框必须不可关闭：无关闭按钮、Esc 与遮罩点击都无效。
- 切书必须软重启：清空 quiz / lib / flash / quizSetup、回首页，否则旧书的筛选与题面会串到新书。
- 顶栏新增过书名胶囊，`.nav button em` 的 `white-space: nowrap` 与 `.nav` 的 `flex: 0 0 auto` 是防换行/溢出的防线，勿删。
- **新增面板必须复用设计系统同类型组件语言**：文本块用 `.journal-card`（玻璃底 + 内描边 + 26px 圆角）、
  标签用 `.badge` / `.badge.collection`、进度条用 `.path-bar`、按钮用 `.pill`。
  不要自造彩色左边框、高饱和色块或另一套按钮——与项目文本块主题冲突是真实缺陷，不是审美分歧。

## 构建与预览

- 改完源码必须 `npm run build` 重新导出 `out/`，否则预览看到的仍是旧版本。
- dev server 固定 **8773 端口**，同一时间只保留一个 Next dev server（共用 `.next` 会互相破坏 manifest）。
- 部署：推送 `main` 自动发布（GitHub Actions → GitHub Pages，自动设置 `NEXT_PUBLIC_BASE_PATH`）。

## 工作规则

- **一次只做一个功能**：从 `feature_list.json` 中精确挑选一个未完成的功能
- **必须验证**：未运行验证命令前，不得声称完成
- **更新产物**：会话结束前更新 `progress.md` 与 `feature_list.json`
- **保持范围**：不修改与当前功能无关的文件

## 完成定义

功能只有满足以下全部条件才算完成：

- [ ] 目标行为已实现
- [ ] `./init.sh`（至少 `npm run build`）通过
- [ ] 证据已写入 `feature_list.json` 或 `progress.md`
- [ ] `out/` 已重新导出，仓库保持可重启状态

## 验证命令

```bash
./init.sh        # 完整验证：依赖 + 三份词书数据一致性 + 构建产物检查（推荐）
npm run build    # 最低门槛：静态导出必须成功
npm run catalog  # 改 docs/ 词表或 build_books.py 后，重建 catalog.json + 词组书 + 清单
node scripts/check_migration.mjs  # 改动 components/userStorage.mjs 后必跑（6 组断言）
node scripts/check_books_ui.mjs   # 改动选书弹框/词书加载后跑（44 项 CDP 断言，需本机 Chrome + 8773 静态预览）
```

> 本机 WorkBuddy 环境的 `safe-delete` 守卫会在 `next build` 清理 `.next` 时误伤，
> 验证时需用 `CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD=2000 ./init.sh`。这是环境约束，勿写进仓库脚本。

## 范围边界

- 架构或风格决策不明 → 先查 `.workbuddy/memory/MEMORY.md` 与 README，仍不明则问用户
- 验证反复失败 → 更新 `progress.md`，标记需人工复核，不要硬闯
- `out/` 与 `shots/` 是生成物/存档，不作为修改对象
- 仓库应始终保持可重启状态：下一会话无需额外清理即可运行 `./init.sh`
