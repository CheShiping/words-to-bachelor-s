# 会话进度日志

## 当前状态

**最后更新：** 2026-11-07
**当前功能：** 无进行中功能 —— feat-015「记忆卡片待复习词一键标为已掌握」已交付并验证

## 状态概览

### 已完成

- [x] 核心应用全部功能（feat-001 ~ feat-010）
- [x] Agent harness（feat-011）
- [x] 线上发布：https://cheshiping.github.io/words-to-bachelor-s/
- [x] 卡片切换链路收敛到 `useCardDeck`，横滚抖动问题已修复
- [x] **多词书架构 + 旧进度迁移（feat-012）**：进度按书分桶、v2→v3 无损迁移、清单驱动按需加载
- [x] **真题核心词组词书数据（feat-013）**：764 条 / 39 页 / 例句 / 标签分类，三文件幂等校验
- [x] **词书选择弹框与切换入口（feat-014）**：首访强制选择、localStorage 记忆、顶栏切换、各页适配
- [x] **记忆卡片待复习词一键掌握（feat-015）**：`review` 卡片底部「去沉浸学习」改为「✓ 标为已掌握」，
  点击写入 `mastered`（清复习排期、连对计数置 2）；`mastered` 卡片显示禁用完成态「✓ 已掌握」；
  按「待复习」筛选时卡片出池后索引自动收敛，队列清空显示空状态

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
- `FlashPage.markMastered` 目前按 `flash.status === "review"` 预判「新池减少 1 张」。
  若将来支持多状态并集筛选、或一次操作影响多张卡片，需改成通用的池长变化后索引归一化（`useEffect` clamp）。

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
- **状态按钮只替换待复习卡片**：需求原话是「待复习的单词…变成已掌握按钮」，
  故 `new` / `learning` 卡片仍保留「去沉浸学习」入口，`mastered` 卡片显示禁用完成态，避免误删原有跳转能力
- **写状态复用 `updateWordStatus`**：与沉浸学习页「已掌握」按钮完全同语义，首页统计、词库筛选、复习排期自动同步
- **新 CTA 复用 `.pill` + 柔和纯色**（`--pink-soft / --pink-light / --plum`），无渐变；暗色主题变量自动适配
- **状态变更不复制切卡逻辑**：仍只有 `useCardDeck` 一套动画与 busy 锁；标记掌握只是状态写入 + 索引夹取

## 本次会话修改的文件

- 修改：`components/BloomApp.jsx`（`FlashPage` 增加 `markMastered` 与三态按钮）、
  `app/globals.css`（`.flash-nav .pill.mastered-cta` 柔和纯色）
- 新增：`scripts/check_flash_mastered.mjs`（30 项 CDP 回归，自包含静态预览与 Chrome）
- 修改：`AGENTS.md`（不变式 + 验证命令）、`feature_list.json`、`progress.md`、`session-handoff.md`、`README.md`
- 生成：`out/` 重新静态导出；截图 `shots/flash-mastered/01~04`
- 未改：`public/data/` 三份词书数据、`components/userStorage.mjs`、`docs/` 两份词表 md

## 完成证据

- [x] `node scripts/check_flash_mastered.mjs`：真实 Chrome CDP 回归 **30/30 通过**
  （默认池待复习词显示新 CTA / 按待复习筛选 1/3 / 点击写 `mastered` + `reviewAt=null` + `correctStreak=2` /
  池 1/3→1/2→1/1→0/0 且自动落到下一张 / 队列清空无空白卡与残留按钮区 /
  已掌握态禁用 / 学习中态保留去沉浸学习 / 刷新持久化 / 首页统计 / 暗色无渐变 / 移动端不溢出 / 无 JS 异常）
- [x] `CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD=2000 ./init.sh`：完整门禁通过，三份词书数据一致，`out/index.html` 已重新导出
- [x] `npm run build`：静态导出成功（改动后、门禁前各跑一次）
- [x] 截图人工复核：`shots/flash-mastered/01-review-cta.png`（浅色新 CTA）、`02-after-click.png`、
  `03-mastered-and-learning.png`、`04-mobile.png`（暗色移动端完成态）
- [x] 历史证据：`node scripts/check_migration.mjs` 6/6、`node scripts/check_books_ui.mjs` 44/44、三文件 diff 幂等通过

## 给下一会话的备注

- 设计/交互硬约定都在 `AGENTS.md`「不变式」一节与 `.workbuddy/memory/MEMORY.md`，改动卡片相关代码前先读
- **改动进度存储前先跑 `node scripts/check_migration.mjs`**；改动词书数据后必须 `npm run catalog` 重建三份产物
- 改动记忆卡片状态按钮后跑 `node scripts/check_flash_mastered.mjs`（脚本会自动起静态预览，无需手工开服务）
- 改完源码要 `npm run build` 重新导出 `out/`，否则 8773 静态预览看到的仍是旧版本
- 本地预览：`python -m http.server 8773 --directory out`（与 Next dev 不要同时开）
