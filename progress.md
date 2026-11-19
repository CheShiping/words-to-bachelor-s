# 会话进度日志

## 当前状态

**最后更新：** 2026-11-19
**当前功能：** 无进行中功能 —— feat-017「4449 词书改为每 200 词一组分节」已交付并验证

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
- [x] **《你还在背单词吗》4449 词书接入（feat-016）**：PDF → Markdown（223 页 / 附录 A 用字对照 / 附录 B 原文备份），
  `parse_words_4449()` 生成 words-4449.json（词性派生 14 类、无音标例句），清单第三条 + init.sh 四文件校验；
  前端零改动，三书 61/61 CDP 断言通过
- [x] **4449 词书改为每 200 词一组分节（feat-017）**：正文按 23 组分节（22×200 + 49），
  解析器用独立 GROUP_RE_4449，附录 B 保留逐页原文；三书 61/61 断言通过，out/ 已重导出

### 进行中

-（空）

### 下一步

1. 新需求进来时：在 `feature_list.json` 追加条目，按「一次一个功能」推进
2. 可选清理：`scripts/_probe2.mjs`、`_swipe_diag.mjs`、`_swipe_verify2.mjs` 是历史滑动排查诊断脚本，确认无用后可删除（需用户确认）

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

## 文档产出（2026-11-12）

- 新增根目录 **`DESIGN_SYSTEM.md`**：归纳 `app/globals.css`（2,174 行 / 178 个类选择器）、
  `components/BloomApp.jsx`（WAAPI/GSAP 时序、手势阈值、花瓣参数）、`app/layout.jsx`（主题首帧）、
  以及 `AGENTS.md` / 项目记忆中的设计硬约定，共 13 节：定位 / 原则 / tokens / 玻璃材质 / 排版 /
  组件目录 / 状态色 / 动效三层 / 夜樱主题 / 响应式 / z-index / 无障碍 / 扩展约定与验证。
- 文档明确「渐变边界」：既有主 CTA、进度条、装饰渐变保留；**新增状态型 CTA 一律柔和纯色**，
  不自造高饱和色块或第二套按钮语言。
- 纯文档产出：未改动任何源码、样式、词书数据；`feature_list.json` 保持不变（功能唯一事实源，
  文档不占功能条目）。`out/` 由门禁重新导出，内容与基线一致。
- 验证：`CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD=2000 ./init.sh` 通过
  （三份词书数据一致、`npm run build` 成功、`out/index.html` 存在）。基线提交 `07b9b89`。

## feat-016 会话（2026-11-19）

### 目标
把用户提供的 `docs/2027专升本英语 你还在背单词吗.pdf`（223 页 / 4449 词）作为第三本词书接入，
复用已落地的清单驱动架构，前端零改动。

### PDF 分析与转换
- 按项目约定先把中文文件名复制到 ASCII 路径再交给 PDF CLI；`-f txt` + `-f structure` 双路交叉校验：
  txt 得 223 个页脚 / 446 个 `Word Meaning` 双栏表头，structure 得 223 sections / 446 tables，完全吻合。
- 版式：每页左栏「编号 + 英文单词」20 条（末页 9 条），右栏「编号 + 词性释义」；多义项分行。
- 校验结果：编号 1–4449 连续无缺；223 页 = 222×20 + 9；两栏按编号一一对应，0 异常页。
- 用字规范化：NFKC + 22 个 CJK 简化偏旁显式映射 + `戶→户`，共处理 137 个兼容字符；
  正文保留 `…`（599 处），附录 A 收录原字符/码位/规范字/出现次数，附录 B 保留 223 页逐页原文（字符未改动）。
- 生成 `docs/2027专升本英语你还在背单词吗.md`（737 KB / 21,486 行）：按页分节 3 列表格
  `# / Word / Meaning`，多义项用 `<br>` 分行，与词组书同构。

### 构建管线与数据
- `scripts/build_books.py`：新增 `MD_4449`、`POS_CATEGORY_4449`（15 个词性标签 → 14 类）、
  `parse_words_4449()`（复用 PAGE_RE / ROW_RE / APPENDIX_RE，校验 1–4449 连续 + 223 页），
  build() 第 3 步生成 words-4449.json，清单加第三条（hasSections=false / spellingEnabled=true / order=3）。
- `public/data/books/words-4449.json`：4449 词 / 223 页 / 14 类；每词含
  id/number/word/meaning/category/collectionId/collectionTitle；无音标、无例句。
- `catalog.json` 与 `phrases-764.json` 与改造前字节一致（git diff 为空）。
- `init.sh`：四文件幂等校验（`catalog.json` / `phrases-764.json` / `words-4449.json` / `index.json`），
  提示语同步为「四份词书数据一致」。

### 验证证据
- `node scripts/check_books_ui.mjs`：**61/61 通过**（原 44 项 + 新增 17 项）。
  新项覆盖：弹框三本 / 切第三本 / localStorage 记住 / 软重启回首页 / 词典库 223 页 4449 条 /
  分类「全部词性」含「名词」/ 释义无兼容字符与 `<br>` 字面量 / 沉浸学习分号合并释义且无音标例句 /
  学习写入独立书桶 / 记忆卡无例句 / 拼写题恢复 / 首页隐藏长期路径 / 进度隔离 / v2 迁移 / 暗色移动端 / 无 JS 异常。
  截图：`shots/book-picker/05b-4449-library.png`、`05c-4449-study.png`（另 `01-first-visit.png` 复核三书卡片风格）。
- `node scripts/check_migration.mjs`：6/6 通过（分桶逻辑未动，回归确认）。
- `CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD=2000 ./init.sh`：全门禁通过，四文件幂等 + build + out/ 重导出。
- 截图人工复核：第三本书卡沿用 `.journal-card` 玻璃底、`badge` pink-soft 徽章、`.path-bar`、`.pill` CTA，
  与第一本风格对称，无彩色左边框或高饱和块。

### 本次会话修改的文件
- 新增：`docs/2027专升本英语你还在背单词吗.md`、`public/data/books/words-4449.json`
- 修改：`scripts/build_books.py`、`scripts/check_books_ui.mjs`、`init.sh`、
  `public/data/books/index.json`、`feature_list.json`、`progress.md`、`README.md`、`AGENTS.md`、`session-handoff.md`
- 生成：`out/` 重新静态导出；截图 `shots/book-picker/05b、05c`
- 未改：`components/BloomApp.jsx`（清单驱动，前端零改动）、`components/userStorage.mjs`、
  `app/globals.css`、`catalog.json`、`phrases-764.json`

## feat-017 会话（2026-11-19）

### 目标
用户要求把 4449 词书的词集分节从每页 20 个改为每 200 个一组（先说 100，后改为 200）。

### 改动
- `docs/2027专升本英语你还在背单词吗.md`：正文按每 200 词一组重写为 23 组
  （22×200 + 末组 49，标题「第 N 组 · X–Y」），4449 条编号连续校验通过；
  附录 A（用字对照）不动，附录 B 仍保留原书 223 页逐页原文备份（字符未改动）。
- `scripts/build_books.py`：新增 `GROUP_RE_4449`（匹配「第 N 组」，与词组书 `PAGE_RE`「第 N 页」分开），
  `parse_words_4449()` 改按组解析、collection id 用 `group-NN`，并校验 23 组 + 每组词数 `[200]*22+[49]`；
  清单 description/subtitle 同步为「23 组 / 每 200 词」。
- `public/data/books/words-4449.json`：23 个 collection，`collectionCount` 经清单反映为 23。
- `scripts/check_books_ui.mjs`：断言由「223 页词集」改为「23 组词集」。
- 文档：README / AGENTS.md / session-handoff.md / feature_list.json / 项目记忆同步；前端零改动。

### 验证证据
- `npm run catalog`：words-4449 pages=23 words=4449；catalog.json 与 phrases-764.json git diff 为空。
- `node scripts/check_books_ui.mjs`：**61/61 通过**，词典库计数显示「共 23 组词集 · 筛选到 4449 个单词」，
  词卡徽章显示「第 1 组 · 1–200」；截图 `shots/book-picker/05b、05c` 人工复核通过。
- `CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD=2000 ./init.sh`：四文件幂等 + build + out/ 重导出全通过。

### 本次会话修改的文件
- 修改：`docs/2027专升本英语你还在背单词吗.md`、`scripts/build_books.py`、
  `scripts/check_books_ui.mjs`、`public/data/books/words-4449.json`、`public/data/books/index.json`、
  `feature_list.json`、`progress.md`、`README.md`、`AGENTS.md`、`session-handoff.md`、项目记忆
- 生成：`out/` 重新静态导出
- 未改：前端源码（BloomApp.jsx / userStorage.mjs / globals.css）、其余两本词书数据
