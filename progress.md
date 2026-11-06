# 会话进度日志

## 当前状态

**最后更新：** 2026-11-06 23:45
**当前功能：** 无进行中功能 —— 多词书需求（feat-012 / 013 / 014）已全部交付并验证

## 状态概览

### 已完成

- [x] 核心应用全部功能（feat-001 ~ feat-010）
- [x] Agent harness（feat-011）
- [x] 线上发布：https://cheshiping.github.io/words-to-bachelor-s/
- [x] 卡片切换链路收敛到 `useCardDeck`，横滚抖动问题已修复
- [x] **多词书架构 + 旧进度迁移（feat-012）**：进度按书分桶、v2→v3 无损迁移、清单驱动按需加载
- [x] **真题核心词组词书数据（feat-013）**：764 条 / 39 页 / 例句 / 标签分类，三文件幂等校验
- [x] **词书选择弹框与切换入口（feat-014）**：首访强制选择、localStorage 记忆、顶栏切换、各页适配

### 进行中

-（空）

### 下一步

1. 新需求进来时：在 `feature_list.json` 追加条目，按「一次一个功能」推进
2. 加第三本词书：写一个 `parse_xxx()` → 在 `scripts/build_books.py` 追加一个 JSON + 一条清单记录，前端不用改
3. 可选清理：`scripts/_probe2.mjs`、`_swipe_diag.mjs`、`_swipe_verify2.mjs` 是历史滑动排查诊断脚本，确认无用后可删除（需用户确认）

## 阻塞 / 风险

- 本机 WorkBuddy 环境的 `safe-delete` 批量删除守卫会在 `npm run build` 清理 `.next` 时误伤（阈值 50/次）。
  验证命令需带额度前缀：`CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD=2000 ./init.sh`。
  这是**环境约束，不是项目问题**，未写进仓库脚本；其它环境直接 `./init.sh` 即可。

## 已做出的决策

- **卡片切换统一走 `useCardDeck`**：沉浸学习与记忆卡片共用同一套滑动/切换
- **入场动画原地淡入零位移**：侧向滑入会撑大 `scrollWidth`，已禁用
- **dev 固定 8773 端口且单实例**：多个 Next dev server 共用 `.next` 会互相破坏 manifest
- **进度按书分桶，但组件层保持「当前书扁平视图」**：`userStorage.mjs` 在读写时做分桶/摊平转换，
  所有旧组件（按 `user.words[id]` 读写）零改动；写入前必须经 `serializeUser` 同步回书桶
- **v2 数据必须迁移而非重置**：这次是「同一应用加书」，不是换词库；旧进度整体挪进 `books["words-3500"]`
- **词书清单是唯一扩展点**：`public/data/books/index.json` 提供 id / 名称 / 词数 / dataUrl /
  `hasSections` / `spellingEnabled` / `categoryLabel` 等能力开关，前端全部按元数据显隐
- **词组形态保真**：`warn (sb) of sth`、`both… and…` 原样保留；例句只在学习卡与记忆卡展示，不进测验
- **词组书不出拼写题**：带占位符的词组不适合手打，只保留中英互测
- **选书弹框一律复用设计系统同类型组件**：书卡片 `.journal-card`、标签 `.badge / .badge.collection`、
  进度条 `.path-bar`、按钮 `.pill`。初版自造了 4px 纯色左边框与高饱和薄荷按钮，与文本块主题明显冲突，已全部去掉；
  两本卡片结构完全对称，只用设计系统既有的粉 / 金两色 badge 区分

## 本次会话修改的文件

- 新增：`components/userStorage.mjs`（存储纯逻辑，可独立验证）
- 新增：`scripts/build_books.py`（多词书构建管线）、`scripts/check_migration.mjs`（存储回归）
- 新增：`public/data/books/phrases-764.json`、`public/data/books/index.json`
- 新增：`scripts/check_books_ui.mjs`（真实 Chrome CDP 回归，需本机 Chrome + 8773 静态预览）
- 修改：`components/BloomApp.jsx`（清单/词书加载、分桶持久化、选书弹框、顶栏切换、例句、按书适配）
- 修改：`app/globals.css`（选书弹框、例句块、顶栏胶囊、暗色与移动端；顶栏导航标签固定单行）
- 修改：`package.json`（`npm run catalog` → `build_books.py`）、`init.sh`（三文件幂等校验）
- 修改：`AGENTS.md` / `feature_list.json` / `progress.md` / `session-handoff.md` / `README.md`
- 生成：`out/` 重新静态导出；截图 `shots/book-picker/01~07`
- 未改：`public/data/catalog.json`（与改造前字节完全一致）、`docs/` 下两份词表 md

## 完成证据

- [x] `node scripts/check_migration.mjs`：6 组断言全通过（迁移 / 分桶 / 序列化往返 / 切书隔离 / 重置 / 未知版本）
- [x] `python scripts/build_books.py .catalog-verify.tmp` + 三文件 diff：幂等通过；`catalog.json` 与改造前 `cmp` 一致
- [x] `node scripts/check_books_ui.mjs`：真实 Chrome CDP 回归 **44/44 通过**
  （首访强制弹框、Esc 无效、localStorage 记忆、刷新不重选、切书进度隔离、v2 迁移、例句、
  词组书无拼写题、首页路径显隐、顶栏单行不溢出、**书卡片沿用文本块玻璃样式 / 无彩色左边框 / CTA 无渐变**、
  暗色、移动端、无 JS 异常）
- [x] `CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD=2000 ./init.sh`：完整门禁通过，`out/index.html` 与三份数据齐备
- [x] 截图人工复核：`shots/book-picker/` 7 张（浅色首访 / 词组书首页 / 学习卡例句 / 卡片背面例句 /
  切换弹框 / 暗色弹框 / 移动端弹框）

## 给下一会话的备注

- 设计/交互硬约定都在 `AGENTS.md`「不变式」一节与 `.workbuddy/memory/MEMORY.md`，改动卡片相关代码前先读
- **改动进度存储前先跑 `node scripts/check_migration.mjs`**；改动词书数据后必须 `npm run catalog` 重建三份产物
- 改完源码要 `npm run build` 重新导出 `out/`，否则 8773 静态预览看到的仍是旧版本
- 本地预览：`python -m http.server 8773 --directory out`（与 Next dev 不要同时开）
